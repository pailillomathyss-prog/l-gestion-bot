import {
  TextChannel,
  EmbedBuilder,
  GuildMember,
  Guild,
  ChannelType,
  Role,
} from "discord.js";
import { logger } from "../../lib/logger";

export const ENTER_REACTION = "✅";
export let rulesMessageId: string | null = null;

export function setRulesMessageId(id: string) {
  rulesMessageId = id;
}

// Nom exact du rôle sur Discord (caractère ・ = U+30FB)
const NOUVEAUX_ROLE = "⏳・nouveaux";

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
 * Synchronise les permissions de TOUS les salons :
 *  - @everyone : ne voit QUE #règlement (lecture seule)
 *  - ⏳・nouveaux : voit TOUS les salons
 *  - Salons staff/mod/admin/log : non touchés
 */
export async function syncChannelPermissions(guild: Guild): Promise<void> {
  const nouveauxRole = await ensureNouveauxRole(guild);
  if (!nouveauxRole) return;

  // Forcer le chargement de tous les salons depuis l'API
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

    // Ne jamais toucher les salons staff/mod/log
    if (isStaffChannel(channel.name)) {
      skipped++;
      continue;
    }

    try {
      if (isRulesChannel(channel.name)) {
        // #règlement : @everyone peut voir (lecture seule), nouveaux aussi
        await channel.permissionOverwrites.edit(everyone, {
          ViewChannel: true,
          SendMessages: false,
          AddReactions: true,
        });
        await channel.permissionOverwrites.edit(nouveauxRole, {
          ViewChannel: true,
          SendMessages: false,
          AddReactions: true,
        });
      } else {
        // Tous les autres : @everyone masqué, nouveaux peut accéder
        await channel.permissionOverwrites.edit(everyone, {
          ViewChannel: false,
        });
        await channel.permissionOverwrites.edit(nouveauxRole, {
          ViewChannel: true,
          SendMessages: channel.type === ChannelType.GuildText ||
                        channel.type === ChannelType.GuildAnnouncement ||
                        channel.type === ChannelType.GuildForum
                        ? true : null,
          Connect: channel.type === ChannelType.GuildVoice ||
                   channel.type === ChannelType.GuildStageVoice
                   ? true : null,
          AddReactions: true,
        });
      }
      synced++;
    } catch (err) {
      logger.warn({ err }, `Impossible de sync #${channel.name}`);
    }
  }

  logger.info(
    `✅ Permissions synchronisées sur "${guild.name}" — ${synced} salons traités, ${skipped} salons staff ignorés`
  );
}

export async function sendEnterMessage(channel: TextChannel): Promise<string | null> {
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
    logger.info(`Message "entrer ?" envoyé dans #${channel.name} (id: ${msg.id})`);
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
  // Accepter si on ne connaît pas encore l'ID du message (sécurité)
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
