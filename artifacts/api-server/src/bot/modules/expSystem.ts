import { Guild, GuildMember, EmbedBuilder, TextChannel, ChannelType } from "discord.js";
import { logger } from "../../lib/logger";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const XP_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../xp-data.json"
);

export interface UserXP {
  xp: number;
  level: number;
  lastMessage: number;
}

export type XPData = Record<string, Record<string, UserXP>>;

const XP_COOLDOWN = 60_000;
const XP_MIN = 15;
const XP_MAX = 25;

// Noms exacts des rôles Discord (caractère ・ = U+30FB)
export const LEVEL_ROLES: { level: number; name: string }[] = [
  { level: 50, name: "⚜️・nv 50+" },
  { level: 30, name: "🔮・nv 30+" },
  { level: 10, name: "⛓️・nv 10+" },
  { level: 0,  name: "🍃・nv 0+" },
];

export function loadXP(): XPData {
  try {
    if (existsSync(XP_FILE)) return JSON.parse(readFileSync(XP_FILE, "utf-8"));
  } catch {}
  return {};
}

function saveXP(data: XPData) {
  try { writeFileSync(XP_FILE, JSON.stringify(data, null, 2)); } catch {}
}

export function getLevel(xp: number): number {
  return Math.floor(xp / 100);
}

export function getRoleName(level: number): string {
  for (const r of LEVEL_ROLES) {
    if (level >= r.level) return r.name;
  }
  return "🍃・nv 0+";
}

/** XP total nécessaire pour atteindre ce niveau */
export function xpForLevel(level: number): number {
  return level * 100;
}

export function getUserData(guildId: string, userId: string): UserXP {
  const data = loadXP();
  return data[guildId]?.[userId] ?? { xp: 0, level: 0, lastMessage: 0 };
}

export function getLeaderboard(guildId: string, limit = 10): Array<{ userId: string } & UserXP> {
  const data = loadXP();
  const guild = data[guildId] ?? {};
  return Object.entries(guild)
    .map(([userId, d]) => ({ userId, ...d }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

async function ensureLevelRole(guild: Guild, roleName: string) {
  let role = guild.roles.cache.find((r) => r.name === roleName);
  if (!role) {
    try {
      role = await guild.roles.create({
        name: roleName,
        reason: "Rôle de niveau créé automatiquement par MAI•GESTION",
        permissions: [],
      });
      logger.info(`Rôle "${roleName}" créé`);
    } catch (err) {
      logger.error({ err }, `Impossible de créer le rôle ${roleName}`);
      return null;
    }
  }
  return role;
}

async function updateMemberRoles(member: GuildMember, level: number) {
  const targetRoleName = getRoleName(level);
  for (const { name } of LEVEL_ROLES) {
    const role = await ensureLevelRole(member.guild, name);
    if (!role) continue;
    const hasRole = member.roles.cache.has(role.id);
    if (name === targetRoleName && !hasRole) {
      await member.roles.add(role).catch(() => {});
    } else if (name !== targetRoleName && hasRole) {
      await member.roles.remove(role).catch(() => {});
    }
  }
}

async function findLevelUpChannel(guild: Guild): Promise<TextChannel | null> {
  return (guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      (c.name.toLowerCase().includes("général") ||
        c.name.toLowerCase().includes("general") ||
        c.name.toLowerCase().includes("chat"))
  ) as TextChannel) ?? null;
}

export async function handleXP(member: GuildMember) {
  const data = loadXP();
  const guildId = member.guild.id;
  const userId = member.id;

  if (!data[guildId]) data[guildId] = {};
  const user = data[guildId][userId] ?? { xp: 0, level: 0, lastMessage: 0 };

  const now = Date.now();
  if (now - user.lastMessage < XP_COOLDOWN) return;

  user.xp += Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
  user.lastMessage = now;

  const newLevel = getLevel(user.xp);
  const leveledUp = newLevel > user.level;
  user.level = newLevel;

  data[guildId][userId] = user;
  saveXP(data);

  if (leveledUp) {
    await updateMemberRoles(member, newLevel);
    const ch = await findLevelUpChannel(member.guild);
    if (ch) {
      await ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle("🎉 Niveau supérieur !")
            .setDescription(`${member} vient d'atteindre le **niveau ${newLevel}** !`)
            .addFields({ name: "Nouveau rôle", value: getRoleName(newLevel) })
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp(),
        ],
      }).catch(() => {});
    }
    logger.info(`${member.user.tag} → niveau ${newLevel}`);
  }
}

export async function initMemberXP(member: GuildMember) {
  const data = loadXP();
  const guildId = member.guild.id;
  const userId = member.id;
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) {
    data[guildId][userId] = { xp: 0, level: 0, lastMessage: 0 };
    saveXP(data);
  }
  await updateMemberRoles(member, data[guildId][userId].level);
}
