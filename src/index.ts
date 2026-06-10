import {
  Client, GatewayIntentBits, Partials, Events,
  GuildMember, Message, ButtonInteraction,
  UserSelectMenuInteraction, ModalSubmitInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { initDb } from "./db.js";
import { handleModCommand, initMod } from "./features/mod.js";
import { postRulesIfNeeded, syncPermissions, handleRulesAccept, RULES_BTN_ID } from "./features/rules.js";
import { handleMessageXP, tickVoiceXP, rankCommand, getUser } from "./features/xp.js";
import { postGamePanelIfNeeded, postGameRulesIfNeeded, handleGameButton, handleDuelSelect } from "./features/games.js";
import { postShopIfNeeded, handleShopButton } from "./features/shop.js";
import { launchGiveaway, resumeGiveaways, handleGiveawayJoin, GIVEAWAY_JOIN_BTN } from "./features/giveaway.js";
import { postDonPanelIfNeeded, handleDonButton, handleDonModal, DON_BTN, DON_MODAL } from "./features/donations.js";
import { handleBoost } from "./features/boost.js";
import { checkAntiLink } from "./features/antilink.js";

const PREFIX = "!";
const MOD_CMDS = new Set(["ban","unban","mute","demute","unmute","lock","unlock"]);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ── Ready ─────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ ${c.user.tag} connecté !`);
  c.user.setActivity("🛡️ MAI•GESTION");
  await initDb().catch(err => console.error("DB init error:", err));

  for (const [, guild] of c.guilds.cache) {
    console.log(`Initialisation : ${guild.name}`);
    try { await guild.channels.fetch(); await guild.members.fetch(); } catch {}
    await syncPermissions(guild).catch(err => console.error(`syncPermissions ${guild.name}:`, err));
    await postRulesIfNeeded(guild, c.user.id).catch(() => {});
    await postGamePanelIfNeeded(guild, c.user.id).catch(() => {});
    await postGameRulesIfNeeded(guild, c.user.id).catch(() => {});
    await postShopIfNeeded(guild, c.user.id).catch(() => {});
    await postDonPanelIfNeeded(guild, c.user.id).catch(() => {});
    console.log(`✅ ${guild.name} prêt`);
  }

  await initMod(client).catch(() => {});
  await resumeGiveaways(client).catch(() => {});
  setInterval(async () => {
    for (const [, guild] of c.guilds.cache) await tickVoiceXP(guild).catch(() => {});
  }, 5 * 60_000);

  console.log("🚀 Bot entièrement opérationnel !");
});

// ── New guild ─────────────────────────────────────────────────────────────────
client.on(Events.GuildCreate, async (guild) => {
  try { await guild.channels.fetch(); await guild.members.fetch(); } catch {}
  await syncPermissions(guild).catch(() => {});
  await postRulesIfNeeded(guild, client.user!.id).catch(() => {});
  await postGamePanelIfNeeded(guild, client.user!.id).catch(() => {});
  await postGameRulesIfNeeded(guild, client.user!.id).catch(() => {});
  await postShopIfNeeded(guild, client.user!.id).catch(() => {});
  await postDonPanelIfNeeded(guild, client.user!.id).catch(() => {});
});

// ── Boost ─────────────────────────────────────────────────────────────────────
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  await handleBoost(oldMember as GuildMember, newMember as GuildMember).catch(() => {});
});

// ── Messages ──────────────────────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot || !message.guild || !message.member) return;

  // Anti-link (avant tout le reste pour les non-commandes)
  if (!message.content.startsWith(PREFIX)) {
    const blocked = await checkAntiLink(message).catch(() => false);
    if (blocked) return;
    await handleMessageXP(message.member as GuildMember).catch(() => {});
    return;
  }

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()!.toLowerCase();

  // ── Moderation (admin only) ──────────────────────────────────────────────
  if (MOD_CMDS.has(command)) {
    if (!(message.member as GuildMember).permissions.has(PermissionFlagsBits.Administrator)) return;
    await handleModCommand(message, command, args).catch(err => {
      console.error(`Erreur mod ${command}:`, err);
      message.reply("❌ Une erreur s'est produite.").catch(() => {});
    });
    return;
  }

  // ── !rank ────────────────────────────────────────────────────────────────
  if (command === "rank") {
    await rankCommand(message).catch(() => {});
    return;
  }

  // ── !solde / !coins / !balance ───────────────────────────────────────────
  if (command === "solde" || command === "coins" || command === "balance" || command === "pièces" || command === "pieces") {
    if (!message.guild) return;
    const target = message.mentions.members?.first() ?? (message.member as GuildMember);
    const data = await getUser(message.guild.id, target.id);
    const { EmbedBuilder } = await import("discord.js");
    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("💰 Solde de pièces")
        .setDescription(`**${target.displayName}** possède **${data.coins.toLocaleString("fr-FR")} 🪙**`)
        .addFields(
          { name: "⭐ XP", value: `${data.xp.toLocaleString("fr-FR")}`, inline: true },
          { name: "🏆 Niveau", value: `${data.level}`, inline: true },
        )
        .setThumbnail(target.user.displayAvatarURL())
        .setFooter({ text: "MAI•GESTION" }).setTimestamp()
    ] }).catch(() => {});
    return;
  }

  // ── !daily ───────────────────────────────────────────────────────────────
  if (command === "daily") {
    if (!message.guild) return;
    const data = await getUser(message.guild.id, (message.member as GuildMember).id);
    const now = Date.now();
    const lastDaily = data.lastMsgTs ? 0 : 0; // stored separately not needed — use 24h cooldown check via lastVoiceTs hack
    const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
    // We'll use lastVoiceTs as daily ts if <= 0 meaning never done (simplification)
    const lastDailyTs = data.lastVoiceTs > 1_700_000_000_000 ? 0 : data.lastVoiceTs; // If looks like a real voice ts, skip
    // Simple: use a state key via module-level map
    const key = `daily:${message.guild.id}:${(message.member as GuildMember).id}`;
    const { getState, setState } = await import("./db.js");
    const lastTs = parseInt((await getState(key)) ?? "0");
    if (lastTs && now - lastTs < DAILY_COOLDOWN) {
      const remaining = lastTs + DAILY_COOLDOWN - now;
      const hrs = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      const { EmbedBuilder } = await import("discord.js");
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xff9900).setTitle("⏰ Daily déjà réclamé").setDescription(`Reviens dans **${hrs}h ${mins}min** !`).setFooter({text:"MAI•GESTION"}).setTimestamp()] }).catch(() => {});
      return;
    }
    const reward = Math.floor(Math.random() * 251) + 50; // 50–300
    await setState(key, String(now));
    await (await import("./db.js")).saveUser(message.guild.id, (message.member as GuildMember).id, { ...data, coins: data.coins + reward });
    const { EmbedBuilder } = await import("discord.js");
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x00cc66).setTitle("🎁 Daily réclamé !").setDescription(`Tu reçois **${reward} 🪙** !\n\n💰 Nouveau solde : **${(data.coins + reward).toLocaleString("fr-FR")} 🪙**`).setFooter({text:"MAI•GESTION • Reviens demain !"}).setTimestamp()] }).catch(() => {});
    return;
  }

  // ── !giveaway (admin only) ───────────────────────────────────────────────
  if (command === "giveaway") {
    if (!(message.member as GuildMember).permissions.has(PermissionFlagsBits.Administrator)) return;
    if (args.length < 2) { await message.reply("❌ Usage : `!giveaway [durée] [prix]`\nEx: `!giveaway 24h Nitro Classic` ou `!giveaway 1h 500 coins`").catch(() => {}); return; }
    const duration = args[0]!;
    const prize = args.slice(1).join(" ");
    try {
      await launchGiveaway(client, message.channel.id, message.guild.id, prize, duration);
      await message.reply("✅ Giveaway lancé !").catch(() => {});
    } catch (e) {
      await message.reply(`❌ ${e instanceof Error ? e.message : "Erreur"}`).catch(() => {});
    }
    return;
  }

  // ── !help ────────────────────────────────────────────────────────────────
  if (command === "help" || command === "aide") {
    const { EmbedBuilder } = await import("discord.js");
    const isAdmin = (message.member as GuildMember).permissions.has(PermissionFlagsBits.Administrator);
    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("📋 Commandes MAI•GESTION")
        .addFields(
          { name: "👤 Tout le monde", value: "`!rank [@membre]` — Voir son XP/niveau\n`!solde [@membre]` — Voir ses pièces\n`!daily` — Récompense quotidienne" },
          ...(isAdmin ? [{ name: "🛡️ Admins", value: "`!ban @membre` — Bannir\n`!unban [ID]` — Débannir\n`!mute @membre [min]` — Muter\n`!demute @membre` — Démuter\n`!lock [#salon]` — Verrouiller\n`!unlock [#salon]` — Déverrouiller\n`!giveaway [durée] [prix]` — Lancer un giveaway" }] : []),
        )
        .setFooter({ text: "MAI•GESTION • Les jeux et le shop utilisent des boutons" }).setTimestamp()
    ] }).catch(() => {});
    return;
  }
});

