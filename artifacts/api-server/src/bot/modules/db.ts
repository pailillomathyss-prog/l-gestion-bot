import postgres from "postgres";
import { logger } from "../../lib/logger";

let _sql: ReturnType<typeof postgres> | null = null;

function getSql() {
  if (!_sql) {
    const url = process.env["DATABASE_URL"];
    if (!url) throw new Error("DATABASE_URL manquant — configure la variable sur Railway");
    _sql = postgres(url, { max: 5, idle_timeout: 30 });
  }
  return _sql;
}

export async function ensureTables() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS xp_data (
      guild_id    TEXT    NOT NULL,
      user_id     TEXT    NOT NULL,
      xp          INTEGER NOT NULL DEFAULT 0,
      level       INTEGER NOT NULL DEFAULT 0,
      last_message BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS punishments (
      guild_id    TEXT   NOT NULL,
      user_id     TEXT   NOT NULL,
      roles       TEXT   NOT NULL DEFAULT '[]',
      punished_at BIGINT NOT NULL DEFAULT 0,
      expires_at  BIGINT NOT NULL DEFAULT 0,
      reason      TEXT   NOT NULL DEFAULT '',
      PRIMARY KEY (guild_id, user_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS bot_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `;
  logger.info("✅ Tables DB vérifiées / créées");
}

// ── XP ────────────────────────────────────────────────────────────────────────

export interface XPRow {
  xp: number;
  level: number;
  lastMessage: number;
}

export async function getXP(guildId: string, userId: string): Promise<XPRow> {
  const sql = getSql();
  const rows = await sql<{ xp: number; level: number; last_message: string }[]>`
    SELECT xp, level, last_message
    FROM xp_data
    WHERE guild_id = ${guildId} AND user_id = ${userId}
  `;
  if (!rows[0]) return { xp: 0, level: 0, lastMessage: 0 };
  return { xp: rows[0].xp, level: rows[0].level, lastMessage: Number(rows[0].last_message) };
}

export async function upsertXP(
  guildId: string,
  userId: string,
  xp: number,
  level: number,
  lastMessage: number
) {
  const sql = getSql();
  await sql`
    INSERT INTO xp_data (guild_id, user_id, xp, level, last_message)
    VALUES (${guildId}, ${userId}, ${xp}, ${level}, ${lastMessage})
    ON CONFLICT (guild_id, user_id) DO UPDATE
    SET xp = ${xp}, level = ${level}, last_message = ${lastMessage}
  `;
}

export async function getAllXP(
  guildId: string
): Promise<Array<{ userId: string } & XPRow>> {
  const sql = getSql();
  const rows = await sql<{ user_id: string; xp: number; level: number; last_message: string }[]>`
    SELECT user_id, xp, level, last_message
    FROM xp_data
    WHERE guild_id = ${guildId}
    ORDER BY xp DESC
  `;
  return rows.map((r) => ({
    userId: r.user_id,
    xp: r.xp,
    level: r.level,
    lastMessage: Number(r.last_message),
  }));
}

// ── Punishments ───────────────────────────────────────────────────────────────

export interface PunishRow {
  roles: string[];
  punishedAt: number;
  expiresAt: number;
  reason: string;
}

export async function getPunishment(
  guildId: string,
  userId: string
): Promise<PunishRow | null> {
  const sql = getSql();
  const rows = await sql<{
    roles: string;
    punished_at: string;
    expires_at: string;
    reason: string;
  }[]>`
    SELECT roles, punished_at, expires_at, reason
    FROM punishments
    WHERE guild_id = ${guildId} AND user_id = ${userId}
  `;
  if (!rows[0]) return null;
  return {
    roles: JSON.parse(rows[0].roles),
    punishedAt: Number(rows[0].punished_at),
    expiresAt: Number(rows[0].expires_at),
    reason: rows[0].reason,
  };
}

export async function setPunishment(
  guildId: string,
  userId: string,
  record: PunishRow
) {
  const sql = getSql();
  await sql`
    INSERT INTO punishments (guild_id, user_id, roles, punished_at, expires_at, reason)
    VALUES (
      ${guildId}, ${userId},
      ${JSON.stringify(record.roles)},
      ${record.punishedAt}, ${record.expiresAt}, ${record.reason}
    )
    ON CONFLICT (guild_id, user_id) DO UPDATE
    SET roles = ${JSON.stringify(record.roles)},
        punished_at = ${record.punishedAt},
        expires_at = ${record.expiresAt},
        reason = ${record.reason}
  `;
}

export async function deletePunishment(guildId: string, userId: string) {
  const sql = getSql();
  await sql`DELETE FROM punishments WHERE guild_id = ${guildId} AND user_id = ${userId}`;
}

export async function getAllPunishments(): Promise<
  Array<{ guildId: string; userId: string } & PunishRow>
> {
  const sql = getSql();
  const rows = await sql<{
    guild_id: string;
    user_id: string;
    roles: string;
    punished_at: string;
    expires_at: string;
    reason: string;
  }[]>`SELECT * FROM punishments`;
  return rows.map((r) => ({
    guildId: r.guild_id,
    userId: r.user_id,
    roles: JSON.parse(r.roles),
    punishedAt: Number(r.punished_at),
    expiresAt: Number(r.expires_at),
    reason: r.reason,
  }));
}

// ── Bot state (rules message ID etc.) ────────────────────────────────────────

export async function getState(key: string): Promise<string | null> {
  const sql = getSql();
  const rows = await sql<{ value: string }[]>`
    SELECT value FROM bot_state WHERE key = ${key}
  `;
  return rows[0]?.value ?? null;
}

export async function setState(key: string, value: string) {
  const sql = getSql();
  await sql`
    INSERT INTO bot_state (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = ${value}
  `;
}
