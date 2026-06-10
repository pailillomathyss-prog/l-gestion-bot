import { GuildMember, Guild, TextChannel, EmbedBuilder, ChannelType } from "discord.js";
import { logger } from "../../lib/logger.js";
import { getXP, upsertXP, getAllXP, addCoins } from "./db.js";
import { onQuestProgress } from "./questSystem.js";

// XP par message (8-15 aléatoire)
const XP_PER_MESSAGE_MIN = 8;
const XP_PER_MESSAGE_MAX = 15;
const XP_COOLDOWN_MS = 60_000; // 1 min entre gains
const XP_PER_VOICE_TICK = 12; // XP toutes les 10 min en vocal
const COINS_PER_MESSAGE_MIN = 8;
const COINS_PER_MESSAGE_MAX = 15;
const COINS_PER_VOICE_TICK = 12;

// Calcul du niveau depuis l'XP
export function xpToLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100));
}

export function levelToXP(level: number): number {
  return level * level * 100;
}

// Jalons de niveau avec rôles
export const LEVEL_MILESTONES: { level: number; name: string; color: number }[] = [
  { level: 1,    name: "🌱 Niveau 1",    color: 0x95a5a6 },
  { level: 5,    name: "⚡ Niveau 5",    color: 0x2ecc71 },
  { level: 10,   name: "🔥 Niveau 10",   color: 0x3498db },
  { level: 25,   name: "💫 Niveau 25",   color: 0x9b59b6 },
  { level: 50,   name: "🌟 Niveau 50",   color: 0xf39c12 },
  { level: 75,   name: "🏆 Niveau 75",   color: 0xe74c3c },
  { level: 100,  name: "👑 Niveau 100",  color: 0xffd700 },
  { level: 150,  name: "💎 Niveau 150",  color: 0x00bcd4 },
  { level: 200,  name: "🔮 Niveau 200",  color: 0xff69b4 },
  { level: 300,  name: "☄️ Niveau 300",  color: 0xff4500 },
  { level: 500,  name: "🌌 Niveau 500",  color: 0x7b2d8b },
  { level: 750,  name: "⚜️ Niveau 750",  color: 0xdaa520 },
  { level: 1000, name: "🎯 Niveau 1000", color: 0xe74c3c },
];

function getHighestMilestone(level: number) {
  const passed = LEVEL_MILESTONES.filter(m => level >= m.level);
  return passed.length > 0 ? passed[passed.length - 1] : null;
}

// Ensure level role exists and assign it
async function assignLevelRole(member: GuildMember, level: number) {
  const milestone = getHighestMilestone(level);
  if (!milestone) return;

  const guild = member.guild;
  await guild.roles.fetch();

  let role = guild.roles.cache.find(r => r.name === milestone.name);
  if (!role) {
    try {
      role = await guild.roles.create({
        name: milestone.name,
        color: milestone.color,
        reason: "Rôle de niveau créé par MAI•GESTION",
        permissions: [],
      });
      logger.info(`Rôle niveau "${milestone.name}" créé`);
    } catch (err) {
      logger.warn({ err }, `Impossible de créer le rôle "${milestone.name}"`);
      return;
    }
  }

  // Supprimer les anciens rôles de niveau
  const oldRoles = LEVEL_MILESTONES
    .filter(m => m.level < milestone.level)
    .map(m => guild.roles.cache.find(r => r.name === m.name))
    .filter(Boolean);

  for (const old of oldRoles) {
    if (old && member.roles.cache.has(old.id)) {
      await member.roles.remove(old).catch(() => {});
    }
  }

  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role).catch(() => {});
  }
}

