import {
  TextChannel,
  EmbedBuilder,
  GuildMember,
  Guild,
  ChannelType,
  PermissionsBitField,
} from "discord.js";
import { logger } from "../../lib/logger";

export const ENTER_REACTION = "✅";
export let rulesMessageId: string | null = null;

export function setRulesMessageId(id: string) {
  rulesMessageId = id;
}

const NOUVEAUX_ROLE = "⏳ • nouveaux";

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
    n.includes("mod") ||
    n.includes("admin") ||
    n.includes("log") ||
    n.includes("moderator")
  );
}

async function getNouveauxRole(guild: Guild) {
  return guild.roles.cache.find((r) => r.name === NOUVEAUX_ROLE) ?? null;
}

/**
 * Synchronise les permissions des salons :
 * - #règlement : visible par @everyone (lecture seule), tout le monde peut y réagir
 * - Tous les autres salons (hors staff) : masqués à @everyone, accessibles au rôle ⏳ • nouveaux
 * - Salons staff/mod/admin/log : non touchés
 */
export async function syncChannelPermissions(guild: Guild): Promise<void> {
  const nouveauxRole = await getNouveauxRole(guild);
  if (!nouveauxRole) {
    logger.warn(`Rôle "${NOUVEAUX_ROLE}" introuvable — synchronisation annulée sur ${guild.name}`);
    return;
  }

  const everyone = guild.roles.everyone;
  let synced = 0;
  let skipped = 0;

  for (const [, channel] of guild.channels.cache) {
    // Ignorer les catégories et les salons vocaux (on gère que les textuels + catégories)
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildVoice &&
      channel.type !== ChannelType.GuildCategory &&
      channel.type !== ChannelType.GuildForum &&
      channel.type !== ChannelType.GuildAnnouncement
    ) continue;

    // Ne pas toucher les salons staff/mod/admin
    if (isStaffChannel(channel.name)) {
      skipped++;
      continue;
    }

    try {
      if (isRulesChannel(channel.name)) {
        // #règlement : @everyone peut voir mais pas écrire
        await channel.permissionOverwrites.edit(everyone, {
          ViewChannel: true,
          SendMessages: false,
          AddReactions: true,
        });
        // ⏳ • nouveaux voit aussi
        await channel.permissionOverwrites.edit(nouveauxRole, {
          ViewChannel: true,
          SendMessages: false,
          AddReactions: true,
        });
      } else {
        // Tous les autres : @everyone ne voit pas, ⏳ • nouveaux voit et écrit
        await channel.permissionOverwrites.edit(everyone, {
          ViewChannel: false,
        });
        await channel.permissionOverwrites.edit(nouveauxRole, {
          ViewChannel: true,
          SendMessages: true,
          AddReactions: true,
        });
      }
      synced++;
    } catch (err) {
      logger.warn({ err }, `Impossible de sync les permissions de #${channel.name}`);
    }
  }

  logger.info(`Permissions synchronisées sur ${guild.name} — ${synced} salons traités, ${skipped} salons staff ignorés`);
}

export async function sendEnterMessage(channel: TextChannel): Promise<string | null> {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("✦ Bienvenue ✦")
    .setDescription(
      `Réagis avec ${ENTER_REACTION} pour **entrer** sur le serveur et accéder à tous les salons.`
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
  if (rulesMessageId && messageId !== rulesMessageId) return;

  const role = await getNouveauxRole(member.guild);
  if (!role) {
    logger.warn(`Rôle "${NOUVEAUX_ROLE}" introuvable sur ${member.guild.name}`);
    return;
  }

  try {
    if (action === "add") {
      await member.roles.add(role);
      logger.info(`Rôle "${NOUVEAUX_ROLE}" donné à ${member.user.tag}`);
    } else {
      await member.roles.remove(role);
      logger.info(`Rôle "${NOUVEAUX_ROLE}" retiré à ${member.user.tag}`);
    }
  } catch (err) {
    logger.warn({ err }, `Impossible de modifier le rôle pour ${member.user.tag}`);
  }
}
