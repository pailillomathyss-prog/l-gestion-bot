import {
  Client,
  GuildMember,
  Message,
  EmbedBuilder,
  TextChannel,
  ChannelType,
  Role,
} from "discord.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../../lib/logger";

// ─── Constantes ──────────────────────────────────────────────────────────────

export const PUNISHMENT_ROLE = "🪫 • CONTRE LES RÈGLES";
const PUNISHMENT_DURATION = 24 * 60 * 60 * 1000; // 24 heures en ms

const PUNISH_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../punishments.json"
);

// Liste de mots interdits (normalisés sans accents)
const BANNED_WORDS_RAW = [
  // Insultes graves
  "viole", "viol",
  "fdp", "fils de pute",
  "ntm", "nique ta mere", "nique ta mère",
  "encule", "enculé", "enculee",
  "salope",
  "batard", "batarde", "bâtard",
  "connard", "connasse",
  "va te faire foutre",
  // Discrimination
  "negro", "negre", "nègre",
  "pede", "pédé",
  // Sexuel
  "niquer", "nique",
  // Abrév
  "tg", // ta gueule (mot seul)
];

// Normalise un texte (accents → ascii, minuscules)
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " "); // ponctuation → espace
}

const BANNED_NORMALIZED = BANNED_WORDS_RAW.map(norm);

export function containsBannedWord(content: string): string | null {
  const n = norm(content);
  for (let i = 0; i < BANNED_NORMALIZED.length; i++) {
    const word = BANNED_NORMALIZED[i];
    // Chercher le mot entier (limites de mots ou sous-chaîne de plusieurs mots)
    const pattern = new RegExp(`(^|\\s)${word.replace(/ /g, "\\s+")}(\\s|$)`);
    if (pattern.test(n)) return BANNED_WORDS_RAW[i];
  }
  return null;
}

// ─── Persistance ─────────────────────────────────────────────────────────────

interface PunishRecord {
  roles: string[];    // IDs des rôles avant sanction
  punishedAt: number;
  expiresAt: number;
  reason: string;
}

type PunishData = Record<string, Record<string, PunishRecord>>;

function loadPunishments(): PunishData {
  try {
    if (existsSync(PUNISH_FILE)) return JSON.parse(readFileSync(PUNISH_FILE, "utf-8"));
  } catch {}
  return {};
}

function savePunishments(data: PunishData) {
  try { writeFileSync(PUNISH_FILE, JSON.stringify(data, null, 2)); } catch {}
}

// ─── Rôle sanction ───────────────────────────────────────────────────────────

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

// ─── Salon pour notifier la sanction ─────────────────────────────────────────

async function findNotifyChannel(member: GuildMember): Promise<TextChannel | null> {
  return (member.guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      (c.name.toLowerCase().includes("général") ||
        c.name.toLowerCase().includes("general") ||
        c.name.toLowerCase().includes("chat"))
  ) as TextChannel) ?? null;
}

// ─── Appliquer la sanction ────────────────────────────────────────────────────

export async function applyPunishment(
  member: GuildMember,
  triggerMessage: Message,
  word: string
) {
  // 1. Supprimer le message
  await triggerMessage.delete().catch(() => {});

  // 2. Vérifier que la personne n'est pas déjà sanctionnée
  const data = loadPunishments();
  const guildId = member.guild.id;
  const userId = member.id;
  if (data[guildId]?.[userId]) {
    logger.info(`${member.user.tag} déjà sanctionné — ignoré`);
    return;
  }

  // 3. Sauvegarder tous les rôles actuels (sauf @everyone)
  const savedRoles = member.roles.cache
    .filter((r) => r.id !== member.guild.id)
    .map((r) => r.id);

  // 4. Retirer tous les rôles
  try {
    await member.roles.set([]);
  } catch (err) {
    logger.warn({ err }, `Impossible de retirer les rôles de ${member.user.tag}`);
  }

  // 5. Donner le rôle sanction
  const punishRole = await ensurePunishRole(member);
  if (punishRole) {
    await member.roles.add(punishRole).catch(() => {});
  }

  // 6. Sauvegarder
  const now = Date.now();
  const expiresAt = now + PUNISHMENT_DURATION;
  if (!data[guildId]) data[guildId] = {};
  data[guildId][userId] = { roles: savedRoles, punishedAt: now, expiresAt, reason: word };
  savePunishments(data);

  // 7. Notifier dans un salon
  const ch = await findNotifyChannel(member);
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

  logger.info(`🪫 ${member.user.tag} sanctionné pour "${word}" jusqu'à ${new Date(expiresAt).toISOString()}`);

  // 8. Planifier la restauration
  const remaining = expiresAt - Date.now();
  setTimeout(() => restoreMember(member.guild.client, guildId, userId), remaining);
}

