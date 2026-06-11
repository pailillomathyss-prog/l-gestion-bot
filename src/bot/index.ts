import {
  Client, GatewayIntentBits, Partials, Events, GuildMember, TextChannel,
  ChannelType, Collection, ChatInputCommandInteraction, VoiceState,
  ButtonInteraction, UserSelectMenuInteraction, ModalSubmitInteraction,
  EmbedBuilder,
} from "discord.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { logger } from "../lib/logger.js";
import { handleMessage } from "./handlers/messageHandler.js";
import {
  handleRulesAccept, RULES_ACCEPT_BTN,
  rulesMessageId, setRulesMessageId,
  findOrSendEnterMessage, syncChannelPermissions,
} from "./modules/rulesGate.js";
import { initMemberXP, processVoiceXP, trackVoiceJoin, trackVoiceLeave } from "./modules/expSystem.js";
import { handleBoostUpdate } from "./modules/boostAnnounce.js";
import { initPunishments } from "./modules/punishSystem.js";
import { registerSlashCommands } from "./slash/register.js";
import { handleSlashCommand } from "./slash/handler.js";
import { getSavedRulesMessageId } from "./state.js";
import { resumeGiveaways } from "./modules/giveawaySystem.js";
import { startNewQuest } from "./modules/questSystem.js";
import { ensureTables, getCoins, addCoins, joinGiveaway, getActiveGiveaways } from "./modules/db.js";
import {
  SHOP_ROLES, SHOP_XP, buildGenericShopEmbed, buildGenericShopComponents,
  buildPersonalShopEmbed, handleShopXpButton,
} from "./commands/shop.js";
import { handleGameButton, handleGameSelect, postGameMenuIfNeeded } from "./modules/gameSystem.js";
import { claimQuest, getMyQuestProgress } from "./modules/questSystem.js";
import { postDailyMenuIfNeeded, handleDailyClaim, handleDailyStreak } from "./modules/dailySystem.js";
import { postJackpotPanelIfNeeded, handleJackpotButton, checkWeeklyDraw } from "../features/jackpot.js";
import {
  DONATION_BTN, DONATION_MODAL,
  postDonationPanelIfNeeded, handleDonationButton, handleDonationModal,
} from "./modules/donationSystem.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User],
});

// ── Auto-post shop ─────────────────────────────────────────────────────────
async function postShopIfNeeded(guild: import("discord.js").Guild, botId: string) {
  const shopChannel = guild.channels.cache.find(
    ch => ch.type === ChannelType.GuildText &&
      (ch.name.toLowerCase().includes("shop") || ch.name.includes("🧸"))
  ) as TextChannel | undefined;
  if (!shopChannel) return;
  try {
    const recent = await shopChannel.messages.fetch({ limit: 50 });
    if (recent.some(m => m.author.id === botId && m.embeds[0]?.title?.includes("Boutique"))) return;
    await shopChannel.send({ embeds: [buildGenericShopEmbed()], components: buildGenericShopComponents() });
    logger.info(`✅ Panneau boutique posté dans #${shopChannel.name}`);
  } catch (err) { logger.warn({ err }, `Impossible de poster le shop`); }
}

// ── Auto-post panneau règles des jeux ─────────────────────────────────────
async function postGameRulesIfNeeded(guild: import("discord.js").Guild, botId: string) {
  const reglesCh = guild.channels.cache.find(
    ch => ch.type === ChannelType.GuildText &&
      (ch.name.toLowerCase().includes("regle") || ch.name.toLowerCase().includes("règle") || ch.name.includes("📩"))
  ) as TextChannel | undefined;
  if (!reglesCh) return;
  try {
    const recent = await reglesCh.messages.fetch({ limit: 50 });
    if (recent.some(m => m.author.id === botId && m.embeds[0]?.title?.includes("Règles"))) return;

    const embed = new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle("🎰 Règles des Jeux — MAI•GESTION")
      .setDescription("Les jeux sont disponibles dans le salon 👾・jeux. Utilise les boutons directement !")
      .addFields(
        { name: "🪙 Comment gagner des pièces ?", value: "• Messages : **8–15 🪙** (cooldown 1 min)\n• Vocal : **12 🪙** / 10 min\n• Quêtes : **150–700 🪙**\n• Daily : **50–250 🪙**", inline: false },
        { name: "🎮 Jeux disponibles", value: "🪙 **Coin Flip** — Pile ou face (50/50)\n🎰 **Slots** — Machine à sous (jusqu'à ×20)\n🃏 **Blackjack** — Bats le croupier\n🎲 **Duel 1v1** — Défie un membre\n🎁 **Gacha** — Tire un rôle rare (200 🪙)", inline: false },
        { name: "🎁 Gacha — Rarités", value: "🎀🍀 Commun (60%) | ⚡🌸 Peu Commun (25%) | 💜🔥 Rare (10%) | 💎🌟 Épique (4%) | 👑🌌 Légendaire (0.9%) | ⚜️ Mythique (0.1%)", inline: false },
        { name: "⚠️ Règles", value: "• Mise minimum : **10 🪙**\n• Impossible de miser plus que son solde\n• Le gacha crée les rôles automatiquement", inline: false },
      )
      .setFooter({ text: "MAI•GESTION • Bonne chance !" }).setTimestamp();

    await reglesCh.send({ embeds: [embed] });
    logger.info(`📩 Règles des jeux postées dans #${reglesCh.name}`);
  } catch (err) { logger.warn({ err }, "Impossible de poster les règles"); }
}

