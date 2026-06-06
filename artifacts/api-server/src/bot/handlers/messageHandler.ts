import { Message, PermissionFlagsBits } from "discord.js";
import { logger } from "../../lib/logger";
import { antiLink } from "../modules/antiLink";
import { banCommand, unbanCommand } from "../commands/ban";
import { lockCommand, unlockCommand } from "../commands/lock";
import { muteCommand, demuteCommand } from "../commands/mute";
import { clearCommand } from "../commands/clear";

const PREFIX = "!";

export async function handleMessage(message: Message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  if (!message.content.startsWith(PREFIX)) {
    await antiLink(message);
    return;
  }

  await antiLink(message);

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();
  if (!command) return;

  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

  try {
    switch (command) {
      case "ban":
        await banCommand(message, args);
        break;
      case "unban":
        await unbanCommand(message, args);
        break;
      case "lock":
        await lockCommand(message, args);
        break;
      case "unlock":
        await unlockCommand(message, args);
        break;
      case "mute":
        await muteCommand(message, args);
        break;
      case "demute":
      case "unmute":
        await demuteCommand(message, args);
        break;
      case "clear":
      case "purge":
        await clearCommand(message, args);
        break;
      default:
        break;
    }
  } catch (err) {
    logger.error({ err }, `Erreur commande: ${command}`);
    await message.reply("❌ Une erreur s'est produite.").catch(() => {});
  }
}
