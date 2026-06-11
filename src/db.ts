import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

function getDb() {
  if (sql) return sql;
  const url = process.env["DATABASE_URL"];
  if (!url) return null;
  try { sql = postgres(url, { max: 5, idle_timeout: 30 }); return sql; } catch { return null; }
}

const memUsers  = new Map<string, UserRow>();
const memPunish = new Map<string, PunishRow>();
const memGiveaw = new Map<number, GiveawayRow>();
const memState  = new Map<string, string>();
let   gSeq      = 1;

export interface UserRow    { xp:number; level:number; coins:number; lastMsgTs:number; lastVoiceTs:number; }
export interface PunishRow  { roles:string[]; expiresAt:number; reason:string; }
export interface GiveawayRow{ id:number; guildId:string; channelId:string; messageId:string|null; prize:string; endsAt:number; ended:boolean; participants:string[]; }

const uk = (g:string,u:string) => `${g}:${u}`;

export async function initDb() {
  const db = getDb();
  if (!db) { console.warn("⚠️ Pas de DATABASE_URL — données en mémoire (non persistées)"); return; }
  await db`CREATE TABLE IF NOT EXISTS users(guild_id TEXT,user_id TEXT,xp INT NOT NULL DEFAULT 0,level INT NOT NULL DEFAULT 0,coins INT NOT NULL DEFAULT 0,last_msg_ts BIGINT NOT NULL DEFAULT 0,last_voice_ts BIGINT NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,user_id))`;
  await db`CREATE TABLE IF NOT EXISTS punishments(guild_id TEXT,user_id TEXT,roles TEXT NOT NULL DEFAULT '[]',expires_at BIGINT NOT NULL DEFAULT 0,reason TEXT NOT NULL DEFAULT '',PRIMARY KEY(guild_id,user_id))`;
  await db`CREATE TABLE IF NOT EXISTS giveaways(id SERIAL PRIMARY KEY,guild_id TEXT,channel_id TEXT,message_id TEXT,prize TEXT,ends_at BIGINT,ended BOOLEAN DEFAULT FALSE,participants TEXT NOT NULL DEFAULT '[]')`;
  await db`CREATE TABLE IF NOT EXISTS bot_state(key TEXT PRIMARY KEY,value TEXT)`;
  console.log("✅ DB initialisée");
}

export async function getUser(guildId:string, userId:string): Promise<UserRow> {
  const db = getDb();
  if (db) {
    const r = await db<UserRow[]>`SELECT xp,level,coins,last_msg_ts AS "lastMsgTs",last_voice_ts AS "lastVoiceTs" FROM users WHERE guild_id=${guildId} AND user_id=${userId}`;
    return r[0] ?? { xp:0,level:0,coins:0,lastMsgTs:0,lastVoiceTs:0 };
  }
  return memUsers.get(uk(guildId,userId)) ?? { xp:0,level:0,coins:0,lastMsgTs:0,lastVoiceTs:0 };
}

export async function saveUser(guildId:string, userId:string, d:UserRow) {
  const db = getDb();
  if (db) await db`INSERT INTO users(guild_id,user_id,xp,level,coins,last_msg_ts,last_voice_ts) VALUES(${guildId},${userId},${d.xp},${d.level},${d.coins},${d.lastMsgTs},${d.lastVoiceTs}) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=${d.xp},level=${d.level},coins=${d.coins},last_msg_ts=${d.lastMsgTs},last_voice_ts=${d.lastVoiceTs}`;
  else memUsers.set(uk(guildId,userId), d);
}

export async function getTopUsers(guildId:string, limit=10) {
  const db = getDb();
  if (db) {
    const r = await db<Array<{user_id:string;xp:number;level:number;coins:number;last_msg_ts:number;last_voice_ts:number}>>`SELECT user_id,xp,level,coins,last_msg_ts,last_voice_ts FROM users WHERE guild_id=${guildId} ORDER BY xp DESC LIMIT ${limit}`;
    return r.map(x => ({userId:x.user_id,xp:x.xp,level:x.level,coins:x.coins,lastMsgTs:x.last_msg_ts,lastVoiceTs:x.last_voice_ts}));
  }
  return [...memUsers.entries()].filter(([k])=>k.startsWith(guildId+":")).map(([k,v])=>({userId:k.split(":")[1]!,...v})).sort((a,b)=>b.xp-a.xp).slice(0,limit);
}

export async function resetAllXP(guildId:string) {
  const db = getDb();
  if (db) await db`UPDATE users SET xp=0,level=0 WHERE guild_id=${guildId}`;
  else for (const [k,v] of memUsers) if (k.startsWith(guildId+":")) { v.xp=0; v.level=0; }
}