client.once(Events.ClientReady, async (c) => {
  logger.info(`Bot connecté en tant que ${c.user.tag}`);
  c.user.setActivity("🛡️ Surveille le serveur");

  await ensureTables().catch(err => logger.error({ err }, "DB tables error"));

  const token = process.env["DISCORD_TOKEN"]!;
  await registerSlashCommands(token, c.user.id);

  for (const [, guild] of c.guilds.cache) {
    logger.info(`Initialisation du serveur : ${guild.name}`);
    await guild.channels.fetch();
    await guild.members.fetch();

    const textChannels = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText) as Collection<string, TextChannel>;
    const rulesChannel = textChannels.find(ch => {
      const n = ch.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return n.includes("reglement") || n.includes("rules") || n.includes("regles");
    }) ?? null;

    if (rulesChannel) {
      const savedId = await getSavedRulesMessageId(guild.id);
      const msgId = await findOrSendEnterMessage(rulesChannel, savedId, guild.id);
      if (msgId) setRulesMessageId(msgId);
    } else {
      logger.warn(`Aucun salon règlement trouvé sur ${guild.name}`);
    }

    await syncChannelPermissions(guild).catch(err => logger.error({ err }, "Erreur sync perms"));

    for (const [, member] of guild.members.cache) {
      if (!member.user.bot) await initMemberXP(member).catch(() => {});
    }

    await postShopIfNeeded(guild, c.user.id);
    await postGameMenuIfNeeded(guild, c.user.id);
    await postDailyMenuIfNeeded(guild, c.user.id);
    await postJackpotPanelIfNeeded(guild, c.user.id);
    await postDonationPanelIfNeeded(guild, c.user.id);
    await postGameRulesIfNeeded(guild, c.user.id);

    logger.info(`✅ Serveur "${guild.name}" initialisé`);
  }

  await initPunishments(c).catch(err => logger.error({ err }, "Erreur initPunishments"));
  await resumeGiveaways(c).catch(err => logger.error({ err }, "Erreur resumeGiveaways"));

  // XP vocal toutes les 10 min
  setInterval(async () => {
    for (const [, guild] of c.guilds.cache) {
      await processVoiceXP(guild).catch(() => {});
    }
  }, 10 * 60 * 1000);

  // Vérification tirage jackpot (toutes les heures)
  setInterval(async () => { await checkWeeklyDraw(c).catch(() => {}); }, 60 * 60 * 1000);
  await checkWeeklyDraw(c).catch(() => {});

  logger.info("🎙️ XP vocal actif");
  logger.info("🎉 Giveaway system actif");
  logger.info("🧸 Shop system actif");
  logger.info("👾 Game system actif");
  logger.info("🎁 Daily system actif");
  logger.info("❤️ Donation system actif");
  logger.info("🎯 Quest system actif");
  logger.info("✅ Bot entièrement opérationnel !");
});

client.on(Events.GuildMemberAdd, async (member) => {
  await initMemberXP(member as GuildMember).catch(() => {});
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  await handleBoostUpdate(oldMember as GuildMember, newMember as GuildMember).catch(() => {});
});

client.on(Events.VoiceStateUpdate, (oldState: VoiceState, newState: VoiceState) => {
  const guildId = newState.guild.id;
  const userId = newState.id;
  const joined = !oldState.channelId && newState.channelId;
  const left = oldState.channelId && !newState.channelId;
  const moved = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;
  if (joined || moved) trackVoiceJoin(guildId, userId);
  else if (left) trackVoiceLeave(guildId, userId);
});

