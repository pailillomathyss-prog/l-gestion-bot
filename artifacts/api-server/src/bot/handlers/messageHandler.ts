import { Message, PermissionFlagsBits } from "discord.js";
import { logger } from "../../lib/logger";
import { antiLink } from "../modules/antiLink";
import { handleXP } from "../modules/expSystem";
import { handleBoostMessage } from "../modules/boostAnnounce";
import { banCommand, unbanCommand } from "../commands/ban";
import { lockCommand, unlockCommand } from "../commands/lock";
import { muteCommand, demuteCommand } from "../commands/mute";
import { clearCommand } from "../commands/clear";
import { rankCommand } from "../commands/rank";

const PREFIX = "!";

export async function handleMessage(message: Message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  // Messages système Discord (boosts, etc.)
  await handleBoostMessage(message).catch(() => {});

  if (!message.content.startsWith(PREFIX)) {
    await antiLink(message);
    if (message.member) await handleXP(message.member);
    return;
  }

  await antiLink(message);

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();
  if (!command) return;

  // Commandes accessibles à TOUT le monde
  try {
    switch (command) {
      case "rank":
      case "level":
      case "xp":
        await rankCommand(message, args);
        return;
    }
  } catch (err) {
    logger.error({ err }, `Erreur commande publique: ${command}`);
    await message.reply("❌ Une erreur s'est produite.").catch(() => {});
    return;
  }

  // Commandes réservées aux administrateurs
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
    logger.error({ err }, `Erreur commande admin: ${command}`);
    await message.reply("❌ Une erreur s'est produite.").catch(() => {});
  }
}
