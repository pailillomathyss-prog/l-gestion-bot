import postgres from "postgres";
import { logger } from "../../lib/logger";

let _sql: ReturnType<typeof postgres> | null = null;
let _dbAvailable = false;

function getSql(): ReturnType<typeof postgres> | null {
  if (_sql) return _sql;
  const url = process.env["DATABASE_URL"];
  if (!url) return null;
  try {
    _sql = postgres(url, { max: 5, idle_timeout: 30 });
    _dbAvailable = true;
    return _sql;
  } catch {
    return null;
  }
}

const memXP      = new Map<string, XPRow>();
const memPunish  = new Map<string, PunishRow>();
const memState   = new Map<string, string>();
const memCoins   = new Map<string, number>();
const memGiveaway = new Map<string, GiveawayRow>();
const memQuest   = new Map<string, QuestProgressRow>();

function xpKey(g: string, u: string)   { return `${g}:${u}`; }
function punKey(g: string, u: string)  { return `${g}:${u}`; }
function coinKey(g: string, u: string) { return `${g}:${u}`; }
function questKey(g: string, u: string){ return `${g}:${u}`; }

export async function ensureTables() {
  const sql = getSql();
  if (!sql) {
    logger.warn("DATABASE_URL absent — fonctionnement en mémoire (données non persistées)");
    return;
  }
  await sql`CREATE TABLE IF NOT EXISTS xp_data (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 0,
    last_message BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id))`;
  await sql`CREATE TABLE IF NOT EXISTS punishments (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
    roles TEXT NOT NULL DEFAULT '[]', punished_at BIGINT NOT NULL DEFAULT 0,
    expires_at BIGINT NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (guild_id, user_id))`;
  await sql`CREATE TABLE IF NOT EXISTS bot_state (
    key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS coins (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id))`;
  await sql`CREATE TABLE IF NOT EXISTS giveaways (
    id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL, message_id TEXT,
    prize TEXT NOT NULL, ends_at BIGINT NOT NULL,
    ended BOOLEAN NOT NULL DEFAULT false,
    winner_id TEXT DEFAULT NULL,
    participants TEXT NOT NULL DEFAULT '[]')`;
  await sql`CREATE TABLE IF NOT EXISTS quest_state (
    guild_id TEXT PRIMARY KEY,
    quest_id TEXT NOT NULL,
    quest_label TEXT NOT NULL,
    quest_type TEXT NOT NULL,
    quest_target INTEGER NOT NULL,
    quest_reward INTEGER NOT NULL,
    started_at BIGINT NOT NULL,
    ends_at BIGINT NOT NULL DEFAULT 0,
    message_id TEXT DEFAULT NULL)`;
  await sql`ALTER TABLE quest_state ADD COLUMN IF NOT EXISTS ends_at BIGINT NOT NULL DEFAULT 0`;
  await sql`CREATE TABLE IF NOT EXISTS quest_progress (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
    quest_id TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    claimed BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (guild_id, user_id))`;
  await sql`CREATE TABLE IF NOT EXISTS user_stats (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
    messages_total INTEGER NOT NULL DEFAULT 0,
    duels_won INTEGER NOT NULL DEFAULT 0,
    coins_earned_total INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id))`;
  await sql`CREATE TABLE IF NOT EXISTS user_badges (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
    badge_id TEXT NOT NULL,
    awarded_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, badge_id))`;
  await sql`CREATE TABLE IF NOT EXISTS daily_rewards (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
    last_claim BIGINT NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id))`;
  await sql`CREATE TABLE IF NOT EXISTS monthly_events (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    target INTEGER NOT NULL,
    reward_coins INTEGER NOT NULL,
    started_at BIGINT NOT NULL,
    ends_at BIGINT NOT NULL,
    ended BOOLEAN NOT NULL DEFAULT false,
    message_id TEXT DEFAULT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS monthly_event_progress (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    claimed BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (guild_id, user_id))`;
  logger.info("✅ Tables DB vérifiées / créées");
}

// ── XP ────────────────────────────────────────────────────────────────────────
export interface XPRow { xp: number; level: number; lastMessage: number; }