// ── Shop button handler ────────────────────────────────────────────────────
async function handleShopButton(btn: ButtonInteraction) {
  if (!btn.guild || !btn.member) { await btn.reply({ content: "❌ Erreur serveur.", ephemeral: true }); return; }
  const member = await btn.guild.members.fetch(btn.user.id).catch(() => null) as GuildMember | null;
  if (!member) { await btn.reply({ content: "❌ Impossible de récupérer ton profil.", ephemeral: true }); return; }

  if (btn.customId === "shop_balance") {
    const balance = await getCoins(btn.guild.id, btn.user.id);
    await btn.reply({ embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("💰 Ton solde").setDescription(`**${balance.toLocaleString("fr-FR")} 🪙**`).setFooter({ text: "MAI•GESTION" }).setTimestamp()], ephemeral: true });
    return;
  }

  if (btn.customId === "shop_myitems") {
    const owned = SHOP_ROLES.filter(r => member.roles.cache.some(role => role.name === r.name));
    const balance = await getCoins(btn.guild.id, btn.user.id);
    await btn.reply({
      embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle("🎒 Tes rôles de la boutique")
        .setDescription(owned.length > 0 ? owned.map(r => `✅ **${r.name}**`).join("\n") : "Aucun rôle de la boutique.")
        .addFields({ name: "💰 Solde", value: `**${balance.toLocaleString("fr-FR")} 🪙**`, inline: false })
        .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
      ephemeral: true,
    });
    return;
  }

  if (btn.customId.startsWith("shop_xp_")) {
    await handleShopXpButton(btn, btn.customId.replace("shop_xp_", ""));
    return;
  }

  if (btn.customId.startsWith("shop_buy_")) {
    const roleId = btn.customId.replace("shop_buy_", "");
    const shopRole = SHOP_ROLES.find(r => r.id === roleId);
    if (!shopRole) { await btn.reply({ content: "❌ Rôle introuvable.", ephemeral: true }); return; }
    if (member.roles.cache.some(r => r.name === shopRole.name)) { await btn.reply({ content: `❌ Tu possèdes déjà **${shopRole.name}** !`, ephemeral: true }); return; }
    const balance = await getCoins(btn.guild.id, btn.user.id);
    if (balance < shopRole.price) {
      await btn.reply({ embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("❌ Solde insuffisant").setDescription(`Il te faut **${shopRole.price.toLocaleString("fr-FR")} 🪙** — tu as **${balance.toLocaleString("fr-FR")} 🪙**.`).setFooter({ text: "MAI•GESTION" }).setTimestamp()], ephemeral: true });
      return;
    }
    await btn.guild.roles.fetch();
    let role = btn.guild.roles.cache.find(r => r.name === shopRole.name);
    if (!role) role = await btn.guild.roles.create({ name: shopRole.name, color: shopRole.color, reason: "Achat boutique MAI•GESTION", permissions: [] }).catch(() => undefined);
    if (!role) { await btn.reply({ content: "❌ Impossible de créer le rôle.", ephemeral: true }); return; }
    await addCoins(btn.guild.id, btn.user.id, -shopRole.price);
    await member.roles.add(role).catch(() => {});
    const newBal = await getCoins(btn.guild.id, btn.user.id);
    await btn.reply({ embeds: [new EmbedBuilder().setColor(0x00cc66).setTitle("✅ Achat réussi !").setDescription(`Tu as obtenu **${shopRole.name}** !\n\nSolde restant : **${newBal.toLocaleString("fr-FR")} 🪙**`).setFooter({ text: "MAI•GESTION" }).setTimestamp()], ephemeral: true });
  }
}

