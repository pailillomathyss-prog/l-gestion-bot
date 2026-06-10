import { Message, PermissionFlagsBits } from "discord.js";
import { logger } from "../../lib/logger.js";

const LINK_REGEX = /(https?:\/\/|discord\.gg\/|discord\.com\/invite\/)/i;
const WHITELIST = ["tenor.com", "giphy.com", "youtube.com", "youtu.be", "twitch.tv"];

export async function antiLink(message: Message) {
  if (!message.guild || !message.member) return;
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
  if (!LINK_REGEX.test(message.content)) return;
  const isWhitelisted = WHITELIST.some(d => message.content.toLowerCase().includes(d));
  if (isWhitelisted) return;
  try {
    await message.delete();
    const warn = await message.channel.send(`❌ <@${message.author.id}> — Les liens ne sont pas autorisés ici !`);
    setTimeout(() => warn.delete().catch(() => {}), 5000);
  } catch (err) {
    logger.warn({ err }, "antiLink: impossible de supprimer le message");
  }
}