export async function getXP(guildId: string, userId: string): Promise<XPRow> {
  const sql = getSql();
  if (!sql) return memXP.get(xpKey(guildId, userId)) ?? { xp: 0, level: 0, lastMessage: 0 };
  const rows = await sql<{ xp: number; level: number; last_message: string }[]>`
    SELECT xp, level, last_message FROM xp_data WHERE guild_id=${guildId} AND user_id=${userId}`;
  if (!rows[0]) return { xp: 0, level: 0, lastMessage: 0 };
  return { xp: rows[0].xp, level: rows[0].level, lastMessage: Number(rows[0].last_message) };
}

export async function upsertXP(guildId: string, userId: string, xp: number, level: number, lastMessage: number) {
  const sql = getSql();
  if (!sql) { memXP.set(xpKey(guildId, userId), { xp, level, lastMessage }); return; }
  await sql`INSERT INTO xp_data (guild_id,user_id,xp,level,last_message) VALUES (${guildId},${userId},${xp},${level},${lastMessage})
    ON CONFLICT (guild_id,user_id) DO UPDATE SET xp=${xp}, level=${level}, last_message=${lastMessage}`;
}

export async function getAllXP(guildId: string): Promise<Array<{ userId: string } & XPRow>> {
  const sql = getSql();
  if (!sql) {
    return [...memXP.entries()].filter(([k]) => k.startsWith(`${guildId}:`))
      .map(([k, v]) => ({ userId: k.split(":")[1], ...v })).sort((a, b) => b.xp - a.xp);
  }
  const rows = await sql<{ user_id: string; xp: number; level: number; last_message: string }[]>`
    SELECT user_id,xp,level,last_message FROM xp_data WHERE guild_id=${guildId} ORDER BY xp DESC`;
  return rows.map(r => ({ userId: r.user_id, xp: r.xp, level: r.level, lastMessage: Number(r.last_message) }));
}

// ── Punishments ───────────────────────────────────────────────────────────────
export interface PunishRow { roles: string[]; punishedAt: number; expiresAt: number; reason: string; }

export async function getPunishment(guildId: string, userId: string): Promise<PunishRow | null> {
  const sql = getSql();
  if (!sql) return memPunish.get(punKey(guildId, userId)) ?? null;
  const rows = await sql<{ roles: string; punished_at: string; expires_at: string; reason: string }[]>`
    SELECT roles,punished_at,expires_at,reason FROM punishments WHERE guild_id=${guildId} AND user_id=${userId}`;
  if (!rows[0]) return null;
  return { roles: JSON.parse(rows[0].roles), punishedAt: Number(rows[0].punished_at), expiresAt: Number(rows[0].expires_at), reason: rows[0].reason };
}

export async function setPunishment(guildId: string, userId: string, record: PunishRow) {
  const sql = getSql();
  if (!sql) { memPunish.set(punKey(guildId, userId), record); return; }
  await sql`INSERT INTO punishments (guild_id,user_id,roles,punished_at,expires_at,reason)
    VALUES (${guildId},${userId},${JSON.stringify(record.roles)},${record.punishedAt},${record.expiresAt},${record.reason})
    ON CONFLICT (guild_id,user_id) DO UPDATE SET roles=${JSON.stringify(record.roles)},
    punished_at=${record.punishedAt}, expires_at=${record.expiresAt}, reason=${record.reason}`;
}

export async function deletePunishment(guildId: string, userId: string) {
  const sql = getSql();
  if (!sql) { memPunish.delete(punKey(guildId, userId)); return; }
  await sql`DELETE FROM punishments WHERE guild_id=${guildId} AND user_id=${userId}`;
}

export async function getAllPunishments(): Promise<Array<{ guildId: string; userId: string } & PunishRow>> {
  const sql = getSql();
  if (!sql) return [...memPunish.entries()].map(([k, v]) => { const [g, u] = k.split(":"); return { guildId: g, userId: u, ...v }; });
  const rows = await sql<{ guild_id: string; user_id: string; roles: string; punished_at: string; expires_at: string; reason: string }[]>`SELECT * FROM punishments`;
  return rows.map(r => ({ guildId: r.guild_id, userId: r.user_id, roles: JSON.parse(r.roles), punishedAt: Number(r.punished_at), expiresAt: Number(r.expires_at), reason: r.reason }));
}

