import postgres from "postgres";
import { logger } from "../../lib/logger";

let _sql: ReturnType<typeof postgres> | null = null;

function getSql(): ReturnType<typeof postgres> | null {
  if (_sql) return _sql;
  const url = process.env["DATABASE_URL"];
  if (!url) return null;
  try {
    _sql = postgres(url, { max: 5, idle_timeout: 30 });
    return _sql;
  } catch {
    return null;
  }
}

// ── In-memory fallback ─────────────────────────────────────────────────────────
const memXP       = new Map<string, XPRow>();
const memCoins    = new Map<string, number>();
const memGiveaway = new Map<string, GiveawayRow>();
const memState    = new Map<string, string>();
const memDaily    = new Map<string, DailyRow>();

function xpKey(g: string, u: string)   { return `${g}:${u}`; }
function coinKey(g: string, u: string) { return `${g}:${u}`; }
function dailyKey(g: string, u: string){ return `${g}:${u}`; }

// ── Types ──────────────────────────────────────────────────────────────────────
export interface XPRow {
  userId: string;
  xp: number;
  level: number;
  lastMessage: number;
}

export interface GiveawayRow {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  prize: string;
  endsAt: number;
  participants: string[];
  ended: boolean;
  winner: string | null;
}

export interface DailyRow {
  lastClaim: number;
  streak: number;
}

// ── Table creation ─────────────────────────────────────────────────────────────
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
  await sql`CREATE TABLE IF NOT EXISTS coins (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id))`;
  await sql`CREATE TABLE IF NOT EXISTS giveaways (
    id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
    message_id TEXT, prize TEXT NOT NULL,
    ends_at BIGINT NOT NULL, participants TEXT NOT NULL DEFAULT '[]',
    ended BOOLEAN NOT NULL DEFAULT FALSE, winner TEXT)`;
  await sql`CREATE TABLE IF NOT EXISTS bot_state (
    key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS daily_rewards (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
    last_claim BIGINT NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id))`;
  logger.info("Tables DB vérifiées/créées");
}

// ── XP ─────────────────────────────────────────────────────────────────────────
export async function getXP(guildId: string, userId: string): Promise<XPRow> {
  const sql = getSql();
  if (sql) {
    const rows = await sql<XPRow[]>`
      SELECT user_id as "userId", xp, level, last_message as "lastMessage"
      FROM xp_data WHERE guild_id=${guildId} AND user_id=${userId}`;
    return rows[0] ?? { userId, xp: 0, level: 0, lastMessage: 0 };
  }
  return memXP.get(xpKey(guildId, userId)) ?? { userId, xp: 0, level: 0, lastMessage: 0 };
}

export async function upsertXP(guildId: string, userId: string, xp: number, level: number, lastMessage: number) {
  const sql = getSql();
  if (sql) {
    await sql`INSERT INTO xp_data (guild_id, user_id, xp, level, last_message)
      VALUES (${guildId}, ${userId}, ${xp}, ${level}, ${lastMessage})
      ON CONFLICT (guild_id, user_id) DO UPDATE SET xp=${xp}, level=${level}, last_message=${lastMessage}`;
  } else {
    memXP.set(xpKey(guildId, userId), { userId, xp, level, lastMessage });
  }
}

export async function getAllXP(guildId: string): Promise<XPRow[]> {
  const sql = getSql();
  if (sql) {
    return sql<XPRow[]>`
      SELECT user_id as "userId", xp, level, last_message as "lastMessage"
      FROM xp_data WHERE guild_id=${guildId} ORDER BY xp DESC`;
  }
  return [...memXP.entries()]
    .filter(([k]) => k.startsWith(`${guildId}:`))
    .map(([, v]) => v)
    .sort((a, b) => b.xp - a.xp);
}

// ── Coins ──────────────────────────────────────────────────────────────────────
export async function getCoins(guildId: string, userId: string): Promise<number> {
  const sql = getSql();
  if (sql) {
    const rows = await sql<{ amount: number }[]>`
      SELECT amount FROM coins WHERE guild_id=${guildId} AND user_id=${userId}`;
    return rows[0]?.amount ?? 0;
  }
  return memCoins.get(coinKey(guildId, userId)) ?? 0;
}

export async function addCoins(guildId: string, userId: string, delta: number): Promise<number> {
  const sql = getSql();
  if (sql) {
    const rows = await sql<{ amount: number }[]>`
      INSERT INTO coins (guild_id, user_id, amount) VALUES (${guildId}, ${userId}, ${Math.max(0, delta)})
      ON CONFLICT (guild_id, user_id) DO UPDATE SET amount = GREATEST(0, coins.amount + ${delta})
      RETURNING amount`;
    return rows[0]?.amount ?? 0;
  }
  const cur = memCoins.get(coinKey(guildId, userId)) ?? 0;
  const next = Math.max(0, cur + delta);
  memCoins.set(coinKey(guildId, userId), next);
  return next;
}