export async function getPunish(guildId:string, userId:string): Promise<PunishRow|null> {
  const db = getDb();
  if (db) {
    const r = await db<Array<{roles:string;expires_at:number;reason:string}>>`SELECT roles,expires_at,reason FROM punishments WHERE guild_id=${guildId} AND user_id=${userId}`;
    return r[0] ? {roles:JSON.parse(r[0].roles),expiresAt:r[0].expires_at,reason:r[0].reason} : null;
  }
  return memPunish.get(uk(guildId,userId)) ?? null;
}

export async function setPunish(guildId:string, userId:string, d:PunishRow) {
  const db = getDb();
  if (db) await db`INSERT INTO punishments(guild_id,user_id,roles,expires_at,reason) VALUES(${guildId},${userId},${JSON.stringify(d.roles)},${d.expiresAt},${d.reason}) ON CONFLICT(guild_id,user_id) DO UPDATE SET roles=${JSON.stringify(d.roles)},expires_at=${d.expiresAt},reason=${d.reason}`;
  else memPunish.set(uk(guildId,userId), d);
}

export async function delPunish(guildId:string, userId:string) {
  const db = getDb();
  if (db) await db`DELETE FROM punishments WHERE guild_id=${guildId} AND user_id=${userId}`;
  else memPunish.delete(uk(guildId,userId));
}

export async function getAllPunishments() {
  const db = getDb();
  if (db) {
    const r = await db<Array<{guild_id:string;user_id:string;roles:string;expires_at:number;reason:string}>>`SELECT * FROM punishments`;
    return r.map(x=>({guildId:x.guild_id,userId:x.user_id,roles:JSON.parse(x.roles),expiresAt:x.expires_at,reason:x.reason}));
  }
  return [...memPunish.entries()].map(([k,v])=>{const[g,u]=k.split(":");return{guildId:g!,userId:u!,...v};});
}

export async function createGiveaway(g:Omit<GiveawayRow,"id"|"ended"|"participants">): Promise<number> {
  const db = getDb();
  if (db) {
    const r = await db<[{id:number}]>`INSERT INTO giveaways(guild_id,channel_id,message_id,prize,ends_at,ended,participants) VALUES(${g.guildId},${g.channelId},${g.messageId},${g.prize},${g.endsAt},FALSE,'[]') RETURNING id`;
    return r[0]!.id;
  }
  const id = gSeq++;
  memGiveaw.set(id,{...g,id,ended:false,participants:[]});
  return id;
}

export async function updateGiveawayMsg(id:number, msgId:string) {
  const db = getDb();
  if (db) await db`UPDATE giveaways SET message_id=${msgId} WHERE id=${id}`;
  else { const g=memGiveaw.get(id); if(g) g.messageId=msgId; }
}

export async function joinGiveaway(id:number, userId:string): Promise<boolean> {
  const db = getDb();
  if (db) {
    const r = await db<[{participants:string}]>`SELECT participants FROM giveaways WHERE id=${id} AND ended=FALSE`;
    if (!r.length) return false;
    const p:string[] = JSON.parse(r[0]!.participants);
    if (p.includes(userId)) return false;
    p.push(userId);
    await db`UPDATE giveaways SET participants=${JSON.stringify(p)} WHERE id=${id}`;
    return true;
  }
  const g = memGiveaw.get(id);
  if (!g||g.ended||g.participants.includes(userId)) return false;
  g.participants.push(userId); return true;
}

export async function endGiveaway(id:number) {
  const db = getDb();
  if (db) await db`UPDATE giveaways SET ended=TRUE WHERE id=${id}`;
  else { const g=memGiveaw.get(id); if(g) g.ended=true; }
}

export async function getActiveGiveaways(): Promise<GiveawayRow[]> {
  const db = getDb();
  if (db) {
    const r = await db<Array<{id:number;guild_id:string;channel_id:string;message_id:string|null;prize:string;ends_at:number;participants:string}>>`SELECT * FROM giveaways WHERE ended=FALSE`;
    return r.map(x=>({id:x.id,guildId:x.guild_id,channelId:x.channel_id,messageId:x.message_id,prize:x.prize,endsAt:x.ends_at,ended:false,participants:JSON.parse(x.participants)}));
  }
  return [...memGiveaw.values()].filter(g=>!g.ended);
}

export async function getState(key:string): Promise<string|null> {
  const db = getDb();
  if (db) { const r = await db<[{value:string}]>`SELECT value FROM bot_state WHERE key=${key}`; return r[0]?.value ?? null; }
  return memState.get(key) ?? null;
}

export async function setState(key:string, value:string) {
  const db = getDb();
  if (db) await db`INSERT INTO bot_state(key,value) VALUES(${key},${value}) ON CONFLICT(key) DO UPDATE SET value=${value}`;
  else memState.set(key,value);
}