// ── Bot state ─────────────────────────────────────────────────────────────────
export async function getState(key: string): Promise<string | null> {
  const sql = getSql();
  if (!sql) return memState.get(key) ?? null;
  const rows = await sql<{ value: string }[]>`SELECT value FROM bot_state WHERE key=${key}`;
  return rows[0]?.value ?? null;
}

export async function setState(key: string, value: string) {
  const sql = getSql();
  if (!sql) { memState.set(key, value); return; }
  await sql`INSERT INTO bot_state (key,value) VALUES (${key},${value}) ON CONFLICT (key) DO UPDATE SET value=${value}`;
}

// ── Coins ─────────────────────────────────────────────────────────────────────
export async function getCoins(guildId: string, userId: string): Promise<number> {
  const sql = getSql();
  if (!sql) return memCoins.get(coinKey(guildId, userId)) ?? 0;
  const rows = await sql<{ balance: number }[]>`SELECT balance FROM coins WHERE guild_id=${guildId} AND user_id=${userId}`;
  return rows[0]?.balance ?? 0;
}

export async function addCoins(guildId: string, userId: string, amount: number): Promise<number> {
  const sql = getSql();
  if (!sql) {
    const cur = memCoins.get(coinKey(guildId, userId)) ?? 0;
    const next = Math.max(0, cur + amount);
    memCoins.set(coinKey(guildId, userId), next);
    return next;
  }
  const rows = await sql<{ balance: number }[]>`
    INSERT INTO coins (guild_id,user_id,balance) VALUES (${guildId},${userId},${Math.max(0, amount)})
    ON CONFLICT (guild_id,user_id) DO UPDATE SET balance=GREATEST(0, coins.balance+${amount})
    RETURNING balance`;
  return rows[0]?.balance ?? 0;
}

// ── Giveaways ─────────────────────────────────────────────────────────────────
export interface GiveawayRow {
  id: number; guildId: string; channelId: string; messageId: string | null;
  prize: string; endsAt: number; ended: boolean; winnerId: string | null; participants: string[];
}

export async function createGiveaway(guildId: string, channelId: string, prize: string, endsAt: number): Promise<number> {
  const sql = getSql();
  if (!sql) {
    const id = Date.now();
    memGiveaway.set(String(id), { id, guildId, channelId, messageId: null, prize, endsAt, ended: false, winnerId: null, participants: [] });
    return id;
  }
  const rows = await sql<{ id: number }[]>`
    INSERT INTO giveaways (guild_id,channel_id,prize,ends_at) VALUES (${guildId},${channelId},${prize},${endsAt}) RETURNING id`;
  return rows[0].id;
}

export async function updateGiveawayMessage(id: number, messageId: string) {
  const sql = getSql();
  if (!sql) { const g = memGiveaway.get(String(id)); if (g) g.messageId = messageId; return; }
  await sql`UPDATE giveaways SET message_id=${messageId} WHERE id=${id}`;
}

export async function joinGiveaway(id: number, userId: string): Promise<boolean> {
  const sql = getSql();
  if (!sql) {
    const g = memGiveaway.get(String(id));
    if (!g || g.ended || g.participants.includes(userId)) return false;
    g.participants.push(userId); return true;
  }
  const rows = await sql<{ participants: string }[]>`SELECT participants FROM giveaways WHERE id=${id} AND ended=false`;
  if (!rows[0]) return false;
  const parts: string[] = JSON.parse(rows[0].participants);
  if (parts.includes(userId)) return false;
  parts.push(userId);
  await sql`UPDATE giveaways SET participants=${JSON.stringify(parts)} WHERE id=${id}`;
  return true;
}

export async function endGiveaway(id: number, winnerId: string | null) {
  const sql = getSql();
  if (!sql) { const g = memGiveaway.get(String(id)); if (g) { g.ended = true; g.winnerId = winnerId; } return; }
  await sql`UPDATE giveaways SET ended=true, winner_id=${winnerId} WHERE id=${id}`;
}

