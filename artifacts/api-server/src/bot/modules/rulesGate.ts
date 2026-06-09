import {
  TextChannel,
  EmbedBuilder,
  GuildMember,
  Guild,
  ChannelType,
  Role,
} from "discord.js";
import { logger } from "../../lib/logger";
import { saveRulesMessageId } from "../state";

export const ENTER_REACTION = "✅";
export let rulesMessageId: string | null = null;

export function setRulesMessageId(id: string) {
  rulesMessageId = id;
}

// Noms exacts des rôles (caractère ・ = U+30FB pour nouveaux)
const NOUVEAUX_ROLE    = "⏳・nouveaux";
const PUNISHMENT_ROLE  = "🪫 • CONTRE LES RÈGLES";

// Salons où PERSONNE ne peut écrire (lecture seule)
const READ_ONLY_CHANNELS = [
  "⛩️・annonce",
  "⚡・giveaway",
  "☎️・événement",
  "💎・boost",
  "🎯・règlement",
  "🌏・bienvenue",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isRulesChannel(name: string) {
  const n = normalize(name);
  return n.includes("reglement") || n.includes("rules") || n.includes("regles");
}

function isStaffChannel(name: string) {
  const n = normalize(name);
  return (
    n.includes("staff") ||
    n.includes("moderator") ||
    n.includes("admin") ||
    n.includes("log") ||
    n === "mod" ||
    n.startsWith("mod-") ||
    n.endsWith("-mod")
  );
}

function isReadOnlyChannel(name: string) {
  return READ_ONLY_CHANNELS.includes(name);
}

/** Catégorie/salon "jugement" → espace prison visible SEULEMENT par 🪫 */
function isJugementChannel(name: string) {
  const n = normalize(name);
  return n.includes("jugement") || n.includes("jugment") || n.includes("prison") || n.includes("sanction");
}

// ─── Roles helpers ────────────────────────────────────────────────────────────

async function ensureRole(guild: Guild, roleName: string, color?: number): Promise<Role | null> {
  await guild.roles.fetch();
  let role = guild.roles.cache.find((r) => r.name === roleName);
  if (!role) {
    try {
      role = await guild.roles.create({
        name: roleName,
        color: color ?? 0x000000,
        reason: "Rôle créé automatiquement par MAI•GESTION",
        permissions: [],
      });
      logger.info(`Rôle "${roleName}" créé sur ${guild.name}`);
    } catch (err) {
      logger.error({ err }, `Impossible de créer le rôle "${roleName}"`);
      return null;
    }
  }
  return role;
}

async function ensureNouveauxRole(guild: Guild): Promise<Role | null> {
  return ensureRole(guild, NOUVEAUX_ROLE);
}

// ─── Sync des permissions ─────────────────────────────────────────────────────

/**
 * Synchronise les permissions de TOUS les salons.
 *
 * Règles :
 *  - @everyone     → seulement #règlement (lecture seule)
 *  - ⏳・nouveaux  → tous les salons sauf ⚖️ J U G E M E N T
 *  - 🪫 sanction   → SEULEMENT ⚖️ J U G E M E N T (peut écrire pour !warn)
 *                    + #règlement (lecture seule via @everyone, aucun override)
 *  - staff/mod/log → non touchés
 */
export async function syncChannelPermissions(guild: Guild): Promise<void> {
  const nouveauxRole = await ensureNouveauxRole(guild);
  if (!nouveauxRole) return;

  // Chercher/créer le rôle punition
  await guild.roles.fetch();
  const punishRole = guild.roles.cache.find((r) => r.name === PUNISHMENT_ROLE) ?? null;

  await guild.channels.fetch();
  const everyone = guild.roles.everyone;

  let synced = 0;
  let skipped = 0;

  for (const [, channel] of guild.channels.cache) {
    const allowed = [
      ChannelType.GuildText,
      ChannelType.GuildVoice,
      ChannelType.GuildCategory,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildForum,
      ChannelType.GuildStageVoice,
    ] as number[];

    if (!allowed.includes(channel.type)) continue;

    if (isStaffChannel(channel.name)) {
      skipped++;
      continue;
    }

    const isJugement  = isJugementChannel(channel.name);
    const isRules     = isRulesChannel(channel.name);
    const isReadOnly  = isReadOnlyChannel(channel.name);
    const isTextLike  = (
      channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildAnnouncement ||
      channel.type === ChannelType.GuildForum
    );
    const isVoiceLike = (
      channel.type === ChannelType.GuildVoice ||
      channel.type === ChannelType.GuildStageVoice
    );

    try {
      if (isJugement) {
        // ⚖️ J U G E M E N T ─ SEULEMENT visible par 🪫
        // @everyone et ⏳・nouveaux : explicitement bloqués
        await channel.permissionOverwrites.edit(everyone, { ViewChannel: false });
        await channel.permissionOverwrites.edit(nouveauxRole, { ViewChannel: false });
        if (punishRole) {
          await channel.permissionOverwrites.edit(punishRole, {
            ViewChannel: true,
            SendMessages: isTextLike ? true : null,
            Connect: isVoiceLike ? true : null,
            ReadMessageHistory: true,
            AddReactions: true,
          });
        }

      } else if (isRules || isReadOnly) {
        // #règlement + salons lecture seule ─ @everyone et nouveaux lisent
        // 🪫 : BLOQUÉ partout sauf jugement
        await channel.permissionOverwrites.edit(everyone, {
          ViewChannel: true,
          SendMessages: false,
          SendMessagesInThreads: false,
          AddReactions: true,
        });
        await channel.permissionOverwrites.edit(nouveauxRole, {
          ViewChannel: true,
          SendMessages: false,
          SendMessagesInThreads: false,
          AddReactions: true,
        });
        if (punishRole) {
          await channel.permissionOverwrites.edit(punishRole, { ViewChannel: false });
        }

      } else {
        // Salons normaux ─ @everyone masqué, nouveaux accède, 🪫 explicitement bloqué
        await channel.permissionOverwrites.edit(everyone, { ViewChannel: false });
        await channel.permissionOverwrites.edit(nouveauxRole, {
          ViewChannel: true,
          SendMessages: isTextLike ? true : null,
          Connect: isVoiceLike ? true : null,
          AddReactions: true,
        });
        if (punishRole) {
          await channel.permissionOverwrites.edit(punishRole, { ViewChannel: false });
        }
      }

      synced++;
    } catch (err) {
      logger.warn({ err }, `Impossible de sync #${channel.name}`);
    }
  }

  logger.info(
    `✅ Permissions sync sur "${guild.name}" — ${synced} salons, ${skipped} staff ignorés`
  );
}

// ─── Message "entrer ?" persistant ───────────────────────────────────────────

/**
 * 1. Cherche par ID sauvegardé
 * 2. Scanne les 50 derniers messages du bot
 * 3. Envoie un nouveau message si vraiment absent
 */
export async function findOrSendEnterMessage(
  channel: TextChannel,
  savedId: string | null,
  guildId: string
): Promise<string | null> {
  if (savedId) {
    const existing = await channel.messages.fetch(savedId).catch(() => null);
    if (existing) {
      rulesMessageId = savedId;
      logger.info(`📌 Message "entrer ?" retrouvé par ID dans #${channel.name}`);
      return savedId;
    }
  }

  try {
    const recent = await channel.messages.fetch({ limit: 50 });
    const botMsg = recent.find(
      (m) =>
        m.author.id === channel.client.user?.id &&
        m.embeds.length > 0 &&
        m.reactions.cache.has(ENTER_REACTION)
    );
    if (botMsg) {
      rulesMessageId = botMsg.id;
      await saveRulesMessageId(guildId, botMsg.id);
      logger.info(`📌 Message "entrer ?" retrouvé par scan dans #${channel.name}`);
      return botMsg.id;
    }
  } catch (err) {
    logger.warn({ err }, "Erreur lors du scan des messages du salon");
  }

  return sendEnterMessage(channel, guildId);
}

async function sendEnterMessage(
  channel: TextChannel,
  guildId: string
): Promise<string | null> {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("✦ Bienvenue ✦")
    .setDescription(
      [
        `Pour **accéder** au serveur, réagis avec ${ENTER_REACTION} ci-dessous.`,
        "",
        `Tu recevras le rôle **${NOUVEAUX_ROLE}** et tous les salons s'ouvriront.`,
      ].join("\n")
    )
    .setFooter({ text: "MAI•GESTION" })
    .setTimestamp();

  try {
    const msg = await channel.send({ embeds: [embed] });
    await msg.react(ENTER_REACTION);
    rulesMessageId = msg.id;
    await saveRulesMessageId(guildId, msg.id);
    logger.info(`📨 Message "entrer ?" envoyé dans #${channel.name} (id: ${msg.id})`);
    return msg.id;
  } catch (err) {
    logger.error({ err }, "Impossible d'envoyer le message d'entrée");
    return null;
  }
}

// ─── Réaction d'entrée ────────────────────────────────────────────────────────

export async function handleEnterReaction(
  member: GuildMember,
  messageId: string,
  action: "add" | "remove"
) {
  if (rulesMessageId && messageId !== rulesMessageId) return;

  const role = await ensureNouveauxRole(member.guild);
  if (!role) return;

  try {
    if (action === "add") {
      await member.roles.add(role);
      logger.info(`✅ Rôle "${NOUVEAUX_ROLE}" donné à ${member.user.tag}`);
    } else {
      await member.roles.remove(role);
      logger.info(`🔴 Rôle "${NOUVEAUX_ROLE}" retiré à ${member.user.tag}`);
    }
  } catch (err) {
    logger.warn({ err }, `Impossible de modifier le rôle pour ${member.user.tag}`);
  }
}
