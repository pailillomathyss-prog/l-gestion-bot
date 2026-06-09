import {
  Client,
  GuildMember,
  Message,
  EmbedBuilder,
  TextChannel,
  ChannelType,
  Role,
} from "discord.js";
import { logger } from "../../lib/logger";
import {
  getPunishment,
  setPunishment,
  deletePunishment,
  getAllPunishments,
} from "./db";

export const PUNISHMENT_ROLE = "🪫 • CONTRE LES RÈGLES";
const PUNISHMENT_DURATION = 24 * 60 * 60 * 1000;

const BANNED_WORDS_RAW = [
  "viole", "viol",
  "fdp", "fils de pute",
  "ntm", "nique ta mere", "nique ta mère",
  "encule", "enculé", "enculee",
  "salope",
  "batard", "batarde", "bâtard",
  "connard", "connasse",
  "va te faire foutre",
  "negro", "negre", "nègre",
  "pede", "pédé",
  "niquer", "nique",
  "tg",
];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
}

const BANNED_NORMALIZED = BANNED_WORDS_RAW.map(norm);

export function containsBannedWord(content: string): string | null {
  const n = norm(content);
  for (let i = 0; i < BANNED_NORMALIZED.length; i++) {
    const word = BANNED_NORMALIZED[i];
    const pattern = new RegExp(`(^|\\s)${word.replace(/ /g, "\\s+")}(\\s|$)`);
    if (pattern.test(n)) return BANNED_WORDS_RAW[i];
  }
  return null;
}

async function ensurePunishRole(member: GuildMember): Promise<Role | null> {
  await member.guild.roles.fetch();
  let role = member.guild.roles.cache.find((r) => r.name === PUNISHMENT_ROLE);
  if (!role) {
    try {
      role = await member.guild.roles.create({
        name: PUNISHMENT_ROLE,
        color: 0x555555,
        reason: "Rôle de sanction créé automatiquement par MAI•GESTION",
        permissions: [],
      });
      logger.info(`Rôle "${PUNISHMENT_ROLE}" créé`);
    } catch (err) {
      logger.error({ err }, `Impossible de créer le rôle sanction`);
      return null;
    }
  }
  return role;
}

async function findPunishChannel(guild: { channels: { cache: Map<string, { type: number; name: string }> } }): Promise<TextChannel | null> {
  return (guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      (c.name.toLowerCase().includes("général") ||
        c.name.toLowerCase().includes("general") ||
        c.name.toLowerCase().includes("chat"))
  ) as TextChannel) ?? null;
}

async function findRestoreChannel(guild: { channels: { cache: Map<string, { type: number; name: string }> } }): Promise<TextChannel | null> {
  return (guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name.toLowerCase().includes("info")
  ) as TextChannel) ?? null;
}

function autoDelete(msg: { delete: () => Promise<unknown> }, ms = 10_000) {
  setTimeout(() => msg.delete().catch(() => {}), ms);
}

export async function applyPunishment(
  member: GuildMember,
  triggerMessage: Message,
  word: string
) {
  await triggerMessage.delete().catch(() => {});

  const guildId = member.guild.id;
  const userId = member.id;

  const existing = await getPunishment(guildId, userId);
  if (existing) {
    logger.info(`${member.user.tag} déjà sanctionné — ignoré`);
    return;
  }

  const savedRoles = member.roles.cache
    .filter((r) => r.id !== member.guild.id)
    .map((r) => r.id);

  try {
    await member.roles.set([]);
  } catch (err) {
    logger.warn({ err }, `Impossible de retirer les rôles de ${member.user.tag}`);
  }

  const punishRole = await ensurePunishRole(member);
  if (punishRole) {
    await member.roles.add(punishRole).catch(() => {});
  }

  const now = Date.now();
  const expiresAt = now + PUNISHMENT_DURATION;

  await setPunishment(guildId, userId, {
    roles: savedRoles,
    punishedAt: now,
    expiresAt,
    reason: word,
  });

  const ch = await findPunishChannel(member.guild);
  if (ch) {
    await ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("🪫 Sanction appliquée")
          .setDescription(
            `${member} a été sanctionné pour **langage interdit** (\`${word}\`).`
          )
          .addFields(
            { name: "Durée", value: "**24 heures**", inline: true },
            { name: "Libération", value: `<t:${Math.floor(expiresAt / 1000)}:R>`, inline: true }
          )
          .setFooter({ text: "MAI•GESTION • Les rôles seront restaurés automatiquement" })
          .setTimestamp(),
      ],
    }).catch(() => {});
  }

  logger.info(
    `🪫 ${member.user.tag} sanctionné pour "${word}" jusqu'à ${new Date(expiresAt).toISOString()}`
  );

  const remaining = expiresAt - Date.now();
  setTimeout(() => restoreMember(member.guild.client, guildId, userId), remaining);
}

