import { Message,
  PermissionFlagsBits} from "discord.js";
import { logger } from "../../lib/logger";
import { banCommand } from "../commands/ban";
import { debanCommand } from "../commands/deban";
import { lockCommand, unlockCommand } from "../commands/lock";
import { clearCommand } from "../commands/clear";
import { giveawayCommand } from "../commands/giveaway";
import { setupCommand } from "../commands/setup";
import { deleteSetupCommand } from "../commands/deleteSetup";
import { muteCommand, unmuteCommand } from "../commands/mute";
import { antiLink } from "../modules/antiLink";

const PREFIX = "!";

export async function handleMessage(message: Message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  const isCommand = message.content.startsWith(PREFIX);

  if (!isCommand) {
    await antiLink(message);
    return;
  }

  await antiLink(message);

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (!command) return;

  try {
    // 🔒 Seuls les administrateurs peuvent utiliser les commandes du bot
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
      return;
    }

    switch (command) {
      case "lock":
        await lockCommand(message, args);
        break;
      case "unlock":
        await unlockCommand(message, args);
        break;
      case "deban":
        await debanCommand(message, args);
        break;
      case "ban":
        await banCommand(message, args);
        break;
      case "clear":
      case "purge":
        await clearCommand(message, args);
        break;
      case "giveaway":
      case "gw":
        await giveawayCommand(message, args);
        break;
      case "setup":
        await setupCommand(message, args);
        break;
      case "delete":
        await deleteSetupCommand(message, args);
        break;
      case "mute":
        await muteCommand(message, args);
        break;
      case "unmute":
      case "demute":
        await unmuteCommand(message, args);
        break;
      case "help":
        await helpCommand(message);
        break;
      default:
        break;
    }
  } catch (err) {
    logger.error({ err }, `Erreur commande: ${command}`);
    await message.reply("❌ Une erreur s'est produite lors de l'exécution de cette commande.").catch(() => {});
  }
}

async function helpCommand(message: Message) {
  const embed = {
    color: 0x5865f2,
    title: "📋 Liste des commandes",
    description: "Voici toutes les commandes disponibles",
    fields: [
      {
        name: "🔨 Modération",
        value: [
          "`!ban @user [raison]` — Bannir un membre",
          "`!mute @user [durée] [raison]` — Muter un membre (ex: `10m`, `2h`, `1d`)",
          "`!unmute @user` — Démuter un membre",
          "`!clear [nombre]` — Supprimer des messages (1-100)",
        ].join("\n"),
      },
      {
        name: "🎉 Giveaway",
        value: [
          "`!giveaway start [durée] [gagnants] [prix]` — Lancer un giveaway",
          "> Exemple: `!giveaway start 10m 1 Nitro`",
          "`!giveaway end [messageId]` — Terminer un giveaway",
          "`!giveaway reroll [messageId]` — Relancer un gagnant",
        ].join("\n"),
      },
      {
        name: "🏗️ Setup serveur",
        value: [
          "`!setup` — Aperçu de la commande",
          "`!setup confirm` — Crée toute la structure du serveur",
          "> Catégories : Informations, Général, Gaming, Événements, Vocal, Staff",
          "`!delete` — Aperçu de la commande",
          "`!delete confirm` — Supprime tous les salons créés par le bot",
        ].join("\n"),
      },
      {
        name: "🛡️ Anti-lien",
        value: "Actif automatiquement — supprime les liens non autorisés des membres sans rôle modérateur.",
      },
    ],
    footer: { text: "Préfixe: ! | Bot Discord Avancé" },
    timestamp: new Date().toISOString(),
  };

  await message.channel.send({ embeds: [embed] });
}