// ── Interactions ────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {

  // ── Règlement ──────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === RULES_ACCEPT_BTN) {
    await handleRulesAccept(interaction as ButtonInteraction).catch(async err => {
      logger.error({ err }, "Erreur handleRulesAccept");
      if (!interaction.replied && !interaction.deferred) await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  // ── Giveaway ───────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "giveaway_join") {
    const btn = interaction as ButtonInteraction;
    if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }
    const actives = await getActiveGiveaways().catch(() => []);
    const giveaway = actives.find(g => g.messageId === btn.message.id);
    if (!giveaway) { await btn.reply({ content: "❌ Giveaway introuvable ou terminé.", ephemeral: true }); return; }
    const joined = await joinGiveaway(giveaway.id, btn.user.id).catch(() => false);
    await btn.reply({ content: joined ? "✅ Tu participes ! Bonne chance 🎉" : "❌ Tu participes déjà.", ephemeral: true });
    return;
  }

  // ── Daily ──────────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "daily_claim") {
    await handleDailyClaim(interaction as ButtonInteraction).catch(async err => {
      logger.error({ err }, "Erreur daily_claim");
      if (!interaction.replied && !interaction.deferred) await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }
  if (interaction.isButton() && interaction.customId === "daily_streak") {
    await handleDailyStreak(interaction as ButtonInteraction).catch(async err => {
      logger.error({ err }, "Erreur daily_streak");
      if (!interaction.replied && !interaction.deferred) await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  // ── Jackpot ──────────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "jackpot_view") {
    await handleJackpotButton(interaction as ButtonInteraction).catch(async err => {
      logger.error({ err }, "Erreur jackpot_view");
      if (!interaction.replied && !interaction.deferred) await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  // ── Quêtes ─────────────────────────────────────────────────────────────────
  if (interaction.isButton() && (interaction.customId === "quest_claim" || interaction.customId === "quest_progress")) {
    const btn = interaction as ButtonInteraction;
    if (!btn.guild || !btn.member) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }
    const member = await btn.guild.members.fetch(btn.user.id).catch(() => null) as GuildMember | null;
    if (!member) { await btn.reply({ content: "❌ Profil introuvable.", ephemeral: true }); return; }
    if (btn.customId === "quest_claim") {
      const result = await claimQuest(member).catch(() => ({ success: false, message: "❌ Erreur." }));
      await btn.reply({ embeds: [new EmbedBuilder().setColor(result.success ? 0x00cc66 : 0xff4444).setDescription(result.message).setFooter({ text: "MAI•GESTION" }).setTimestamp()], ephemeral: true });
    } else {
      const embed = await getMyQuestProgress(member);
      await btn.reply({ embeds: [embed], ephemeral: true });
    }
    return;
  }

  // ── Jeux ───────────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("game_")) {
    await handleGameButton(interaction as ButtonInteraction).catch(async err => {
      logger.error({ err }, "Erreur game button");
      if (!interaction.replied && !interaction.deferred) await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
      else await (interaction as ButtonInteraction).followUp({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  // ── Duel select ────────────────────────────────────────────────────────────
  if (interaction.isUserSelectMenu() && interaction.customId.startsWith("game_duel_pick:")) {
    await handleGameSelect(interaction as UserSelectMenuInteraction).catch(async err => {
      logger.error({ err }, "Erreur duel select");
      if (!interaction.replied && !interaction.deferred) await (interaction as UserSelectMenuInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  // ── Boutique ───────────────────────────────────────────────────────────────
  if (interaction.isButton() && (interaction.customId.startsWith("shop_buy_") || interaction.customId.startsWith("shop_xp_") || interaction.customId === "shop_balance" || interaction.customId === "shop_myitems")) {
    await handleShopButton(interaction as ButtonInteraction).catch(async err => {
      logger.error({ err }, "Erreur shop button");
      if (!interaction.replied && !interaction.deferred) await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  // ── Donation ───────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === DONATION_BTN) {
    await handleDonationButton(interaction as ButtonInteraction).catch(async err => {
      logger.error({ err }, "Erreur donation button");
      if (!interaction.replied && !interaction.deferred) await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  // ── Donation modal ─────────────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === DONATION_MODAL) {
    await handleDonationModal(interaction as ModalSubmitInteraction).catch(async err => {
      logger.error({ err }, "Erreur donation modal");
      if (!interaction.replied && !interaction.deferred) await (interaction as ModalSubmitInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  // ── Slash commands ─────────────────────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleSlashCommand(interaction as ChatInputCommandInteraction);
  } catch (err) {
    logger.error({ err }, `Erreur slash: ${(interaction as ChatInputCommandInteraction).commandName}`);
    const reply = { content: "❌ Erreur.", ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});

client.on(Events.MessageCreate, handleMessage);

export function startBot() {
  const token = process.env["DISCORD_TOKEN"];
  if (!token) { logger.error("DISCORD_TOKEN manquant !"); return; }
  client.login(token).catch(err => logger.error({ err }, "Impossible de se connecter"));
}