// ── Giveaways ──────────────────────────────────────────────────────────────────
export async function createGiveaway(row: GiveawayRow): Promise<void> {
  const sql = getSql();
  if (sql) {
    await sql`INSERT INTO giveaways (id, guild_id, channel_id, message_id, prize, ends_at, participants, ended, winner)
      VALUES (${row.id}, ${row.guildId}, ${row.channelId}, ${row.messageId}, ${row.prize},
              ${row.endsAt}, ${JSON.stringify(row.participants)}, ${row.ended}, ${row.winner})`;
  } else {
    memGiveaway.set(row.id, row);
  }
}

export async function updateGiveawayMessage(id: string, messageId: string): Promise<void> {
  const sql = getSql();
  if (sql) {
    await sql`UPDATE giveaways SET message_id=${messageId} WHERE id=${id}`;
  } else {
    const g = memGiveaway.get(id);
    if (g) memGiveaway.set(id, { ...g, messageId });
  }
}

export async function joinGiveaway(id: string, userId: string): Promise<string[]> {
  const sql = getSql();
  if (sql) {
    const rows = await sql<{ participants: string }[]>`SELECT participants FROM giveaways WHERE id=${id}`;
    if (!rows[0]) return [];
    const parts: string[] = JSON.parse(rows[0].participants);
    if (!parts.includes(userId)) {
      parts.push(userId);
      await sql`UPDATE giveaways SET participants=${JSON.stringify(parts)} WHERE id=${id}`;
    }
    return parts;
  }
  const g = memGiveaway.get(id);
  if (!g) return [];
  if (!g.participants.includes(userId)) g.participants.push(userId);
  return g.participants;
}

export async function endGiveaway(id: string, winner: string | null): Promise<void> {
  const sql = getSql();
  if (sql) {
    await sql`UPDATE giveaways SET ended=true, winner=${winner} WHERE id=${id}`;
  } else {
    const g = memGiveaway.get(id);
    if (g) memGiveaway.set(id, { ...g, ended: true, winner });
  }
}

export async function getActiveGiveaways(): Promise<GiveawayRow[]> {
  const sql = getSql();
  if (sql) {
    const rows = await sql<any[]>`SELECT id, guild_id, channel_id, message_id, prize, ends_at, participants, ended, winner FROM giveaways WHERE ended=false`;
    return rows.map(r => ({
      id: r.id, guildId: r.guild_id, channelId: r.channel_id, messageId: r.message_id,
      prize: r.prize, endsAt: Number(r.ends_at), participants: JSON.parse(r.participants),
      ended: r.ended, winner: r.winner,
    }));
  }
  return [...memGiveaway.values()].filter(g => !g.ended);
}

// ── State (key-value) ──────────────────────────────────────────────────────────
export async function getState(key: string): Promise<string | null> {
  const sql = getSql();
  if (sql) {
    const rows = await sql<{ value: string }[]>`SELECT value FROM bot_state WHERE key=${key}`;
    return rows[0]?.value ?? null;
  }
  return memState.get(key) ?? null;
}

export async function setState(key: string, value: string): Promise<void> {
  const sql = getSql();
  if (sql) {
    await sql`INSERT INTO bot_state (key, value) VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value=${value}`;
  } else {
    memState.set(key, value);
  }
}

// ── Daily rewards ──────────────────────────────────────────────────────────────
export async function getDailyReward(guildId: string, userId: string): Promise<DailyRow | null> {
  const sql = getSql();
  if (sql) {
    const rows = await sql<{ last_claim: string; streak: number }[]>`
      SELECT last_claim, streak FROM daily_rewards WHERE guild_id=${guildId} AND user_id=${userId}`;
    if (!rows[0]) return null;
    return { lastClaim: Number(rows[0].last_claim), streak: rows[0].streak };
  }
  return memDaily.get(dailyKey(guildId, userId)) ?? null;
}

export async function setDailyReward(guildId: string, userId: string, data: DailyRow): Promise<void> {
  const sql = getSql();
  if (sql) {
    await sql`INSERT INTO daily_rewards (guild_id, user_id, last_claim, streak)
      VALUES (${guildId}, ${userId}, ${data.lastClaim}, ${data.streak})
      ON CONFLICT (guild_id, user_id) DO UPDATE SET last_claim=${data.lastClaim}, streak=${data.streak}`;
  } else {
    memDaily.set(dailyKey(guildId, userId), data);
  }
}
