import {
  Client, GatewayIntentBits, Partials, Events,
  GuildMember, Message, ButtonInteraction,
  UserSelectMenuInteraction, ModalSubmitInteraction,
  ChatInputCommandInteraction, PermissionFlagsBits, ChannelType,
} from "discord.js";
import { initDb } from "./db.js";
import { handleModCommand, initMod } from "./features/mod.js";
import { postRulesIfNeeded, syncPermissions, handleRulesAccept, RULES_BTN_ID } from "./features/rules.js";
import { handleMessageXP, tickVoiceXP, rankCommand } from "./features/xp.js";
import { postGamePanelIfNeeded, postGameRulesIfNeeded, handleGameButton, handleDuelSelect } from "./features/games.js";
import { postShopIfNeeded, handleShopButton } from "./features/shop.js";
import { launchGiveaway, resumeGiveaways, handleGiveawayJoin, GIVEAWAY_JOIN_BTN } from "./features/giveaway.js";
import { postDonPanelIfNeeded, handleDonButton, handleDonModal, DON_BTN, DON_MODAL } from "./features/donations.js";
import { handleBoost } from "./features/boost.js";

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
    try {
      await guild.channels.fetch();
      await guild.members.fetch();
    } catch {}

    // Permissions channels + AFK
    await syncPermissions(guild).catch(err => console.error(`syncPermissions ${guild.name}:`, err));

    // Règlement
    await postRulesIfNeeded(guild, c.user.id).catch(() => {});

    // Jeux panels
    await postGamePanelIfNeeded(guild, c.user.id).catch(() => {});
    await postGameRulesIfNeeded(guild, c.user.id).catch(() => {});

    // Shop
    await postShopIfNeeded(guild, c.user.id).catch(() => {});

    // Dons
    await postDonPanelIfNeeded(guild, c.user.id).catch(() => {});

    console.log(`✅ ${guild.name} prêt`);
  }

  // Restore mutes
  await initMod(client).catch(() => {});

  // Resume giveaways
  await resumeGiveaways(client).catch(() => {});

  // Voice XP tick every 5 minutes
  setInterval(async () => {
    for (const [, guild] of c.guilds.cache) {
      await tickVoiceXP(guild).catch(() => {});
    }
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

  // XP gain (non-commands)
  if (!message.content.startsWith(PREFIX)) {
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

  // ── !giveaway (admin only) ───────────────────────────────────────────────
  if (command === "giveaway") {
    if (!(message.member as GuildMember).permissions.has(PermissionFlagsBits.Administrator)) return;
    const result = await (async () => {
      if (args.length < 2) return { error: "Usage : `!giveaway [durée] [prix]`\nEx: `!giveaway 24h Nitro Classic` ou `!giveaway 1h 500 coins`" };
      const duration = args[0]!;
      const prize = args.slice(1).join(" ");
      try {
        await launchGiveaway(client, message.channel.id, message.guild!.id, prize, duration);
        return { ok: true };
      } catch (e) { return { error: e instanceof Error ? e.message : "Erreur" }; }
    })();
    if ("error" in result) await message.reply(`❌ ${result.error}`).catch(() => {});
    else await message.reply("✅ Giveaway lancé !").catch(() => {});
    return;
  }
});

// ── Interactions ──────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {

  // ── Règlement button ────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === RULES_BTN_ID) {
    await handleRulesAccept(interaction as ButtonInteraction).catch(async err => {
      console.error("rules_accept:", err);
      if (!interaction.replied && !interaction.deferred)
        await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  // ── Giveaway join ────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === GIVEAWAY_JOIN_BTN) {
    await handleGiveawayJoin(interaction as ButtonInteraction).catch(async err => {
      console.error("giveaway_join:", err);
      if (!interaction.replied && !interaction.deferred)
        await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  // ── Game buttons ─────────────────────────────────────────────────────────
  if (interaction.isButton() && (
    interaction.customId.startsWith("g_flip_") ||
    interaction.customId.startsWith("g_slot_") ||
    interaction.customId.startsWith("g_bj_") ||
    interaction.customId.startsWith("g_duel_") ||
    interaction.customId === "g_gacha"
  )) {
    await handleGameButton(interaction as ButtonInteraction).catch(async err => {
      console.error("game_button:", err);
      if (!interaction.replied && !interaction.deferred)
        await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
      else
        await (interaction as ButtonInteraction).followUp({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  // ── Duel select ──────────────────────────────────────────────────────────
  if (interaction.isUserSelectMenu() && interaction.customId.startsWith("g_duel_pick:")) {
    await handleDuelSelect(interaction as UserSelectMenuInteraction).catch(async err => {
      console.error("duel_select:", err);
      if (!interaction.replied && !interaction.deferred)
        await (interaction as UserSelectMenuInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  // ── Shop buttons ─────────────────────────────────────────────────────────
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

  // ── Donation button ──────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === DON_BTN) {
    await handleDonButton(interaction as ButtonInteraction).catch(async err => {
      console.error("don_button:", err);
      if (!interaction.replied && !interaction.deferred)
        await (interaction as ButtonInteraction).reply({ content: "❌ Erreur.", ephemeral: true }).catch(() => {});
    });
    return;
  }

  // ── Donation modal ────────────────────────────────────────────────────────
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
