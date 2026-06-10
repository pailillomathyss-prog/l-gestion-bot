import { Guild, GuildMember, EmbedBuilder, TextChannel, ChannelType } from "discord.js";
import { logger } from "../../lib/logger";
import { getXP, upsertXP, getAllXP, addCoins } from "./db";
import { isPunished, PUNISHMENT_ROLE } from "./punishSystem";
import { onQuestProgress } from "./questSystem";

const XP_COOLDOWN = 60_000;
const XP_MIN = 15;
const XP_MAX = 25;
const VOICE_XP_GAIN = 20;
const COINS_PER_MSG_MIN = 8;
const COINS_PER_MSG_MAX = 15;
const COINS_PER_VOICE_TICK = 12;

export const LEVEL_ROLES: { level: number; name: string }[] = [
  { level: 50, name: "⚜️・nv 50+" },
  { level: 30, name: "🔮・nv 30+" },
  { level: 10, name: "⛓️・nv 10+" },
  { level: 0,  name: "🍃・nv 0+" },
];

export function getLevel(xp: number): number {
  return Math.floor(xp / 100);
}

export function getRoleName(level: number): string {
  for (const r of LEVEL_ROLES) {
    if (level >= r.level) return r.name;
  }
  return "🍃・nv 0+";
}

export function xpForLevel(level: number): number {
  return level * 100;
}

export async function getUserData(
  guildId: string,
  userId: string
): Promise<{ xp: number; level: number; lastMessage: number }> {
  return getXP(guildId, userId);
}

export async function getLeaderboard(
  guildId: string,
  limit = 10
): Promise<Array<{ userId: string; xp: number; level: number; lastMessage: number }>> {
  const all = await getAllXP(guildId);
  return all.slice(0, limit);
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
  if (member.roles.cache.some((r) => r.name === PUNISHMENT_ROLE)) return;
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
  const cmds = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name.toLowerCase().includes("cmds")
  ) as TextChannel | undefined;
  if (cmds) return cmds;
  return (guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      (c.name.toLowerCase().includes("général") ||
        c.name.toLowerCase().includes("general") ||
        c.name.toLowerCase().includes("chat"))
  ) as TextChannel) ?? null;
}

function autoDelete(msg: { delete: () => Promise<unknown> }, ms = 10_000) {
  setTimeout(() => msg.delete().catch(() => {}), ms);
}

// ── Multiplicateurs météo (import dynamique pour éviter les dépendances circulaires) ──

async function getWeatherMultipliers(): Promise<{ xp: number; coins: number }> {
  try {
    const { getXPMultiplier, getCoinsMultiplier } = await import("./weatherSystem");
    return { xp: getXPMultiplier(), coins: getCoinsMultiplier() };
  } catch {
    return { xp: 1, coins: 1 };
  }
}

// ── XP par message ─────────────────────────────────────────────────────────────

export async function handleXP(member: GuildMember) {
  if (await isPunished(member.guild.id, member.id)) return;
  if (member.roles.cache.some((r) => r.name === PUNISHMENT_ROLE)) return;

  const guildId = member.guild.id;
  const userId  = member.id;
  const user    = await getXP(guildId, userId);

  const now = Date.now();
  if (now - user.lastMessage < XP_COOLDOWN) return;

  const weather = await getWeatherMultipliers();

  const baseXP  = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
  const gain    = Math.max(1, Math.round(baseXP * weather.xp));
  user.xp      += gain;
  user.lastMessage = now;

  const newLevel = getLevel(user.xp);
  const leveledUp = newLevel > user.level;
  user.level = newLevel;

  await upsertXP(guildId, userId, user.xp, user.level, user.lastMessage);

  // Pièces + quêtes
  const baseCoin = Math.floor(Math.random() * (COINS_PER_MSG_MAX - COINS_PER_MSG_MIN + 1)) + COINS_PER_MSG_MIN;
  const coinGain = Math.max(1, Math.round(baseCoin * weather.coins));
  await addCoins(guildId, userId, coinGain).catch(() => {});
  await onQuestProgress(member, "messages", 1).catch(() => {});
  await onQuestProgress(member, "xp", gain).catch(() => {});

  // Progression défi communautaire
  try {
    const { onCommunityProgress } = await import("./communityChallenge");
    await onCommunityProgress(member, "messages", 1).catch(() => {});
    await onCommunityProgress(member, "xp", gain).catch(() => {});
  } catch { /* ignoré */ }

  // Stats + badges
  const { incrementStat, getUserStats } = await import("./db");
  const { checkBadges }                 = await import("./badgeSystem");
  await incrementStat(guildId, userId, "messages_total", 1).catch(() => {});
  await incrementStat(guildId, userId, "coins_earned_total", coinGain).catch(() => {});
  const stats = await getUserStats(guildId, userId).catch(() => null);
  if (stats) await checkBadges(member, stats).catch(() => {});

  if (leveledUp) {
    await updateMemberRoles(member, newLevel);
    const ch = await findLevelUpChannel(member.guild);
    if (ch) {
      const msg = await ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle("🎉 Niveau supérieur !")
            .setDescription(`${member} vient d'atteindre le **niveau ${newLevel}** !`)
            .addFields({ name: "Nouveau rôle", value: getRoleName(newLevel) })
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp(),
        ],
      }).catch(() => null);
      if (msg) autoDelete(msg);
    }
    logger.info(`${member.user.tag} → niveau ${newLevel}`);
  }
}

