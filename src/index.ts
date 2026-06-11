// ── Imports ───────────────────────────────────────────────────────────────────
import {
  Client, GatewayIntentBits, Partials, Events, EmbedBuilder,
  GuildMember, Message, ButtonInteraction,
  UserSelectMenuInteraction, ModalSubmitInteraction, PermissionFlagsBits,
} from "discord.js";
import { initDb, getUser, saveUser, getState, setState, resetAllXP } from "./db.js";
import { handleModCommand, initMod } from "./features/mod.js";
import { postRulesIfNeeded, syncPermissions, handleRulesAccept, RULES_BTN_ID } from "./features/rules.js";
import { handleMessageXP, tickVoiceXP, rankCommand, xpToLevel, postLevelsPanelIfNeeded } from "./features/xp.js";
import { postGamePanelIfNeeded, postGameRulesIfNeeded, handleGameButton, handleDuelSelect } from "./features/games.js";
import { postShopIfNeeded, handleShopButton } from "./features/shop.js";
import { launchGiveaway, resumeGiveaways, handleGiveawayJoin, GIVEAWAY_JOIN_BTN } from "./features/giveaway.js";
import { postDonPanelIfNeeded, handleDonButton, handleDonModal, DON_BTN, DON_MODAL } from "./features/donations.js";
import { handleBoost } from "./features/boost.js";
import { checkAntiLink } from "./features/antilink.js";

const PREFIX    = "!";
const MOD_CMDS  = new Set(["ban","unban","mute","demute","unmute","lock","unlock"]);
const DAILY_CD  = 24 * 60 * 60_000;

const LEVEL_ROLE_NAMES = [
  "🌱 Niveau 1","⚡ Niveau 5","🔥 Niveau 10","💫 Niveau 20","✨ Niveau 30",
  "🌟 Niveau 50","🏆 Niveau 75","👑 Niveau 100","💎 Niveau 150","🔮 Niveau 200",
  "☄️ Niveau 300","🌌 Niveau 500","⚜️ Niveau 750","🎯 Niveau 1000",
];

// ── Client ────────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// ── Ready ─────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Connecté : ${c.user.tag}`);
  c.user.setActivity("🛡️ MAI•GESTION");
  await initDb().catch(e => console.error("DB:", e));

  for (const [, guild] of c.guilds.cache) {
    try { await guild.channels.fetch(); await guild.members.fetch(); } catch {}
    await syncPermissions(guild).catch(e => console.error("sync:", e));
    await postRulesIfNeeded(guild, c.user.id).catch(() => {});
    await postGamePanelIfNeeded(guild, c.user.id).catch(() => {});
    await postGameRulesIfNeeded(guild, c.user.id).catch(() => {});
    await postShopIfNeeded(guild, c.user.id).catch(() => {});
    await postDonPanelIfNeeded(guild, c.user.id).catch(() => {});
    await postLevelsPanelIfNeeded(guild, c.user.id).catch(() => {});
    console.log(`✅ ${guild.name} initialisé`);
  }

  await initMod(client).catch(() => {});
  await resumeGiveaways(client).catch(() => {});
  setInterval(async () => { for (const [,g] of c.guilds.cache) await tickVoiceXP(g).catch(() => {}); }, 5 * 60_000);
  console.log("🚀 Bot opérationnel !");
});

client.on(Events.GuildCreate, async (guild) => {
  try { await guild.channels.fetch(); await guild.members.fetch(); } catch {}
  await syncPermissions(guild).catch(() => {});
  await postRulesIfNeeded(guild, client.user!.id).catch(() => {});
  await postGamePanelIfNeeded(guild, client.user!.id).catch(() => {});
  await postGameRulesIfNeeded(guild, client.user!.id).catch(() => {});
  await postShopIfNeeded(guild, client.user!.id).catch(() => {});
  await postDonPanelIfNeeded(guild, client.user!.id).catch(() => {});
  await postLevelsPanelIfNeeded(guild, client.user!.id).catch(() => {});
});

client.on(Events.GuildMemberUpdate, async (o, n) => {
  await handleBoost(o as GuildMember, n as GuildMember).catch(() => {});
});

