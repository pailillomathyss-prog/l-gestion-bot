import { Message, PermissionFlagsBits, ChannelType } from "discord.js";
import { logger } from "../../lib/logger";
import { antiLink } from "../modules/antiLink";
import { handleMessageXP } from "../modules/expSystem";
import { handleBoostMessage } from "../modules/boostAnnounce";
import { banCommand, unbanCommand } from "../commands/ban";
import { lockCommand, unlockCommand } from "../commands/lock";
import { muteCommand, demuteCommand } from "../commands/mute";
import { clearCommand } from "../commands/clear";
import { rankCommand } from "../modules/expSystem";
import { leaderboardCommand } from "../commands/leaderboard";
import { helpCommand } from "../commands/help";
import { restoreXpCommand } from "../commands/restorexp";
import { syncPermsCommand } from "../commands/syncperms";
import { coinflipCommand, slotCommand } from "../commands/games";
import { shopCommand, balanceCommand } from "../commands/shop";
import { giveawayCommand } from "../commands/giveaway";
import { addCoinsCommand } from "../commands/addcoins";
import { getCoins } from "../modules/db";

const PREFIX = "!";

export async function handleMessage(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (message.channel.type !== ChannelType.GuildText) return;

  // Boost detect
  await handleBoostMessage(message).catch(() => {});

  // Anti-link
  if (!message.content.startsWith(PREFIX)) {
    await antiLink(message).catch(() => {});
    await handleMessageXP(message.member!).catch(() => {});
    return;
  }

  // Commands
  const args    = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();
  if (!command) return;

  try {
    switch (command) {
      // Modération
      case "ban":         await banCommand(message, args); break;
      case "unban":       await unbanCommand(message, args); break;
      case "mute":        await muteCommand(message, args); break;
      case "demute":      await demuteCommand(message, args); break;
      case "lock":        await lockCommand(message, args); break;
      case "unlock":      await unlockCommand(message, args); break;
      case "clear":       await clearCommand(message, args); break;
      case "syncperms":   await syncPermsCommand(message); break;
      case "restorexp":   await restoreXpCommand(message, args); break;
      case "addcoins":
      case "addcoin":     await addCoinsCommand(message, args); break;

      // XP
      case "rank":        await rankCommand(message); break;
      case "leaderboard":
      case "lb":          await leaderboardCommand(message); break;

      // Économie
      case "balance":
      case "solde":       await balanceCommand(message); break;
      case "shop":
      case "boutique":    await shopCommand(message); break;

      // Jeux
      case "coinflip":
      case "flip":        await coinflipCommand(message, args); break;
      case "slot":
      case "slots":       await slotCommand(message, args); break;

      // Giveaway
      case "giveaway":    await giveawayCommand(message, args); break;

      // Aide
      case "help":
      case "aide":        await helpCommand(message); break;

      default: break;
    }
  } catch (err) {
    logger.error({ err }, `Erreur commande !${command}`);
    await message.reply("❌ Une erreur est survenue.").catch(() => {});
  }
}
