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

// Nom exact du rôle (caractère ・ = U+30FB)
const NOUVEAUX_ROLE = "⏳・nouveaux";

// Salons où PERSONNE ne peut écrire (lecture seule pour tout le monde)
const READ_ONLY_CHANNELS = [
  "⛩️・annonce",
  "⚡・giveaway",
  "☎️・événement",
  "💎・boost",
  "🎯・règlement",
  "🌏・bienvenue",
];

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

async function ensureNouveauxRole(guild: Guild): Promise<Role | null> {
  await guild.roles.fetch();
  let role = guild.roles.cache.find((r) => r.name === NOUVEAUX_ROLE);
  if (!role) {
    try {
      role = await guild.roles.create({
        name: NOUVEAUX_ROLE,
        reason: "Rôle d'entrée créé automatiquement par MAI•GESTION",
        permissions: [],
      });
      logger.info(`Rôle "${NOUVEAUX_ROLE}" créé sur ${guild.name}`);
    } catch (err) {
      logger.error({ err }, `Impossible de créer le rôle "${NOUVEAUX_ROLE}"`);
      return null;
    }
  }
  return role;
}

/**
 * Synchronise les permissions de TOUS les salons.
 *
 * Règles :
 *  - @everyone : ne voit QUE le salon règlement (lecture seule)
 *  - ⏳・nouveaux : voit tous les salons
 *  - Salons en lecture seule (annonce, giveaway, événement, boost, règlement, bienvenue) :
 *      → ni @everyone ni ⏳・nouveaux ne peuvent écrire
 *  - Salons staff/mod/admin/log : non touchés
 */
export async function syncChannelPermissions(guild: Guild): Promise<void> {
  const nouveauxRole = await ensureNouveauxRole(guild);
  if (!nouveauxRole) return;

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

    const isRules   = isRulesChannel(channel.name);
    const isReadOnly = isReadOnlyChannel(channel.name);
    const isTextLike = (
      channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildAnnouncement ||
      channel.type === ChannelType.GuildForum
    );
    const isVoiceLike = (
      channel.type === ChannelType.GuildVoice ||
      channel.type === ChannelType.GuildStageVoice
    );

    try {
      if (isRules || isReadOnly) {
        // Salon règlement OU salon en lecture seule :
        //   @everyone  → visible (lecture seule, peut réagir)
        //   nouveaux   → visible (lecture seule, peut réagir)
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
      } else {
        // Autres salons : @everyone masqué, nouveaux a accès complet
        await channel.permissionOverwrites.edit(everyone, {
          ViewChannel: false,
        });
        await channel.permissionOverwrites.edit(nouveauxRole, {
          ViewChannel: true,
          SendMessages: isTextLike ? true : null,
          Connect: isVoiceLike ? true : null,
          AddReactions: true,
        });
      }
      synced++;
    } catch (err) {
      logger.warn({ err }, `Impossible de sync #${channel.name}`);
    }
  }

  logger.info(
    `✅ Permissions sync sur "${guild.name}" — ${synced} salons, ${skipped} ignorés`
  );
}

/**
 * Cherche le message d'entrée existant dans le salon règlement.
 * 1. Tente de récupérer par l'ID sauvegardé
 * 2. Si introuvable, scanne les 50 derniers messages du bot pour retrouver l'embed
 * 3. Si vraiment absent → en envoie un nouveau
 *
 * Retourne l'ID du message (existant ou nouveau).
 */
export async function findOrSendEnterMessage(
  channel: TextChannel,
  savedId: string | null,
  guildId: string
): Promise<string | null> {
  // 1. Vérifier l'ID sauvegardé
  if (savedId) {
    const existing = await channel.messages.fetch(savedId).catch(() => null);
    if (existing) {
      rulesMessageId = savedId;
      logger.info(`📌 Message "entrer ?" retrouvé par ID dans #${channel.name}`);
      return savedId;
    }
  }

  // 2. Scanner les 50 derniers messages pour retrouver le message du bot
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
      saveRulesMessageId(guildId, botMsg.id);
      logger.info(`📌 Message "entrer ?" retrouvé par scan dans #${channel.name}`);
      return botMsg.id;
    }
  } catch (err) {
    logger.warn({ err }, "Erreur lors du scan des messages du salon");
  }

  // 3. Aucun message trouvé → en envoyer un nouveau
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
    saveRulesMessageId(guildId, msg.id);
    logger.info(`📨 Message "entrer ?" envoyé dans #${channel.name} (id: ${msg.id})`);
    return msg.id;
  } catch (err) {
    logger.error({ err }, "Impossible d'envoyer le message d'entrée");
    return null;
  }
}

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