// ── Messages ──────────────────────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot || !message.guild || !message.member) return;

  // Non-commande → anti-lien + XP
  if (!message.content.startsWith(PREFIX)) {
    const blocked = await checkAntiLink(message).catch(() => false);
    if (!blocked) await handleMessageXP(message.member as GuildMember).catch(() => {});
    return;
  }

  const args    = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()!.toLowerCase();
  const isAdmin = (message.member as GuildMember).permissions.has(PermissionFlagsBits.Administrator);

  // ── Modération ──────────────────────────────────────────────────────────
  if (MOD_CMDS.has(command)) {
    if (!isAdmin) return;
    await handleModCommand(message, command, args).catch(e => { console.error("mod:", e); message.reply("❌ Erreur.").catch(() => {}); });
    return;
  }

  // ── !rank ────────────────────────────────────────────────────────────────
  if (command === "rank") {
    await rankCommand(message).catch(() => {});
    return;
  }

  // ── !solde / !coins / !balance ───────────────────────────────────────────
  if (["solde","coins","balance","pièces","pieces"].includes(command)) {
    const target = message.mentions.members?.first() ?? (message.member as GuildMember);
    const data   = await getUser(message.guild.id, target.id);
    await message.reply({ embeds: [
      new EmbedBuilder().setColor(0xffd700).setTitle("💰 Solde de pièces")
        .setDescription(`**${target.displayName}** : **${data.coins.toLocaleString("fr-FR")} 🪙**`)
        .addFields(
          { name:"⭐ XP",    value:`${data.xp.toLocaleString("fr-FR")}`, inline:true },
          { name:"🏆 Niveau",value:`${data.level}`,                      inline:true },
        )
        .setThumbnail(target.user.displayAvatarURL())
        .setFooter({ text:"MAI•GESTION" }).setTimestamp()
    ] }).catch(() => {});
    return;
  }

  // ── !daily ───────────────────────────────────────────────────────────────
  if (command === "daily") {
    const key    = `daily:${message.guild.id}:${message.author.id}`;
    const lastTs = parseInt((await getState(key)) ?? "0");
    const now    = Date.now();
    if (lastTs && now - lastTs < DAILY_CD) {
      const rem  = lastTs + DAILY_CD - now;
      const hrs  = Math.floor(rem / 3_600_000);
      const mins = Math.floor((rem % 3_600_000) / 60_000);
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xff9900).setTitle("⏰ Daily déjà réclamé").setDescription(`Reviens dans **${hrs}h ${mins}min** !`).setFooter({text:"MAI•GESTION"}).setTimestamp()] }).catch(() => {});
      return;
    }
    const reward = Math.floor(Math.random() * 251) + 50;
    await setState(key, String(now));
    const data = await getUser(message.guild.id, message.author.id);
    await saveUser(message.guild.id, message.author.id, { ...data, coins: data.coins + reward });
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x00cc66).setTitle("🎁 Daily réclamé !").setDescription(`**+${reward} 🪙** !\n\n💰 Solde : **${(data.coins+reward).toLocaleString("fr-FR")} 🪙**`).setFooter({text:"MAI•GESTION • Reviens demain !"}).setTimestamp()] }).catch(() => {});
    return;
  }

  // ── !resetxp all (admin) ─────────────────────────────────────────────────
  if (command === "resetxp") {
    if (!isAdmin) return;
    if (args[0]?.toLowerCase() !== "all") {
      await message.reply("❌ Usage : `!resetxp all`").catch(() => {}); return;
    }
    const confirmMsg = await message.reply({ embeds: [
      new EmbedBuilder().setColor(0xff9900).setTitle("⚠️ Confirmation requise")
        .setDescription("Tape **`confirmer`** dans les 15 secondes pour remettre **l'XP et les niveaux de tout le monde à zéro**.\nLes rôles de niveau seront aussi retirés.")
        .setFooter({text:"MAI•GESTION"}).setTimestamp()
    ] }).catch(() => null);
    const collected = await message.channel.awaitMessages({ filter: m => m.author.id === message.author.id && m.content.toLowerCase() === "confirmer", max:1, time:15_000, errors:[] });
    if (!collected.size) { await confirmMsg?.edit({ embeds:[new EmbedBuilder().setColor(0x888888).setDescription("❌ Reset annulé.").setFooter({text:"MAI•GESTION"}).setTimestamp()] }).catch(()=>{}); return; }
    collected.first()?.delete().catch(() => {});
    await resetAllXP(message.guild.id);
    let removed = 0;
    for (const [, member] of message.guild.members.cache) {
      if (member.user.bot) continue;
      for (const name of LEVEL_ROLE_NAMES) {
        const r = message.guild.roles.cache.find(r => r.name === name);
        if (r && member.roles.cache.has(r.id)) { await member.roles.remove(r).catch(() => {}); removed++; }
      }
    }
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x00cc66).setTitle("✅ Reset XP effectué !").setDescription(`XP + niveaux de tous les membres remis à **0**.\n**${removed}** rôle(s) de niveau retirés.`).setFooter({text:"MAI•GESTION"}).setTimestamp()] }).catch(() => {});
    return;
  }

  // ── !giveaway (admin) ────────────────────────────────────────────────────
  if (command === "giveaway") {
    if (!isAdmin) return;
    if (args.length < 2) { await message.reply("❌ Usage : `!giveaway [durée] [prix]`\nEx: `!giveaway 24h Nitro` ou `!giveaway 1h 500 coins`").catch(() => {}); return; }
    try {
      await launchGiveaway(client, message.channel.id, message.guild.id, args.slice(1).join(" "), args[0]!);
      await message.reply("✅ Giveaway lancé !").catch(() => {});
    } catch (e) { await message.reply(`❌ ${e instanceof Error ? e.message : "Erreur"}`).catch(() => {}); }
    return;
  }

  // ── !help ────────────────────────────────────────────────────────────────
  if (command === "help" || command === "aide") {
    await message.reply({ embeds: [
      new EmbedBuilder().setColor(0x9b59b6).setTitle("📋 Commandes MAI•GESTION")
        .addFields(
          { name:"👤 Tout le monde", value:"`!rank [@membre]` — XP/niveau\n`!solde [@membre]` — Pièces\n`!daily` — Récompense quotidienne (50–300🪙)" },
          ...(isAdmin ? [{ name:"🛡️ Admins", value:"`!ban @m` `!unban [ID]` `!mute @m [min]` `!demute @m` `!lock` `!unlock` `!giveaway [durée] [prix]` `!resetxp all`" }] : []),
        )
        .setFooter({text:"MAI•GESTION • Jeux, shop et dons via boutons"}).setTimestamp()
    ] }).catch(() => {});
    return;
  }
});