export async function getActiveGiveaways(): Promise<GiveawayRow[]> {
  const sql = getSql();
  if (!sql) return [...memGiveaway.values()].filter(g => !g.ended);
  const rows = await sql<{ id: number; guild_id: string; channel_id: string; message_id: string | null; prize: string; ends_at: string; ended: boolean; winner_id: string | null; participants: string }[]>`
    SELECT * FROM giveaways WHERE ended=false`;
  return rows.map(r => ({ id: r.id, guildId: r.guild_id, channelId: r.channel_id, messageId: r.message_id, prize: r.prize, endsAt: Number(r.ends_at), ended: r.ended, winnerId: r.winner_id, participants: JSON.parse(r.participants) }));
}

// ── Quest state (global per guild) ───────────────────────────────────────────
export interface QuestStateRow { questId: string; questLabel: string; questType: string; questTarget: number; questReward: number; startedAt: number; endsAt: number; messageId: string | null; }

export async function getQuestState(guildId: string): Promise<QuestStateRow | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql<{ quest_id: string; quest_label: string; quest_type: string; quest_target: number; quest_reward: number; started_at: string; ends_at: string; message_id: string | null }[]>`
    SELECT * FROM quest_state WHERE guild_id=${guildId}`;
  if (!rows[0]) return null;
  const startedAt = Number(rows[0].started_at);
  const endsAt = Number(rows[0].ends_at) || (startedAt + 12 * 60 * 60 * 1000);
  return { questId: rows[0].quest_id, questLabel: rows[0].quest_label, questType: rows[0].quest_type, questTarget: rows[0].quest_target, questReward: rows[0].quest_reward, startedAt, endsAt, messageId: rows[0].message_id };
}

export async function setQuestState(guildId: string, q: QuestStateRow) {
  const sql = getSql();
  if (!sql) return;
  await sql`INSERT INTO quest_state (guild_id,quest_id,quest_label,quest_type,quest_target,quest_reward,started_at,ends_at,message_id)
    VALUES (${guildId},${q.questId},${q.questLabel},${q.questType},${q.questTarget},${q.questReward},${q.startedAt},${q.endsAt},${q.messageId})
    ON CONFLICT (guild_id) DO UPDATE SET quest_id=${q.questId}, quest_label=${q.questLabel}, quest_type=${q.questType},
    quest_target=${q.questTarget}, quest_reward=${q.questReward}, started_at=${q.startedAt}, ends_at=${q.endsAt}, message_id=${q.messageId}`;
}

export async function updateQuestMessageId(guildId: string, messageId: string) {
  const sql = getSql();
  if (!sql) return;
  await sql`UPDATE quest_state SET message_id=${messageId} WHERE guild_id=${guildId}`;
}

// ── Quest progress (per user) ─────────────────────────────────────────────────
export interface QuestProgressRow { progress: number; claimed: boolean; questId: string; }

export async function getQuestProgress(guildId: string, userId: string): Promise<QuestProgressRow | null> {
  const sql = getSql();
  if (!sql) return memQuest.get(questKey(guildId, userId)) ?? null;
  const rows = await sql<{ progress: number; claimed: boolean; quest_id: string }[]>`
    SELECT progress,claimed,quest_id FROM quest_progress WHERE guild_id=${guildId} AND user_id=${userId}`;
  if (!rows[0]) return null;
  return { progress: rows[0].progress, claimed: rows[0].claimed, questId: rows[0].quest_id };
}

export async function upsertQuestProgress(guildId: string, userId: string, questId: string, progress: number, claimed: boolean) {
  const sql = getSql();
  if (!sql) { memQuest.set(questKey(guildId, userId), { progress, claimed, questId }); return; }
  await sql`INSERT INTO quest_progress (guild_id,user_id,quest_id,progress,claimed)
    VALUES (${guildId},${userId},${questId},${progress},${claimed})
    ON CONFLICT (guild_id,user_id) DO UPDATE SET quest_id=${questId}, progress=${progress}, claimed=${claimed}`;
}

export async function getAllQuestProgress(guildId: string, questId: string): Promise<Array<{ userId: string; progress: number; claimed: boolean }>> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql<{ user_id: string; progress: number; claimed: boolean }[]>`
    SELECT user_id,progress,claimed FROM quest_progress WHERE guild_id=${guildId} AND quest_id=${questId} AND progress > 0 ORDER BY progress DESC LIMIT 10`;
  return rows.map(r => ({ userId: r.user_id, progress: r.progress, claimed: r.claimed }));
}

