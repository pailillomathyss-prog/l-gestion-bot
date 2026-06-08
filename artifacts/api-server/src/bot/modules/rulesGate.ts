import { TextChannel, EmbedBuilder, GuildMember, Guild } from "discord.js";
import { logger } from "../../lib/logger";

export const ENTER_REACTION = "✅";
export let rulesMessageId: string | null = null;

export function setRulesMessageId(id: string) {
  rulesMessageId = id;
}

const NOUVEAUX_ROLE = "⏳ • nouveaux";

async function getNouveauxRole(guild: Guild) {
  return guild.roles.cache.find((r) => r.name === NOUVEAUX_ROLE) ?? null;
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
