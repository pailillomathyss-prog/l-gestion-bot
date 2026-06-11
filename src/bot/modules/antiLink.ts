import { Message, PermissionFlagsBits, EmbedBuilder, TextChannel } from "discord.js";
import { logAntiLink } from "./modLogs";

const LINK_REGEX = /https?:\/\/[^\s]+|discord\.gg\/[^\s]+|www\.[^\s]+\.[a-z]{2,}/gi;

export async function antiLink(message: Message) {
  if (!message.guild || !message.member) return;

  const hasModPerms =
    message.member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    message.member.permissions.has(PermissionFlagsBits.Administrator);
  if (hasModPerms) return;

  LINK_REGEX.lastIndex = 0;
  if (!LINK_REGEX.test(message.content)) return;
  LINK_REGEX.lastIndex = 0;

  const canDelete = message.guild.members.me?.permissions.has(PermissionFlagsBits.ManageMessages);
  if (!canDelete) return;

  const content = message.content;
  await message.delete().catch(() => {});

  const warning = await message.channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0xff6b35)
      .setTitle("🔗 Anti-Lien activé")
      .setDescription(`${message.author}, les liens ne sont pas autorisés sur ce serveur !`)
      .setFooter({ text: "Ce message sera supprimé dans 5 secondes" })
      .setTimestamp()],
  }).catch(() => null);

  if (warning) setTimeout(() => warning.delete().catch(() => {}), 5000);
  await logAntiLink(message.guild, message.author, message.channel as TextChannel, content);
}
