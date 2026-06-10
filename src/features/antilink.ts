import { Message, PermissionFlagsBits, EmbedBuilder, GuildMember } from "discord.js";

// Patterns d'URLs et liens
const LINK_REGEX = /(?:https?:\/\/|www\.|discord\.gg\/)[^\s]+/gi;
const DISCORD_INVITE = /discord(?:\.gg|app\.com\/invite|\.com\/invite)\/[a-zA-Z0-9-]+/gi;

function hasLink(content: string): boolean {
  return LINK_REGEX.test(content) || DISCORD_INVITE.test(content);
}

function reset() {
  LINK_REGEX.lastIndex = 0;
  DISCORD_INVITE.lastIndex = 0;
}

export async function checkAntiLink(message: Message): Promise<boolean> {
  if (!message.guild || !message.member) return false;
  const member = message.member as GuildMember;

  // Admins et ceux avec "Gérer les messages" sont exempts
  if (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageMessages)
  ) return false;

  reset();
  if (!hasLink(message.content)) return false;

  // Supprimer le message
  await message.delete().catch(() => {});

  // Avertir l'utilisateur (ephemeral impossible sur message ordinaire — on envoie dans le canal)
  const warn = await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle("🔗 Lien non autorisé")
        .setDescription(`${member}, les liens ne sont pas autorisés ici.\nSi tu veux partager quelque chose, demande à un admin.`)
        .setFooter({ text: "MAI•GESTION" }).setTimestamp()
    ]
  }).catch(() => null);

  // Supprimer l'avertissement après 8 secondes
  if (warn) setTimeout(() => warn.delete().catch(() => {}), 8000);
  return true;
}