// ── Interactions ──────────────────────────────────────────────────────────────
async function safeReply(i: ButtonInteraction | UserSelectMenuInteraction | ModalSubmitInteraction, fn: () => Promise<void>) {
  try { await fn(); }
  catch (e) {
    console.error("Interaction error:", e);
    try {
      if (!i.replied && !i.deferred) await (i as ButtonInteraction).reply({ content:"❌ Une erreur s'est produite.", ephemeral:true });
      else await (i as ButtonInteraction).followUp({ content:"❌ Une erreur s'est produite.", ephemeral:true });
    } catch {}
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    const btn = interaction as ButtonInteraction;
    if (btn.customId === RULES_BTN_ID)          return safeReply(btn, () => handleRulesAccept(btn));
    if (btn.customId === GIVEAWAY_JOIN_BTN)      return safeReply(btn, () => handleGiveawayJoin(btn));
    if (btn.customId === DON_BTN)                return safeReply(btn, () => handleDonButton(btn));
    if (btn.customId.startsWith("shop_"))        return safeReply(btn, () => handleShopButton(btn));
    if (btn.customId.startsWith("g_"))           return safeReply(btn, () => handleGameButton(btn));
  }
  if (interaction.isUserSelectMenu() && interaction.customId.startsWith("g_duel_pick:"))
    return safeReply(interaction as UserSelectMenuInteraction, () => handleDuelSelect(interaction as UserSelectMenuInteraction));
  if (interaction.isModalSubmit() && interaction.customId === DON_MODAL)
    return safeReply(interaction as ModalSubmitInteraction, () => handleDonModal(interaction as ModalSubmitInteraction));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const token = process.env["DISCORD_TOKEN"];
if (!token) { console.error("❌ DISCORD_TOKEN manquant !"); process.exit(1); }
client.login(token).catch(e => { console.error("❌ Login échoué:", e); process.exit(1); });
