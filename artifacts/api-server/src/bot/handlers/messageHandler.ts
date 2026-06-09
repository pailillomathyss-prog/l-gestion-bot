import { Message, PermissionFlagsBits, EmbedBuilder, ChannelType, TextChannel } from "discord.js";
import { logger } from "../../lib/logger";
import { antiLink } from "../modules/antiLink";
import { handleXP } from "../modules/expSystem";
import { isInJugementZone } from "../modules/rulesGate";
import { handleBoostMessage } from "../modules/boostAnnounce";
import { containsBannedWord, applyPunishment } from "../modules/punishSystem";
import { banCommand, unbanCommand } from "../commands/ban";
import { lockCommand, unlockCommand } from "../commands/lock";
import { muteCommand, demuteCommand } from "../commands/mute";
import { clearCommand } from "../commands/clear";
import { rankCommand } from "../commands/rank";
import { leaderboardCommand } from "../commands/leaderboard";
import { helpCommand } from "../commands/help";
import { warnStatusCommand } from "../commands/warnStatus";
import { pardonCommand } from "../commands/pardon";
import { restoreXpCommand } from "../commands/restorexp";
import { syncPermsCommand } from "../commands/syncperms";
import { coinflipCommand, slotCommand } from "../commands/games";
import { shopCommand, buyCommand, balanceCommand } from "../commands/shop";
import { giveawayCommand } from "../commands/giveaway";
import { getMyQuestProgress, claimQuest, forceNewQuestForGuild } from "../modules/questSystem";
import { getCoins } from "../modules/db";

const PREFIX = "!";

async function postGamesRules(message: Message) {
  if (!message.guild) return;
  // Cherche le salon "règles" (pas le règlement général, mais le salon règles des jeux)
  const jeux = message.guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && (c.name.toLowerCase().includes("règles") || c.name.toLowerCase().includes("regles"))
  );
  if (!jeux || jeux.type !== ChannelType.GuildText) {
    await message.reply("❌ Salon `règles` introuvable.").catch(() => {});
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x2f3136)
    .setTitle("🎰 Jeux de pièces — Règles & Commandes")
    .setDescription(
      "Gagne des pièces en chattant et en vocal, puis mise les dans les jeux !\n" +
      "Les jeux sont **uniquement** disponibles dans le salon **jeux**."
    )
    .addFields(
      {
        name: "🪙 Comment gagner des pièces ?",
        value:
          "• En envoyant des messages (8–15 🪙 par message, cooldown 1 min)\n" +
          "• En étant en vocal (12 🪙 toutes les 10 min)\n" +
          "• En complétant des quêtes (150–700 🪙)",
      },
      {
        name: "🎲 Jeux disponibles",
        value:
          "**`!coinflip [mise]`** — Pile ou face. Gagne ou perds ta mise (50/50).\n" +
          "**`!slot [mise]`** — Machine à sous. Deux identiques = x1.5 — Trois identiques = x2 à x20 selon le symbole !",
      },
      {
        name: "🏪 Boutique de rôles (`!shop`)",
        value:
          "Dépense tes pièces pour obtenir un rôle exclusif dans le salon **rôles** !\n" +
          "🌴・aventurier — 500 🪙\n" +
          "⛰️・roi2lajungle — 2 500 🪙\n" +
          "🎠・perturbateur — 8 000 🪙\n" +
          "💎・roi2monarch — 20 000 🪙",
      },
      {
        name: "📜 Autres commandes",
        value:
          "**`!balance`** — Voir ton solde de pièces\n" +
          "**`!progression`** — Voir ta progression sur la quête active\n" +
          "**`!claim`** — Réclamer la récompense d'une quête complétée",
      },
      {
        name: "⚠️ Règles",
        value:
          "• Mise minimale : **10 🪙**\n" +
          "• On ne peut pas miser plus que son solde\n" +
          "• Les jeux sont réservés au salon **jeux**\n" +
          "• Le shop est réservé au salon **rôles**",
      },
    )
    .setFooter({ text: "MAI•GESTION • Bonne chance !" })
    .setTimestamp();

  await (jeux as import("discord.js").TextChannel).send({ embeds: [embed] });
  await message.reply(`✅ Message posté dans <#${jeux.id}>`).catch(() => {});
}

export async function handleMessage(message: Message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  if (isInJugementZone(message.channel as TextChannel)) return;

  await handleBoostMessage(message).catch(() => {});

  if (message.member) {
    const badWord = containsBannedWord(message.content);
    if (badWord) {
      await applyPunishment(message.member, message, badWord).catch((err) =>
        logger.error({ err }, "Erreur applyPunishment")
      );
      return;
    }
  }

  if (!message.content.startsWith(PREFIX)) {
    await antiLink(message);
    if (message.member) await handleXP(message.member);
    return;
  }

  await antiLink(message);

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();
  if (!command) return;

  // ── Commandes accessibles à TOUT le monde ───────────────────────────────
  try {
    switch (command) {
      case "rank":
      case "level":
      case "xp":
        await rankCommand(message, args);
        return;
      case "leaderboard":
      case "lb":
      case "top":
        await leaderboardCommand(message);
        return;
      case "help":
      case "aide":
        await helpCommand(message);
        return;
      case "warn":
      case "sanction":
        await warnStatusCommand(message, args);
        return;
      // ── Économie ────────────────────────────────────────────────────────
      case "balance":
      case "solde":
      case "pieces":
      case "pièces":
        await balanceCommand(message);
        return;
      case "shop":
      case "boutique":
        await shopCommand(message);
        return;
      case "buy":
      case "acheter":
        await buyCommand(message, args);
        return;
      // ── Jeux ────────────────────────────────────────────────────────────
      case "coinflip":
      case "cf":
        await coinflipCommand(message, args);
        return;
      case "slot":
      case "slots":
        await slotCommand(message, args);
        return;
      // ── Quêtes ──────────────────────────────────────────────────────────
      case "progression":
      case "quête":
      case "quete":
      case "quest":
        if (!message.member) return;
        await message.reply({ embeds: [await getMyQuestProgress(message.member)] }).catch(() => {});
        return;
      case "claim":
      case "réclamer":
      case "reclamer":
        if (!message.member) return;
        const result = await claimQuest(message.member);
        await message.reply(result.message).catch(() => {});
        return;
    }
  } catch (err) {
    logger.error({ err }, `Erreur commande publique: ${command}`);
    await message.reply("❌ Une erreur s'est produite.").catch(() => {});
    return;
  }

  // ── Commandes réservées aux administrateurs ──────────────────────────────
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
      case "pardon":
        await pardonCommand(message, args);
        break;
      case "restorexp":
      case "restoreexp":
        await restoreXpCommand(message);
        break;
      case "syncperms":
        await syncPermsCommand(message);
        break;
      case "giveaway":
        await giveawayCommand(message, args);
        break;
      case "postrules":
      case "postregle":
      case "postregler":
        await postGamesRules(message);
        break;
      case "nouvellequete":
      case "nouvellequête":
      case "resetquete":
      case "resetquest":
        if (!message.guild) break;
        await message.reply("🔄 Changement de quête en cours...").catch(() => {});
        try {
          const { questLabel } = await forceNewQuestForGuild(message.guild);
          await message.reply(`✅ Nouvelle quête lancée : **${questLabel}**`).catch(() => {});
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await message.reply(`❌ Erreur : ${errMsg}`).catch(() => {});
        }
        break;
      default:
        break;
    }
  } catch (err) {
    logger.error({ err }, `Erreur commande admin: ${command}`);
    await message.reply("❌ Une erreur s'est produite.").catch(() => {});
  }
}