// ── Interactions ──────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {

  if (interaction.isButton() && interaction.customId === RULES_BTN_ID) {
    await handleRulesAccept(interaction as ButtonInteraction).catch(async err => {
      console.error("rules_accept:", err);
      if (!interaction.replied && !interaction.deferred)
        await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === GIVEAWAY_JOIN_BTN) {
    await handleGiveawayJoin(interaction as ButtonInteraction).catch(async err => {
      console.error("giveaway_join:", err);
      if (!interaction.replied && !interaction.deferred)
        await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  if (interaction.isButton() && (
    interaction.customId.startsWith("g_flip_") ||
    interaction.customId.startsWith("g_slot_") ||
    interaction.customId.startsWith("g_bj_") ||
    interaction.customId.startsWith("g_duel_") ||
    interaction.customId === "g_gacha"
  )) {
    await handleGameButton(interaction as ButtonInteraction).catch(async err => {
      console.error("game_button:", err);
      try {
        if (!interaction.replied && !interaction.deferred) await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true });
        else await (interaction as ButtonInteraction).followUp({ content: "❌ Erreur.", ephemeral: true });
      } catch {}
    });
    return;
  }

  if (interaction.isUserSelectMenu() && interaction.customId.startsWith("g_duel_pick:")) {
    await handleDuelSelect(interaction as UserSelectMenuInteraction).catch(async err => {
      console.error("duel_select:", err);
      if (!interaction.replied && !interaction.deferred)
        await (interaction as UserSelectMenuInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  if (interaction.isButton() && (
    interaction.customId.startsWith("shop_r_") ||
    interaction.customId.startsWith("shop_x_") ||
    interaction.customId === "shop_balance"
  )) {
    await handleShopButton(interaction as ButtonInteraction).catch(async err => {
      console.error("shop_button:", err);
      if (!interaction.replied && !interaction.deferred)
        await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === DON_BTN) {
    await handleDonButton(interaction as ButtonInteraction).catch(async err => {
      console.error("don_button:", err);
      if (!interaction.replied && !interaction.deferred)
        await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === DON_MODAL) {
    await handleDonModal(interaction as ModalSubmitInteraction).catch(async err => {
      console.error("don_modal:", err);
      if (!interaction.replied && !interaction.deferred)
        await (interaction as ModalSubmitInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const token = process.env["DISCORD_TOKEN"];
if (!token) { console.error("❌ DISCORD_TOKEN manquant !"); process.exit(1); }
client.login(token).catch(err => { console.error("❌ Impossible de se connecter:", err); process.exit(1); });
