import {
  Client, GatewayIntentBits, Partials, Events,
  ButtonInteraction, UserSelectMenuInteraction, ModalSubmitInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { logger } from "../lib/logger";
import { ensureTables } from "./modules/db";
import { handleMessage } from "./handlers/messageHandler";
import { postLevelsPanelIfNeeded, tickVoiceXP } from "./modules/expSystem";
import { postShopPanelIfNeeded, handleShopButton } from "./modules/shop";
import { postDailyMenuIfNeeded, handleDailyClaim, handleDailyStreak } from "./modules/dailySystem";
import { postDonationPanelIfNeeded, handleDonStart, handleDonSelectUser, handleDonModal } from "./modules/donationSystem";
import { postJackpotPanelIfNeeded, handleJackpotButton, checkWeeklyDraw } from "./modules/jackpot";
import { postRulesPanelIfNeeded, handleRulesAccept } from "./modules/rulesGate";
import { handleBoostUpdate } from "./modules/boostAnnounce";
import { handleGameButton, postGameMenuIfNeeded, handleDuelAccept } from "./modules/gameSystem";
import { restoreGiveaways } from "./modules/giveawaySystem";
import { registerSlashCommands } from "./slash/register";
import { handleSlashCommand } from "./slash/handler";
import { setGiveawayClient } from "./commands/giveaway";

export async function startBot() {
  const token = process.env["DISCORD_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_TOKEN absent — bot désactivé");
    return;
  }

  await ensureTables();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });

  setGiveawayClient(client);

  client.once(Events.ClientReady, async c => {
    logger.info(`🤖 Bot connecté : ${c.user.tag}`);

    // Enregistrement des commandes /
    const clientId = c.user.id;
    const guildId  = process.env["GUILD_ID"];
    await registerSlashCommands(token, clientId, guildId);

    // Setup des panneaux pour chaque guild
    for (const [, guild] of c.guilds.cache) {
      try {
        await guild.members.fetch().catch(() => {});
        await guild.channels.fetch().catch(() => {});
        await guild.roles.fetch().catch(() => {});

        await postLevelsPanelIfNeeded(guild, c.user.id);
        await postShopPanelIfNeeded(guild, c.user.id);
        await postDailyMenuIfNeeded(guild, c.user.id);
        await postDonationPanelIfNeeded(guild, c.user.id);
        await postJackpotPanelIfNeeded(guild, c.user.id);
        await postRulesPanelIfNeeded(guild, c.user.id);
        await postGameMenuIfNeeded(guild, c.user.id);
        logger.info(`✅ Panneaux vérifiés pour ${guild.name}`);
      } catch (err) {
        logger.warn({ err }, `Erreur setup guild ${guild.name}`);
      }
    }

    // Restaurer les giveaways actifs
    await restoreGiveaways(client);

    // XP en vocal — toutes les 5 min
    setInterval(async () => {
      for (const [, guild] of client.guilds.cache) {
        await tickVoiceXP(guild).catch(() => {});
      }
    }, 5 * 60 * 1000);

    // Vérification du jackpot hebdomadaire — toutes les heures
    setInterval(async () => {
      await checkWeeklyDraw(client).catch(() => {});
    }, 60 * 60 * 1000);

    // Tirage jackpot au démarrage
    await checkWeeklyDraw(client).catch(() => {});
  });

  // Messages
  client.on(Events.MessageCreate, async message => {
    await handleMessage(message).catch(err => logger.error({ err }, "handleMessage error"));
  });

  // Boost via GuildMemberUpdate
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    await handleBoostUpdate(oldMember, newMember).catch(() => {});
  });

  // Slash commands
  client.on(Events.InteractionCreate, async interaction => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction as ChatInputCommandInteraction);
        return;
      }

      if (interaction.isButton()) {
        const btn = interaction as ButtonInteraction;
        const id  = btn.customId;

        if (id.startsWith("shop_"))    { await handleShopButton(btn); return; }
        if (id.startsWith("daily_"))   { id === "daily_claim" ? await handleDailyClaim(btn) : await handleDailyStreak(btn); return; }
        if (id === "don_start")        { await handleDonStart(btn); return; }
        if (id === "jackpot_view")     { await handleJackpotButton(btn); return; }
        if (id === "rules_accept")     { await handleRulesAccept(btn); return; }
        if (id.startsWith("game_"))    { await handleGameButton(btn); return; }
        if (id.startsWith("bj_"))      { return; } // géré par le collecteur blackjack
        if (id.startsWith("giveaway_")){ return; } // géré par le collecteur giveaway
      }

      if (interaction.isUserSelectMenu()) {
        const menu = interaction as UserSelectMenuInteraction;
        if (menu.customId === "don_select_user") { await handleDonSelectUser(menu); return; }
        if (menu.customId.startsWith("duel_select_")) { await handleDuelAccept(menu); return; }
      }

      if (interaction.isModalSubmit()) {
        const modal = interaction as ModalSubmitInteraction;
        if (modal.customId === "don_modal") { await handleDonModal(modal); return; }
      }
    } catch (err) {
      logger.error({ err }, "InteractionCreate error");
    }
  });

  // Nouveau guild
  client.on(Events.GuildCreate, async guild => {
    logger.info(`✅ Nouveau serveur : ${guild.name}`);
    await guild.members.fetch().catch(() => {});
    await postLevelsPanelIfNeeded(guild, client.user!.id);
    await postShopPanelIfNeeded(guild, client.user!.id);
    await postDailyMenuIfNeeded(guild, client.user!.id);
    await postDonationPanelIfNeeded(guild, client.user!.id);
    await postJackpotPanelIfNeeded(guild, client.user!.id);
    await postRulesPanelIfNeeded(guild, client.user!.id);
    await postGameMenuIfNeeded(guild, client.user!.id);
  });

  await client.login(token);
  logger.info("🔑 Connexion Discord en cours...");
}
