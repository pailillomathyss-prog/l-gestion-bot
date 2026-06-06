import {
  TextChannel,
  EmbedBuilder,
  GuildMember,
  Guild,
  Role,
} from "discord.js";
import { logger } from "../../lib/logger";

export const RULES_REACTION = "✅";
export let rulesMessageId: string | null = null;

export function setRulesMessageId(id: string) {
  rulesMessageId = id;
}

async function getOrCreateMembreRole(guild: Guild): Promise<Role | null> {
  let role = guild.roles.cache.find(
    (r) => r.name.toLowerCase() === "membre" || r.name.toLowerCase() === "member"
  ) ?? null;

  if (!role) {
    try {
      role = await guild.roles.create({
        name: "Membre",
        reason: "Rôle créé automatiquement par le bot pour le règlement",
        permissions: [],
      });
      logger.info(`Rôle @Membre créé sur ${guild.name}`);
    } catch (err) {
      logger.error({ err }, "Impossible de créer le rôle @Membre");
      return null;
    }
  }
  return role;
}

export async function sendRulesMessage(channel: TextChannel): Promise<string | null> {
  const lines = [
    "Bienvenue ! Avant d'accéder au serveur, merci de lire et accepter les règles suivantes.",
    "",
    "**1. Respect**",
    "> Respecte tous les membres sans exception.",
    "",
    "**2. Pas de spam**",
    "> Ne flood pas les salons.",
    "",
    "**3. Pas de liens non autorisés**",
    "> Les pubs et liens suspects sont interdits sans autorisation du staff.",
    "",
    "**4. Contenu approprié**",
    "> Aucun contenu NSFW ou illégal.",
    "",
    "**5. Pseudo lisible**",
    "> Ton pseudo doit être mentionnable.",
    "",
    "**6. Respect du staff**",
    "> Les décisions du staff sont finales.",
    "",
    "**7. Langue**",
    "> Le français est la langue principale.",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━",
    "✅ **Réagis avec ✅ pour accepter le règlement et obtenir le rôle @Membre.**",
  ];

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📜 Règlement du serveur")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "En acceptant, tu t'engages à respecter ces règles." })
    .setTimestamp();

  try {
    const msg = await channel.send({ embeds: [embed] });
    await msg.react(RULES_REACTION);
    rulesMessageId = msg.id;
    logger.info(`Règlement envoyé dans #${channel.name} (id: ${msg.id})`);
    return msg.id;
  } catch (err) {
    logger.error({ err }, "Impossible d'envoyer le règlement");
    return null;
  }
}

export async function handleRulesReaction(
  member: GuildMember,
  messageId: string,
  action: "add" | "remove"
) {
  if (rulesMessageId && messageId !== rulesMessageId) return;
  const role = await getOrCreateMembreRole(member.guild);
  if (!role) return;
  try {
    if (action === "add") {
      await member.roles.add(role);
      logger.info(`Rôle @Membre donné à ${member.user.tag}`);
    } else {
      await member.roles.remove(role);
      logger.info(`Rôle @Membre retiré à ${member.user.tag}`);
    }
  } catch (err) {
    logger.warn({ err }, `Impossible de modifier le rôle @Membre pour ${member.user.tag}`);
  }
}
