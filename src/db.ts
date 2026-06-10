import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

function getDb() {
  if (sql) return sql;
  const url = process.env["DATABASE_URL"];
  if (!url) return null;
  try { sql = postgres(url, { max: 5, idle_timeout: 30 }); return sql; } catch { return null; }
}

// ── In-memory fallback ────────────────────────────────────────────────────────
const memUsers = new Map<string, UserRow>();
const memPunish = new Map<string, PunishRow>();
const memGiveaway = new Map<number, GiveawayRow>();
const memState = new Map<string, string>();
let giveawayIdSeq = 1;

export interface UserRow {
  xp: number; level: number; coins: number;
  lastMsgTs: number; lastVoiceTs: number;
}
export interface PunishRow {
  roles: string[]; expiresAt: number; reason: string;
}
export interface GiveawayRow {
  id: number; guildId: string; channelId: string; messageId: string | null;
  prize: string; endsAt: number; ended: boolean;
  participants: string[];
}

function uKey(g: string, u: string) { return `${g}:${u}`; }

// ── Schema ────────────────────────────────────────────────────────────────────
export async function initDb() {
  const db = getDb();
  if (!db) { console.warn("⚠️  DATABASE_URL absent — données en mémoire (non persistées)"); return; }
  await db`CREATE TABLE IF NOT EXISTS users (
    guild_id TEXT, user_id TEXT,
    xp INT NOT NULL DEFAULT 0, level INT NOT NULL DEFAULT 0,
    coins INT NOT NULL DEFAULT 0,
    last_msg_ts BIGINT NOT NULL DEFAULT 0,
    last_voice_ts BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id))`;
  await db`CREATE TABLE IF NOT EXISTS punishments (
    guild_id TEXT, user_id TEXT,
    roles TEXT NOT NULL DEFAULT '[]',
    expires_at BIGINT NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (guild_id, user_id))`;
  await db`CREATE TABLE IF NOT EXISTS giveaways (
    id SERIAL PRIMARY KEY, guild_id TEXT, channel_id TEXT,
    message_id TEXT, prize TEXT, ends_at BIGINT, ended BOOLEAN DEFAULT FALSE,
    participants TEXT NOT NULL DEFAULT '[]')`;
  await db`CREATE TABLE IF NOT EXISTS bot_state (key TEXT PRIMARY KEY, value TEXT)`;
  console.log("✅ DB initialisée");
}

// ── Users ─────────────────────────────────────────────────────────────────────
export async function getUser(guildId: string, userId: string): Promise<UserRow> {
  const db = getDb();
  if (db) {
    const rows = await db<UserRow[]>`SELECT xp, level, coins, last_msg_ts AS "lastMsgTs", last_voice_ts AS "lastVoiceTs" FROM users WHERE guild_id=${guildId} AND user_id=${userId}`;
    if (rows.length) return rows[0]!;
    return { xp: 0, level: 0, coins: 0, lastMsgTs: 0, lastVoiceTs: 0 };
  }
  return memUsers.get(uKey(guildId, userId)) ?? { xp: 0, level: 0, coins: 0, lastMsgTs: 0, lastVoiceTs: 0 };
}

export async function saveUser(guildId: string, userId: string, data: UserRow) {
  const db = getDb();
  if (db) {
    await db`INSERT INTO users (guild_id, user_id, xp, level, coins, last_msg_ts, last_voice_ts)
      VALUES (${guildId}, ${userId}, ${data.xp}, ${data.level}, ${data.coins}, ${data.lastMsgTs}, ${data.lastVoiceTs})
      ON CONFLICT (guild_id, user_id) DO UPDATE SET xp=${data.xp}, level=${data.level}, coins=${data.coins}, last_msg_ts=${data.lastMsgTs}, last_voice_ts=${data.lastVoiceTs}`;
  } else {
    memUsers.set(uKey(guildId, userId), data);
  }
}

export async function getTopUsers(guildId: string, limit = 10): Promise<Array<{ userId: string } & UserRow>> {
  const db = getDb();
  if (db) {
    const rows = await db<Array<{ user_id: string; xp: number; level: number; coins: number; last_msg_ts: number; last_voice_ts: number }>>`
      SELECT user_id, xp, level, coins, last_msg_ts, last_voice_ts FROM users WHERE guild_id=${guildId} ORDER BY xp DESC LIMIT ${limit}`;
    return rows.map(r => ({ userId: r.user_id, xp: r.xp, level: r.level, coins: r.coins, lastMsgTs: r.last_msg_ts, lastVoiceTs: r.last_voice_ts }));
  }
  return [...memUsers.entries()]
    .filter(([k]) => k.startsWith(guildId + ":"))
    .map(([k, v]) => ({ userId: k.split(":")[1]!, ...v }))
    .sort((a, b) => b.xp - a.xp).slice(0, limit);
}