// ── User stats (badges) ───────────────────────────────────────────────────────
export interface UserStats { messagesTotal: number; duelsWon: number; coinsEarnedTotal: number; }
const memStats = new Map<string, UserStats>();

export async function getUserStats(guildId: string, userId: string): Promise<UserStats> {
  const sql = getSql();
  if (!sql) return memStats.get(`${guildId}:${userId}`) ?? { messagesTotal: 0, duelsWon: 0, coinsEarnedTotal: 0 };
  const rows = await sql<{ messages_total: number; duels_won: number; coins_earned_total: number }[]>`
    SELECT messages_total,duels_won,coins_earned_total FROM user_stats WHERE guild_id=${guildId} AND user_id=${userId}`;
  if (!rows[0]) return { messagesTotal: 0, duelsWon: 0, coinsEarnedTotal: 0 };
  return { messagesTotal: rows[0].messages_total, duelsWon: rows[0].duels_won, coinsEarnedTotal: rows[0].coins_earned_total };
}

export async function incrementStat(guildId: string, userId: string, stat: "messages_total" | "duels_won" | "coins_earned_total", amount: number): Promise<UserStats> {
  const sql = getSql();
  if (!sql) {
    const key = `${guildId}:${userId}`;
    const cur = memStats.get(key) ?? { messagesTotal: 0, duelsWon: 0, coinsEarnedTotal: 0 };
    if (stat === "messages_total") cur.messagesTotal += amount;
    else if (stat === "duels_won") cur.duelsWon += amount;
    else cur.coinsEarnedTotal += amount;
    memStats.set(key, cur);
    return cur;
  }
  const col = stat === "messages_total" ? sql`messages_total` : stat === "duels_won" ? sql`duels_won` : sql`coins_earned_total`;
  await sql`INSERT INTO user_stats (guild_id,user_id,${col}) VALUES (${guildId},${userId},${amount})
    ON CONFLICT (guild_id,user_id) DO UPDATE SET ${col}=user_stats.${col}+${amount}`;
  return getUserStats(guildId, userId);
}

// ── User badges ───────────────────────────────────────────────────────────────
const memBadges = new Map<string, Set<string>>();

export async function getUserBadges(guildId: string, userId: string): Promise<string[]> {
  const sql = getSql();
  if (!sql) return [...(memBadges.get(`${guildId}:${userId}`) ?? new Set())];
  const rows = await sql<{ badge_id: string }[]>`SELECT badge_id FROM user_badges WHERE guild_id=${guildId} AND user_id=${userId}`;
  return rows.map(r => r.badge_id);
}

export async function addUserBadge(guildId: string, userId: string, badgeId: string): Promise<void> {
  const sql = getSql();
  if (!sql) {
    const key = `${guildId}:${userId}`;
    const s = memBadges.get(key) ?? new Set<string>();
    s.add(badgeId); memBadges.set(key, s); return;
  }
  await sql`INSERT INTO user_badges (guild_id,user_id,badge_id,awarded_at) VALUES (${guildId},${userId},${badgeId},${Date.now()}) ON CONFLICT DO NOTHING`;
}

// ── Daily rewards ─────────────────────────────────────────────────────────────
export interface DailyRow { lastClaim: number; streak: number; }
const memDaily = new Map<string, DailyRow>();

export async function getDailyReward(guildId: string, userId: string): Promise<DailyRow | null> {
  const sql = getSql();
  if (!sql) return memDaily.get(`${guildId}:${userId}`) ?? null;
  const rows = await sql<{ last_claim: string; streak: number }[]>`SELECT last_claim,streak FROM daily_rewards WHERE guild_id=${guildId} AND user_id=${userId}`;
  if (!rows[0]) return null;
  return { lastClaim: Number(rows[0].last_claim), streak: rows[0].streak };
}

export async function setDailyReward(guildId: string, userId: string, data: DailyRow): Promise<void> {
  const sql = getSql();
  if (!sql) { memDaily.set(`${guildId}:${userId}`, data); return; }
  await sql`INSERT INTO daily_rewards (guild_id,user_id,last_claim,streak) VALUES (${guildId},${userId},${data.lastClaim},${data.streak})
    ON CONFLICT (guild_id,user_id) DO UPDATE SET last_claim=${data.lastClaim}, streak=${data.streak}`;
}
