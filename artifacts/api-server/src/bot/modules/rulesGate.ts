import {
  TextChannel,
  EmbedBuilder,
  GuildMember,
  PermissionFlagsBits,
  Guild,
} from "discord.js";
import { logger } from "../../lib/logger";

export const RULES_REACTION = "✅";
export let rulesMessageId: string | null = null;

export function setRulesMessageId(id: string) {
  rulesMessageId = id;
}

const ROLE_NAME = "Random";
const ROLE_COLOR = 0x5865f2;

async function getOrCreateRandomRole(guild: Guild) {
  let role = guild.roles.cache.find((r) => r.name === ROLE_NAME);
  if (!role) {
    try {
      role = await guild.roles.create({
        name: ROLE_NAME,
        color: ROLE_COLOR,
        reason: "Role cree automatiquement par le bot",
        permissions: [],
      });
      logger.info("Role @Random cree automatiquement");
    } catch (err) {
      logger.error({ err }, "Impossible de creer le role @Random");
      return null;
    }
  }
  return role;
}

export async function sendRulesMessage(channel: TextChannel): Promise<string | null> {
  const lines = [
    "Bienvenue ! Avant d'acceder au serveur, merci de lire et accepter les regles suivantes.",
    "",
    "**1. Respect**",
    "> Respecte tous les membres sans exception.",
    "",
    "**2. Pas de spam**",
    "> Ne flood pas les salons.",
    "",
    "**3. Pas de liens non autorises**",
    "> Les pubs et liens suspects sont interdits sans autorisation du staff.",
    "",
    "**4. Contenu approprie**",
    "> Aucun contenu NSFW ou illegal.",
    "",
    "**5. Pseudo lisible**",
    "> Ton pseudo doit etre mentionnable.",
    "",
    "**6. Respect du staff**",
    "> Les decisions du staff sont finales.",
    "",
    "**7. Langue**",
    "> Le francais est la langue principale.",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━",
    "✅ **Reagis avec ✅ pour accepter le reglement et obtenir le role @Random.**",
  ];

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📜 Reglement du serveur")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "En acceptant, tu t'engages a respecter ces regles." })
    .setTimestamp();

  try {
    const msg = await channel.send({ embeds: [embed] });
    await msg.react(RULES_REACTION);
    rulesMessageId = msg.id;
    logger.info("Message de regles envoye dans #" + channel.name + " (id: " + msg.id + ")");
    return msg.id;
  } catch (err) {
    logger.error({ err }, "Impossible d'envoyer le message de regles");
    return null;
  }
}

export async function handleRulesReaction(
  member: GuildMember,
  messageId: string,
  action: "add" | "remove"
) {
  if (rulesMessageId && messageId !== rulesMessageId) return;
  const randomRole = await getOrCreateRandomRole(member.guild);
  if (!randomRole) return;
  try {
    if (action === "add") {
      await member.roles.add(randomRole);
      logger.info("Role @Random donne a " + member.user.tag);
    } else {
      await member.roles.remove(randomRole);
      logger.info("Role @Random retire a " + member.user.tag);
    }
  } catch (err) {
    logger.warn({ err }, "Impossible de modifier le role @Random pour " + member.user.tag);
  }
}

export async function ensureMembresRolePermissions(guild: Guild) {
  const randomRole = await getOrCreateRandomRole(guild);
  if (!randomRole) return null;
  const everyoneRole = guild.roles.everyone;
  for (const [, channel] of guild.channels.cache) {
    const name = channel.name.toLowerCase();
    const isRules = name.includes("regles") || name.includes("reglements") || name.includes("rules");
    if (isRules) {
      try {
        await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel: true, SendMessages: false });
      } catch {}
      continue;
    }
    try {
      await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel: false });
      await channel.permissionOverwrites.edit(randomRole, { ViewChannel: true, SendMessages: true });
    } catch {}
  }
  return randomRole;
}