// ─── Restaurer les rôles ─────────────────────────────────────────────────────

export async function restoreMember(client: Client, guildId: string, userId: string) {
  const data = loadPunishments();
  const record = data[guildId]?.[userId];
  if (!record) return;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    // Membre parti → nettoyer quand même
    delete data[guildId][userId];
    savePunishments(data);
    return;
  }

  // Retirer le rôle sanction
  const punishRole = guild.roles.cache.find((r) => r.name === PUNISHMENT_ROLE);
  if (punishRole) {
    await member.roles.remove(punishRole).catch(() => {});
  }

  // Remettre les anciens rôles
  let restored = 0;
  for (const roleId of record.roles) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      await member.roles.add(role).catch(() => {});
      restored++;
    }
  }

  delete data[guildId][userId];
  savePunishments(data);

  // Notifier
  const ch = await findNotifyChannel(member);
  if (ch) {
    await ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00cc66)
          .setTitle("✅ Sanction levée")
          .setDescription(`${member} a retrouvé ses rôles après sa sanction de 24h.`)
          .addFields({ name: "Rôles restaurés", value: `**${restored}** rôle(s)` })
          .setFooter({ text: "MAI•GESTION" })
          .setTimestamp(),
      ],
    }).catch(() => {});
  }

  logger.info(`✅ Rôles restaurés pour ${member.user.tag} (${restored} rôles)`);
}

// ─── Vérifier si un membre est sanctionné ────────────────────────────────────

export function isPunished(guildId: string, userId: string): boolean {
  const data = loadPunishments();
  return Boolean(data[guildId]?.[userId]);
}

export function getPunishmentStatus(
  guildId: string,
  userId: string
): PunishRecord | null {
  const data = loadPunishments();
  return data[guildId]?.[userId] ?? null;
}

// ─── Initialisation au démarrage (survit aux redéploiements) ─────────────────

export async function initPunishments(client: Client) {
  const data = loadPunishments();
  let restored = 0;
  let scheduled = 0;

  for (const guildId of Object.keys(data)) {
    for (const userId of Object.keys(data[guildId])) {
      const record = data[guildId][userId];
      const remaining = record.expiresAt - Date.now();

      if (remaining <= 0) {
        // Sanction expirée → restaurer immédiatement
        await restoreMember(client, guildId, userId).catch(() => {});
        restored++;
      } else {
        // Sanction active → replanifier
        setTimeout(() => restoreMember(client, guildId, userId), remaining);
        scheduled++;
        logger.info(`⏱️ Sanction de ${userId} : restauration dans ${Math.round(remaining / 60000)} min`);
      }
    }
  }

  if (restored > 0 || scheduled > 0) {
    logger.info(`🪫 Punitions : ${restored} restaurées, ${scheduled} replanifiées`);
  }

  // Sécurité : scanner les membres avec le rôle sanction SANS données sauvegardées
  for (const [, guild] of client.guilds.cache) {
    await guild.members.fetch().catch(() => {});
    const punishRole = guild.roles.cache.find((r) => r.name === PUNISHMENT_ROLE);
    if (!punishRole) continue;

    for (const [, member] of guild.members.cache) {
      if (!member.roles.cache.has(punishRole.id)) continue;
      // Ce membre a le rôle mais pas de données → restaurer avec rôles minimaux
      if (!data[guild.id]?.[member.id]) {
        logger.warn(`${member.user.tag} avait le rôle sanction sans données → nettoyage`);
        await member.roles.remove(punishRole).catch(() => {});
      }
    }
  }
}