const voiceStartMap = new Map<string, number>();

export function trackVoiceJoin(guildId: string, userId: string) {
  voiceStartMap.set(`${guildId}:${userId}`, Date.now());
}

export function trackVoiceLeave(guildId: string, userId: string) {
  voiceStartMap.delete(`${guildId}:${userId}`);
}

export async function processVoiceXP(guild: Guild) {
  const guildId = guild.id;
  const now = Date.now();

  for (const [, voiceState] of guild.voiceStates.cache) {
    if (!voiceState.channelId) continue;
    if (voiceState.member?.user.bot) continue;

    const userId  = voiceState.id;
    const key     = `${guildId}:${userId}`;
    const joinedAt = voiceStartMap.get(key);
    if (!joinedAt) {
      voiceStartMap.set(key, now);
      continue;
    }

    const member = voiceState.member;
    if (!member) continue;
    if (await isPunished(guildId, userId)) continue;
    if (member.roles.cache.some((r) => r.name === PUNISHMENT_ROLE)) continue;

    const weather = await getWeatherMultipliers();
    const user    = await getXP(guildId, userId);

    const voiceGain = Math.max(1, Math.round(VOICE_XP_GAIN * weather.xp));
    user.xp += voiceGain;

    const newLevel  = getLevel(user.xp);
    const leveledUp = newLevel > user.level;
    user.level = newLevel;

    await upsertXP(guildId, userId, user.xp, user.level, user.lastMessage);

    const voiceCoinGain = Math.max(1, Math.round(COINS_PER_VOICE_TICK * weather.coins));
    await addCoins(guildId, userId, voiceCoinGain).catch(() => {});
    await onQuestProgress(member, "voice_minutes", 10).catch(() => {});
    await onQuestProgress(member, "xp", voiceGain).catch(() => {});

    // Progression défi communautaire (vocal)
    try {
      const { onCommunityProgress } = await import("./communityChallenge");
      await onCommunityProgress(member, "xp", voiceGain).catch(() => {});
    } catch { /* ignoré */ }

    if (leveledUp) {
      await updateMemberRoles(member, newLevel);
      const ch = await findLevelUpChannel(guild);
      if (ch) {
        const msg = await ch.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xffd700)
              .setTitle("🎉 Niveau supérieur !")
              .setDescription(`${member} vient d'atteindre le **niveau ${newLevel}** grâce au vocal ! 🎙️`)
              .addFields({ name: "Nouveau rôle", value: getRoleName(newLevel) })
              .setThumbnail(member.user.displayAvatarURL())
              .setTimestamp(),
          ],
        }).catch(() => null);
        if (msg) autoDelete(msg);
      }
      logger.info(`${member.user.tag} → niveau ${newLevel} (vocal)`);
    }

    voiceStartMap.set(key, now);
  }
}

export async function initMemberXP(member: GuildMember) {
  const guildId = member.guild.id;
  const userId  = member.id;
  const user    = await getXP(guildId, userId);
  if (user.xp === 0 && user.level === 0 && user.lastMessage === 0) {
    await upsertXP(guildId, userId, 0, 0, 0);
  }
  if (!(await isPunished(guildId, userId))) {
    await updateMemberRoles(member, user.level);
  }
}