// ── Punishments ───────────────────────────────────────────────────────────────
export async function getPunish(guildId: string, userId: string): Promise<PunishRow | null> {
  const db = getDb();
  if (db) {
    const rows = await db<Array<{ roles: string; expires_at: number; reason: string }>>`SELECT roles, expires_at, reason FROM punishments WHERE guild_id=${guildId} AND user_id=${userId}`;
    if (!rows.length) return null;
    return { roles: JSON.parse(rows[0]!.roles), expiresAt: rows[0]!.expires_at, reason: rows[0]!.reason };
  }
  return memPunish.get(uKey(guildId, userId)) ?? null;
}

export async function setPunish(guildId: string, userId: string, data: PunishRow) {
  const db = getDb();
  if (db) {
    await db`INSERT INTO punishments (guild_id, user_id, roles, expires_at, reason)
      VALUES (${guildId}, ${userId}, ${JSON.stringify(data.roles)}, ${data.expiresAt}, ${data.reason})
      ON CONFLICT (guild_id, user_id) DO UPDATE SET roles=${JSON.stringify(data.roles)}, expires_at=${data.expiresAt}, reason=${data.reason}`;
  } else {
    memPunish.set(uKey(guildId, userId), data);
  }
}

export async function delPunish(guildId: string, userId: string) {
  const db = getDb();
  if (db) await db`DELETE FROM punishments WHERE guild_id=${guildId} AND user_id=${userId}`;
  else memPunish.delete(uKey(guildId, userId));
}

export async function getAllPunishments(): Promise<Array<{ guildId: string; userId: string } & PunishRow>> {
  const db = getDb();
  if (db) {
    const rows = await db<Array<{ guild_id: string; user_id: string; roles: string; expires_at: number; reason: string }>>`SELECT * FROM punishments`;
    return rows.map(r => ({ guildId: r.guild_id, userId: r.user_id, roles: JSON.parse(r.roles), expiresAt: r.expires_at, reason: r.reason }));
  }
  return [...memPunish.entries()].map(([k, v]) => {
    const [guildId, userId] = k.split(":") as [string, string];
    return { guildId, userId, ...v };
  });
}

// ── Giveaways ─────────────────────────────────────────────────────────────────
export async function createGiveaway(g: Omit<GiveawayRow, "id" | "ended" | "participants">): Promise<number> {
  const db = getDb();
  if (db) {
    const rows = await db<[{ id: number }]>`INSERT INTO giveaways (guild_id, channel_id, message_id, prize, ends_at, ended, participants) VALUES (${g.guildId}, ${g.channelId}, ${g.messageId}, ${g.prize}, ${g.endsAt}, FALSE, '[]') RETURNING id`;
    return rows[0]!.id;
  }
  const id = giveawayIdSeq++;
  memGiveaway.set(id, { ...g, id, ended: false, participants: [] });
  return id;
}

export async function updateGiveawayMsg(id: number, messageId: string) {
  const db = getDb();
  if (db) await db`UPDATE giveaways SET message_id=${messageId} WHERE id=${id}`;
  else { const g = memGiveaway.get(id); if (g) g.messageId = messageId; }
}

export async function joinGiveaway(id: number, userId: string): Promise<boolean> {
  const db = getDb();
  if (db) {
    const rows = await db<[{ participants: string }]>`SELECT participants FROM giveaways WHERE id=${id} AND ended=FALSE`;
    if (!rows.length) return false;
    const parts: string[] = JSON.parse(rows[0]!.participants);
    if (parts.includes(userId)) return false;
    parts.push(userId);
    await db`UPDATE giveaways SET participants=${JSON.stringify(parts)} WHERE id=${id}`;
    return true;
  }
  const g = memGiveaway.get(id);
  if (!g || g.ended || g.participants.includes(userId)) return false;
  g.participants.push(userId);
  return true;
}

export async function endGiveaway(id: number, winnerId: string | null) {
  const db = getDb();
  if (db) await db`UPDATE giveaways SET ended=TRUE WHERE id=${id}`;
  else { const g = memGiveaway.get(id); if (g) g.ended = true; }
}

export async function getActiveGiveaways(): Promise<GiveawayRow[]> {
  const db = getDb();
  if (db) {
    const rows = await db<Array<{ id: number; guild_id: string; channel_id: string; message_id: string | null; prize: string; ends_at: number; participants: string }>>`SELECT * FROM giveaways WHERE ended=FALSE`;
    return rows.map(r => ({ id: r.id, guildId: r.guild_id, channelId: r.channel_id, messageId: r.message_id, prize: r.prize, endsAt: r.ends_at, ended: false, participants: JSON.parse(r.participants) }));
  }
  return [...memGiveaway.values()].filter(g => !g.ended);
}

// ── State ─────────────────────────────────────────────────────────────────────
export async function getState(key: string): Promise<string | null> {
  const db = getDb();
  if (db) {
    const rows = await db<[{ value: string }]>`SELECT value FROM bot_state WHERE key=${key}`;
    return rows[0]?.value ?? null;
  }
  return memState.get(key) ?? null;
}

export async function setState(key: string, value: string) {
  const db = getDb();
  if (db) await db`INSERT INTO bot_state (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value=${value}`;
  else memState.set(key, value);
}