export async function restoreMember(client: Client, guildId: string, userId: string) {
  const record = await getPunishment(guildId, userId);
  if (!record) return;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await deletePunishment(guildId, userId);
    return;
  }

  const punishRole = guild.roles.cache.find((r) => r.name === PUNISHMENT_ROLE);
  if (punishRole) {
    await member.roles.remove(punishRole).catch(() => {});
  }

  let restored = 0;
  for (const roleId of record.roles) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      await member.roles.add(role).catch(() => {});
      restored++;
    }
  }

  await deletePunishment(guildId, userId);

  await member.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x00cc66)
        .setTitle("✅ Ta sanction a été levée")
        .setDescription(`Ta sanction sur **${guild.name}** est terminée. Tes rôles ont été restaurés.`)
        .addFields({ name: "Rôles restaurés", value: `**${restored}** rôle(s)` })
        .setFooter({ text: "MAI•GESTION" })
        .setTimestamp(),
    ],
  }).catch(() => {});

  const ch = await findRestoreChannel(guild);
  if (ch) {
    const msg = await ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00cc66)
          .setTitle("✅ Sanction levée")
          .setDescription(`${member} a retrouvé ses rôles après sa sanction.`)
          .addFields({ name: "Rôles restaurés", value: `**${restored}** rôle(s)` })
          .setFooter({ text: "MAI•GESTION" })
          .setTimestamp(),
      ],
    }).catch(() => null);
    if (msg) autoDelete(msg, 10_000);
  }

  logger.info(`✅ Rôles restaurés pour ${member.user.tag} (${restored} rôles)`);
}

export async function isPunished(guildId: string, userId: string): Promise<boolean> {
  const r = await getPunishment(guildId, userId);
  return r !== null;
}

export async function getPunishmentStatus(guildId: string, userId: string) {
  return getPunishment(guildId, userId);
}

export async function initPunishments(client: Client) {
  const all = await getAllPunishments();
  let restored = 0;
  let scheduled = 0;

  for (const record of all) {
    const remaining = record.expiresAt - Date.now();
    if (remaining <= 0) {
      await restoreMember(client, record.guildId, record.userId).catch(() => {});
      restored++;
    } else {
      setTimeout(
        () => restoreMember(client, record.guildId, record.userId),
        remaining
      );
      scheduled++;
      logger.info(
        `⏱️ Sanction de ${record.userId} : restauration dans ${Math.round(remaining / 60000)} min`
      );
    }
  }

  if (restored > 0 || scheduled > 0) {
    logger.info(`🪫 Punitions : ${restored} restaurées, ${scheduled} replanifiées`);
  }

  for (const [, guild] of client.guilds.cache) {
    await guild.members.fetch().catch(() => {});
    const punishRole = guild.roles.cache.find((r) => r.name === PUNISHMENT_ROLE);
    if (!punishRole) continue;

    for (const [, member] of guild.members.cache) {
      if (!member.roles.cache.has(punishRole.id)) continue;
      const rec = await getPunishment(guild.id, member.id);
      if (!rec) {
        logger.warn(`${member.user.tag} avait le rôle sanction sans données → nettoyage`);
        await member.roles.remove(punishRole).catch(() => {});
      }
    }
  }
}