// Annoncer montée de niveau
async function announceLevel(member: GuildMember, level: number) {
  const guild = member.guild;
  const levelCh = guild.channels.cache.find(
    ch => ch.type === ChannelType.GuildText &&
      (ch.name.toLowerCase().includes("level") || ch.name.toLowerCase().includes("niveau") ||
       ch.name.toLowerCase().includes("general") || ch.name.toLowerCase().includes("général"))
  ) as TextChannel | undefined;

  if (!levelCh) return;

  const milestone = getHighestMilestone(level);
  const embed = new EmbedBuilder()
    .setColor(milestone?.color ?? 0x9b59b6)
    .setTitle("🎉 Montée de niveau !")
    .setDescription(`Félicitations <@${member.id}> ! Tu es maintenant **niveau ${level}** ! ${milestone ? `\n🎁 Tu as obtenu le rôle **${milestone.name}** !` : ""}`)
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: "MAI•GESTION" })
    .setTimestamp();

  levelCh.send({ embeds: [embed] }).catch(() => {});
}

export async function initMemberXP(member: GuildMember) {
  const data = await getXP(member.guild.id, member.id);
  if (data.xp === 0 && data.level === 0) {
    await upsertXP(member.guild.id, member.id, 0, 0, 0);
  }
}

export async function handleXP(member: GuildMember) {
  const guildId = member.guild.id;
  const userId = member.id;
  const now = Date.now();

  const data = await getXP(guildId, userId);

  if (now - data.lastMessage < XP_COOLDOWN_MS) return;

  const gainXP = Math.floor(Math.random() * (XP_PER_MESSAGE_MAX - XP_PER_MESSAGE_MIN + 1)) + XP_PER_MESSAGE_MIN;
  const gainCoins = Math.floor(Math.random() * (COINS_PER_MESSAGE_MAX - COINS_PER_MESSAGE_MIN + 1)) + COINS_PER_MESSAGE_MIN;

  const newXP = data.xp + gainXP;
  const newLevel = xpToLevel(newXP);

  await upsertXP(guildId, userId, newXP, newLevel, now);
  await addCoins(guildId, userId, gainCoins);

  // Quête progression
  await onQuestProgress(member, "messages", 1).catch(() => {});
  await onQuestProgress(member, "xp", gainXP).catch(() => {});

  // Level up ?
  if (newLevel > data.level) {
    await assignLevelRole(member, newLevel).catch(() => {});
    await announceLevel(member, newLevel).catch(() => {});
  }
}

// Track vocal sessions
const voiceJoinTime = new Map<string, number>();

export function trackVoiceJoin(guildId: string, userId: string) {
  voiceJoinTime.set(`${guildId}:${userId}`, Date.now());
}

export function trackVoiceLeave(guildId: string, userId: string) {
  voiceJoinTime.delete(`${guildId}:${userId}`);
}

export async function processVoiceXP(guild: Guild) {
  const guildId = guild.id;

  for (const [, voiceChannel] of guild.channels.cache) {
    if (voiceChannel.type !== ChannelType.GuildVoice) continue;
    // Ignorer AFK
    if (voiceChannel.name.toLowerCase().includes("afk")) continue;

    for (const [, member] of (voiceChannel as import("discord.js").VoiceChannel).members) {
      if (member.user.bot) continue;

      const key = `${guildId}:${member.id}`;
      if (!voiceJoinTime.has(key)) {
        trackVoiceJoin(guildId, member.id);
      }

      const data = await getXP(guildId, member.id);
      const newXP = data.xp + XP_PER_VOICE_TICK;
      const newLevel = xpToLevel(newXP);

      await upsertXP(guildId, member.id, newXP, newLevel, data.lastMessage);
      await addCoins(guildId, member.id, COINS_PER_VOICE_TICK);

      await onQuestProgress(member, "voice_minutes", 10).catch(() => {});

      if (newLevel > data.level) {
        await assignLevelRole(member, newLevel).catch(() => {});
        await announceLevel(member, newLevel).catch(() => {});
      }
    }
  }
}

export async function getUserData(guildId: string, userId: string) {
  const data = await getXP(guildId, userId);
  return {
    xp: data.xp,
    level: data.level,
    nextLevelXP: levelToXP(data.level + 1),
  };
}
