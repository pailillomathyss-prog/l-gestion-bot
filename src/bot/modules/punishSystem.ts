import { Client, GuildMember, Message, Guild, TextChannel, ChannelType, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { logger } from "../../lib/logger.js";
import { getPunishment, setPunishment, deletePunishment, getAllPunishments } from "./db.js";

const MUTED_ROLE = "🔇 Muet";
const PUNISHMENT_ROLE = "🪫 • CONTRE LES RÈGLES";
const MUTE_DURATION_MS = 10 * 60 * 1000; // 10 min par défaut

const BANNED_WORDS: string[] = [
  // Mots bannis — personnalise cette liste
  "n*gger", "n*gga",
];

export function containsBannedWord(content: string): string | null {
  const lower = content.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (lower.includes(word.replace("*", ""))) return word;
  }
  return null;
}

export async function applyPunishment(member: GuildMember, message: Message, reason: string) {
  try {
    await message.delete().catch(() => {});

    const guild = member.guild;
    await guild.roles.fetch();
    let punishRole = guild.roles.cache.find(r => r.name === PUNISHMENT_ROLE);
    if (!punishRole) {
      punishRole = await guild.roles.create({
        name: PUNISHMENT_ROLE,
        permissions: [],
        reason: "Rôle punition MAI•GESTION",
      }).catch(() => undefined);
    }
    if (!punishRole) return;

    const savedRoles = member.roles.cache
      .filter(r => r.id !== guild.roles.everyone.id)
      .map(r => r.id);

    const now = Date.now();
    const expiresAt = now + MUTE_DURATION_MS;

    await setPunishment(guild.id, member.id, { roles: savedRoles, punishedAt: now, expiresAt, reason });
    await member.roles.set([punishRole]).catch(() => {});

    const warn = await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle("🚨 Sanction automatique")
          .setDescription(`<@${member.id}> — Ton message a été supprimé pour langage interdit.\nTu seras sanctionné pendant **10 minutes**.`)
          .setFooter({ text: "MAI•GESTION" })
          .setTimestamp(),
      ],
    }).catch(() => null);

    if (warn) setTimeout(() => warn.delete().catch(() => {}), 10000);

    setTimeout(() => {
      restoreMember(member.guild.client, guild.id, member.id).catch(() => {});
    }, MUTE_DURATION_MS);

  } catch (err) {
    logger.error({ err }, `Erreur applyPunishment pour ${member.id}`);
  }
}

export async function restoreMember(client: Client, guildId: string, userId: string) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const record = await getPunishment(guildId, userId);
  if (!record) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) {
    const rolesToRestore = record.roles
      .map(rid => guild.roles.cache.get(rid))
      .filter(Boolean);

    if (rolesToRestore.length > 0) {
      await member.roles.set(rolesToRestore as import("discord.js").Role[]).catch(() => {});
    }
    logger.info(`✅ Rôles restaurés pour ${userId}`);
  }

  await deletePunishment(guildId, userId);
}

export async function getPunishmentStatus(guildId: string, userId: string) {
  const record = await getPunishment(guildId, userId);
  if (!record) return null;
  return {
    reason: record.reason,
    punishedAt: record.punishedAt,
    expiresAt: record.expiresAt,
  };
}

export async function initPunishments(client: Client) {
  const all = await getAllPunishments();
  const now = Date.now();

  for (const p of all) {
    if (p.expiresAt > 0 && p.expiresAt <= now) {
      await restoreMember(client, p.guildId, p.userId).catch(() => {});
    } else if (p.expiresAt > now) {
      const delay = p.expiresAt - now;
      setTimeout(() => {
        restoreMember(client, p.guildId, p.userId).catch(() => {});
      }, delay);
    }
  }

  // Configurer AFK channel au démarrage
  for (const [, guild] of client.guilds.cache) {
    await setupAfkChannel(guild).catch(() => {});
  }

  logger.info("✅ Système de sanctions initialisé");
}

async function setupAfkChannel(guild: Guild) {
  const afkCh = guild.channels.cache.find(
    ch => ch.name.toLowerCase().includes("afk") || ch.name.includes("🔕")
  );
  if (!afkCh) return;

  if (afkCh.type === ChannelType.GuildVoice) {
    await afkCh.permissionOverwrites.edit(guild.roles.everyone, {
      Speak: false,
      Stream: false,
    }).catch(() => {});
    logger.info(`🔕 AFK channel configuré: #${afkCh.name}`);
  }
}
