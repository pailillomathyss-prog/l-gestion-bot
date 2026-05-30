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

export async function sendRulesMessage(channel: TextChannel): Promise<string | null> {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📜 Règlement du serveur")
    .setDescription(
      [
        "Bienvenue ! Avant d'accéder au serveur, merci de lire et accepter les règles suivantes.\n",
        "**1. 🤝 Respect**",
        "> Respecte tous les membres sans exception. Aucune discrimination, insulte ou harcèlement ne sera toléré.\n",
        "**2. 🔇 Pas de spam**",
        "> Ne flood pas les salons. Un message suffit, inutile de le répéter.\n",
        "**3. 🔗 Pas de liens non autorisés**",
        "> Les publicités, liens de serveurs Discord ou liens suspects sont interdits sans autorisation du staff.\n",
        "**4. 🔞 Contenu approprié**",
        "> Aucun contenu NSFW, choquant ou illégal. Ce serveur est accessible à tous les âges.\n",
        "**5. 📛 Pseudo lisible**",
        "> Ton pseudo doit être lisible (pas de caractères spéciaux impossibles à mentionner).\n",
        "**6. 👮 Respect du staff**",
        "> Les décisions du staff sont finales. Si tu as un désaccord, ouvre un ticket calmement.\n",
        "**7. 🌐 Langue**",
        "> Le français est la langue principale du serveur.\n",
        "━━━━━━━━━━━━━━━━━━━━━━",
        "✅ **Réagis avec ✅ ci-dessous pour accepter le règlement et accéder au serveur.**",
      ].join("\n")
    )
    .setFooter({ text: "En acceptant, tu t'engages à respecter ces règles." })
    .setTimestamp();

  try {
    const msg = await channel.send({ embeds: [embed] });
    await msg.react(RULES_REACTION);
    rulesMessageId = msg.id;
    logger.info(`Message de règles envoyé dans #${channel.name} (id: ${msg.id})`);
    return msg.id;
  } catch (err) {
    logger.error({ err }, "Impossible d'envoyer le message de règles");
    return null;
  }
}

export async function handleRulesReaction(
  member: GuildMember,
  messageId: string,
  action: "add" | "remove"
) {
  if (rulesMessageId && messageId !== rulesMessageId) return;

  const guild = member.guild;
  let membresRole = guild.roles.cache.find((r) => r.name.toLowerCase() === "membres");

  if (!membresRole) {
    try {
      membresRole = await guild.roles.create({
        name: "membres",
        color: 0x57f287,
        reason: "Rôle créé automatiquement par le bot (acceptation du règlement)",
        permissions: [],
      });
      logger.info("Rôle @membres créé automatiquement");
    } catch (err) {
      logger.error({ err }, "Impossible de créer le rôle @membres");
      return;
    }
  }

  try {
    if (action === "add") {
      await member.roles.add(membresRole);
      logger.info(`Rôle @membres donné à ${member.user.tag}`);
    } else {
      await member.roles.remove(membresRole);
    }
  } catch (err) {
    logger.warn({ err }, `Impossible de modifier le rôle @membres pour ${member.user.tag}`);
  }
}

export async function ensureMembresRolePermissions(guild: Guild) {
  let membresRole = guild.roles.cache.find((r) => r.name.toLowerCase() === "membres");

  if (!membresRole) {
    try {
      membresRole = await guild.roles.create({
        name: "membres",
        color: 0x57f287,
        reason: "Rôle membres créé par le bot",
        permissions: [],
      });
    } catch {
      return null;
    }
  }

  const everyoneRole = guild.roles.everyone;

  for (const [, channel] of guild.channels.cache) {
    const name = channel.name.toLowerCase();
    const isRulesOrLanding =
      name.includes("règles") || name.includes("regles") || name.includes("règlement");

    if (isRulesOrLanding) continue;

    try {
      await channel.permissionOverwrites.edit(everyoneRole, {
        ViewChannel: false,
      });
      await channel.permissionOverwrites.edit(membresRole, {
        ViewChannel: true,
      });
    } catch {
    }
  }

  return membresRole;
}
