import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  GuildMember,
  TextChannel,
  ChannelType,
  Collection,
  ChatInputCommandInteraction,
  VoiceState,
  ButtonInteraction,
  UserSelectMenuInteraction,
  EmbedBuilder,
  Message,
} from "discord.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { logger } from "../lib/logger";
import { handleMessage } from "./handlers/messageHandler";
import {
  handleEnterReaction,
  ENTER_REACTION,
  rulesMessageId,
  setRulesMessageId,
  findOrSendEnterMessage,
  syncJugementPermissions,
} from "./modules/rulesGate";
import { initMemberXP, processVoiceXP, trackVoiceJoin, trackVoiceLeave } from "./modules/expSystem";
import { handleBoostUpdate } from "./modules/boostAnnounce";
import { initPunishments } from "./modules/punishSystem";
import { registerSlashCommands } from "./slash/register";
import { handleSlashCommand } from "./slash/handler";
import { getSavedRulesMessageId } from "./state";

import { resumeGiveaways } from "./modules/giveawaySystem";
import { startNewQuest } from "./modules/questSystem";
import { ensureTables, getCoins, addCoins, getQuestState, joinGiveaway, getActiveGiveaways } from "./modules/db";
import {
  SHOP_ROLES,
  buildGenericShopEmbed,
  buildGenericShopComponents,
} from "./commands/shop";
import { handleGameButton, handleGameSelect, postGameMenuIfNeeded } from "./modules/gameSystem";
import { claimQuest } from "./modules/questSystem";
import { postDailyMenuIfNeeded, handleDailyClaim, handleDailyStreak } from "./modules/dailySystem";

// ── Nouveaux systèmes ─────────────────────────────────────────────────────────
import { initWeather, recordMessage } from "./modules/weatherSystem";
import { initLoto, joinLoto, updateLotoMessage } from "./modules/lotoSystem";
import { initCommunityChallenge, claimChallengeReward } from "./modules/communityChallenge";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User],
});

// ── Auto-post le panneau de boutique dans 🧸・shop ────────────────────────────
async function postShopIfNeeded(guild: import("discord.js").Guild, botId: string) {
  const shopChannel = guild.channels.cache.find(
    (ch) =>
      ch.type === ChannelType.GuildText &&
      (ch.name.toLowerCase().includes("shop") || ch.name.includes("🧸"))
  ) as TextChannel | undefined;

  if (!shopChannel) return;

  try {
    const recent = await shopChannel.messages.fetch({ limit: 15 });
    const alreadyPosted = recent.some(
      (m) => m.author.id === botId && m.embeds[0]?.title?.includes("Boutique")
    );
    if (alreadyPosted) { logger.info(`Panneau boutique déjà posté dans #${shopChannel.name}`); return; }
    const embed = buildGenericShopEmbed();
    const components = buildGenericShopComponents();
    await shopChannel.send({ embeds: [embed], components });
    logger.info(`✅ Panneau boutique posté dans #${shopChannel.name}`);
  } catch (err) {
    logger.warn({ err }, `Impossible de poster le shop dans #${shopChannel.name}`);
  }
}

// ── ClientReady ───────────────────────────────────────────────────────────────
client.once(Events.ClientReady, async (c) => {
  logger.info(`Bot connecté en tant que ${c.user.tag}`);
  c.user.setActivity("Surveille le serveur 🛡️");

  await ensureTables().catch((err) => logger.error({ err }, "Impossible de créer les tables DB"));

  try { await c.user.setUsername("MAI•GESTION"); logger.info("Nom du bot mis à jour ✅"); }
  catch { logger.info("Nom déjà défini ou cooldown Discord"); }

  try {
    const avatarPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "avatar.jpeg");
    await c.user.setAvatar(readFileSync(avatarPath));
    logger.info("Avatar mis à jour ✅");
  } catch { logger.info("Avatar déjà défini (cooldown Discord)"); }

  const token = process.env["DISCORD_TOKEN"]!;
  await registerSlashCommands(token, c.user.id);

  for (const [, guild] of c.guilds.cache) {
    logger.info(`Scan du serveur : ${guild.name}`);
    await guild.channels.fetch();
    await guild.members.fetch();

    const textChannels = guild.channels.cache.filter(
      (ch) => ch.type === ChannelType.GuildText
    ) as Collection<string, TextChannel>;

    const rulesChannel = textChannels.find((ch) => {
      const n = ch.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return n.includes("reglement") || n.includes("rules") || n.includes("regles");
    }) ?? null;

    if (rulesChannel) {
      const savedId = await getSavedRulesMessageId(guild.id);
      const msgId = await findOrSendEnterMessage(rulesChannel, savedId, guild.id);
      if (msgId) setRulesMessageId(msgId);
    } else {
      logger.warn(`Aucun salon "règlement" trouvé sur ${guild.name}`);
    }

    // ── Sync permissions catégorie JUGEMENT ───────────────────────────────
    await syncJugementPermissions(guild).catch((err) =>
      logger.error({ err }, `Erreur sync jugement sur ${guild.name}`)
    );

    for (const [, member] of guild.members.cache) {
      if (!member.user.bot) await initMemberXP(member).catch(() => {});
    }

    await postShopIfNeeded(guild, c.user.id);
    await postGameMenuIfNeeded(guild, c.user.id);
    await postDailyMenuIfNeeded(guild, c.user.id);

    logger.info(`✅ Initialisation complète du serveur "${guild.name}"`);
  }

  await initPunishments(c).catch((err) => logger.error({ err }, "Erreur initPunishments"));
  await resumeGiveaways(c).catch((err) => logger.error({ err }, "Erreur resumeGiveaways"));

  // ── Nouveaux systèmes ─────────────────────────────────────────────────────
  await initWeather(c).catch((err) => logger.error({ err }, "Erreur initWeather"));
  await initLoto(c).catch((err) => logger.error({ err }, "Erreur initLoto"));
  await initCommunityChallenge(c).catch((err) => logger.error({ err }, "Erreur initCommunityChallenge"));

  // ── Quêtes ────────────────────────────────────────────────────────────────
  async function scheduleNextQuest() {
    for (const [, guild] of c.guilds.cache) {
      try {
        const state = await getQuestState(guild.id);
        const now = Date.now();
        if (state) {
          const endsAt = state.startedAt + 12 * 60 * 60 * 1000;
          if (now < endsAt) {
            const remaining = endsAt - now;
            logger.info(`⏳ Quête active sur ${guild.name}, prochaine dans ${Math.round(remaining / 60000)} min`);
            setTimeout(async () => {
              await startNewQuest(c).catch(() => {});
              setInterval(() => startNewQuest(c).catch(() => {}), 12 * 60 * 60 * 1000);
            }, remaining);
            return;
          }
        }
        await startNewQuest(c);
      } catch (err) {
        logger.error({ err }, `Erreur init quête sur ${guild.name}`);
      }
    }
    setInterval(() => startNewQuest(c).catch(() => {}), 12 * 60 * 60 * 1000);
  }
  await scheduleNextQuest().catch(() => {});

  // ── XP vocal (toutes les 10 min) ─────────────────────────────────────────
  setInterval(async () => {
    for (const [, guild] of c.guilds.cache) {
      await processVoiceXP(guild).catch((err) =>
        logger.warn({ err }, `Erreur voice XP sur ${guild.name}`)
      );
    }
  }, 10 * 60 * 1000);

  logger.info("🎙️ XP vocal actif (toutes les 10 min)");
  logger.info("🎉 Giveaway system actif");
  logger.info("🎯 Quest system actif");
  logger.info("🧸 Shop system actif");
  logger.info("🎮 Games system actif");
  logger.info("🎁 Daily reward system actif");
  logger.info("🏅 Badge system actif");
  logger.info("🌤️ Weather system actif");
  logger.info("🎰 Loto system actif");
  logger.info("🌍 Community Challenge actif");
  logger.info("⚖️ Jugement permissions sync au démarrage");
});

// ── Events membres ────────────────────────────────────────────────────────────
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
  const left   = oldState.channelId && !newState.channelId;
  const moved  = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;
  if (joined || moved) trackVoiceJoin(guildId, userId);
  else if (left) trackVoiceLeave(guildId, userId);
});

// ── Handler boutique ──────────────────────────────────────────────────────────
async function handleShopButton(btn: ButtonInteraction) {
  if (!btn.guild || !btn.member) {
    await btn.reply({ content: "❌ Erreur serveur.", ephemeral: true });
    return;
  }
  const member = await btn.guild.members.fetch(btn.user.id).catch(() => null) as GuildMember | null;
  if (!member) { await btn.reply({ content: "❌ Impossible de récupérer ton profil.", ephemeral: true }); return; }

  if (btn.customId === "shop_balance") {
    const balance = await getCoins(btn.guild.id, btn.user.id);
    await btn.reply({
      embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("💰 Ton solde")
        .setDescription(`**${balance.toLocaleString("fr-FR")} 🪙**`)
        .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
      ephemeral: true,
    });
    return;
  }

  if (btn.customId === "shop_myitems") {
    const owned = SHOP_ROLES.filter((r) => member.roles.cache.some((role) => role.name === r.name));
    const balance = await getCoins(btn.guild.id, btn.user.id);
    await btn.reply({
      embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle("🎒 Tes rôles de la boutique")
        .setDescription(owned.length > 0 ? owned.map((r) => `✅ **${r.name}** — ${r.description}`).join("\n") : "Tu n'as encore aucun rôle de la boutique.")
        .addFields({ name: "💰 Solde actuel", value: `**${balance.toLocaleString("fr-FR")} 🪙**`, inline: false })
        .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
      ephemeral: true,
    });
    return;
  }

  if (btn.customId.startsWith("shop_buy_")) {
    const roleId   = btn.customId.replace("shop_buy_", "");
    const shopRole = SHOP_ROLES.find((r) => r.id === roleId);
    if (!shopRole) { await btn.reply({ content: "❌ Rôle introuvable.", ephemeral: true }); return; }

    if (member.roles.cache.some((r) => r.name === shopRole.name)) {
      await btn.reply({ content: `❌ Tu possèdes déjà le rôle **${shopRole.name}** !`, ephemeral: true });
      return;
    }

    const balance = await getCoins(btn.guild.id, btn.user.id);
    if (balance < shopRole.price) {
      await btn.reply({
        embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("❌ Solde insuffisant")
          .setDescription(`Il te faut **${shopRole.price.toLocaleString("fr-FR")} 🪙** pour acheter **${shopRole.name}**.\nTu as **${balance.toLocaleString("fr-FR")} 🪙**.`)
          .addFields({ name: "💡 Comment gagner des pièces ?", value: "• Messages (8–15 🪙, cooldown 1 min)\n• Vocal (12 🪙 / 10 min)\n• Quêtes (150–700 🪙)" })
          .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
        ephemeral: true,
      });
      return;
    }

    await btn.guild.roles.fetch();
    let role = btn.guild.roles.cache.find((r) => r.name === shopRole.name);
    if (!role) {
      try { role = await btn.guild.roles.create({ name: shopRole.name, reason: "Rôle boutique MAI•GESTION", permissions: [] }); }
      catch { await btn.reply({ content: "❌ Impossible de créer le rôle.", ephemeral: true }); return; }
    }

    await addCoins(btn.guild.id, btn.user.id, -shopRole.price);
    await member.roles.add(role).catch(() => {});
    const newBalance = await getCoins(btn.guild.id, btn.user.id);
    await btn.reply({
      embeds: [new EmbedBuilder().setColor(0x00cc66).setTitle("✅ Achat réussi !")
        .setDescription(`Tu as obtenu le rôle **${shopRole.name}** !\n\n${shopRole.description}`)
        .addFields(
          { name: "💸 Prix payé",    value: `**${shopRole.price.toLocaleString("fr-FR")} 🪙**`, inline: true },
          { name: "💰 Solde restant", value: `**${newBalance.toLocaleString("fr-FR")} 🪙**`,    inline: true },
        ).setFooter({ text: "MAI•GESTION" }).setTimestamp()],
      ephemeral: true,
    });
  }
}

// ── Interactions ──────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  const errReply = async (target: ButtonInteraction | UserSelectMenuInteraction, msg = "❌ Une erreur est survenue.") => {
    const r = { content: msg, ephemeral: true };
    if (target.replied || target.deferred) await target.followUp(r).catch(() => {});
    else await target.reply(r).catch(() => {});
  };

  // ── Giveaway ──────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "giveaway_join") {
    const btn = interaction as ButtonInteraction;
    if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }
    const actives  = await getActiveGiveaways().catch(() => []);
    const giveaway = actives.find(g => g.messageId === btn.message.id);
    if (!giveaway) { await btn.reply({ content: "❌ Ce giveaway est introuvable ou terminé.", ephemeral: true }); return; }
    const joined = await joinGiveaway(giveaway.id, btn.user.id).catch(() => false);
    await btn.reply({ content: joined ? "✅ Tu participes au giveaway ! Bonne chance 🎉" : "❌ Tu participes déjà à ce giveaway.", ephemeral: true });
    if (joined) {
      const updated = (await getActiveGiveaways().catch(() => [])).find(g => g.id === giveaway.id);
      if (updated && btn.message.editable) {
        btn.message.edit({ embeds: [new EmbedBuilder().setColor(0xff69b4).setTitle("🎉 GIVEAWAY")
          .setDescription(`**${updated.prize}**\n\nClique sur 🎉 ci-dessous pour participer !`)
          .addFields(
            { name: "⏰ Fin",          value: `<t:${Math.floor(updated.endsAt / 1000)}:R>`, inline: true },
            { name: "👥 Participants", value: `**${updated.participants.length}**`,           inline: true },
          ).setFooter({ text: "MAI•GESTION • 1 participation par personne" }).setTimestamp()] }).catch(() => {});
      }
    }
    return;
  }

  // ── Loto ──────────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "loto_join") {
    const btn = interaction as ButtonInteraction;
    if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }
    const joined = await joinLoto(btn.guild.id, btn.user.id).catch(() => false);
    await btn.reply({
      content: joined ? "🎰 Tu es inscrit au loto ! Bonne chance !" : "❌ Tu participes déjà au loto.",
      ephemeral: true,
    });
    if (joined) updateLotoMessage(btn.guild.id, client).catch(() => {});
    return;
  }

  // ── Daily ─────────────────────────────────────────────────────────────────
  if (interaction.isButton() && (interaction.customId === "daily_claim" || interaction.customId === "daily_streak")) {
    const btn = interaction as ButtonInteraction;
    if (interaction.customId === "daily_claim") {
      await handleDailyClaim(btn).catch(async (err) => { logger.error({ err }, "Erreur handleDailyClaim"); await errReply(btn); });
    } else {
      await handleDailyStreak(btn).catch(async (err) => { logger.error({ err }, "Erreur handleDailyStreak"); await errReply(btn); });
    }
    return;
  }

  // ── Quête ─────────────────────────────────────────────────────────────────
  if (interaction.isButton() && (interaction.customId === "quest_claim" || interaction.customId === "quest_progress")) {
    const btn = interaction as ButtonInteraction;
    if (!btn.guild || !btn.member) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }
    const member = await btn.guild.members.fetch(btn.user.id).catch(() => null) as GuildMember | null;
    if (!member) { await btn.reply({ content: "❌ Impossible de récupérer ton profil.", ephemeral: true }); return; }
    if (btn.customId === "quest_claim") {
      const result = await claimQuest(member).catch(() => ({ success: false, message: "❌ Une erreur est survenue." }));
      await btn.reply({
        embeds: [new EmbedBuilder().setColor(result.success ? 0x00cc66 : 0xff4444).setDescription(result.message).setFooter({ text: "MAI•GESTION" }).setTimestamp()],
        ephemeral: true,
      });
    } else {
      const { getMyQuestProgress } = await import("./modules/questSystem");
      await btn.reply({ embeds: [await getMyQuestProgress(member)], ephemeral: true });
    }
    return;
  }

  // ── Jeux ──────────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("game_")) {
    await handleGameButton(interaction as ButtonInteraction).catch(async (err) => {
      logger.error({ err }, "Erreur handleGameButton");
      await errReply(interaction as ButtonInteraction);
    });
    return;
  }

  if (interaction.isUserSelectMenu() && interaction.customId.startsWith("game_duel_pick:")) {
    await handleGameSelect(interaction as UserSelectMenuInteraction).catch(async (err) => {
      logger.error({ err }, "Erreur handleGameSelect");
      await errReply(interaction as UserSelectMenuInteraction);
    });
    return;
  }

  // ── Boutique ──────────────────────────────────────────────────────────────
  if (interaction.isButton() && (interaction.customId.startsWith("shop_buy_") || interaction.customId === "shop_balance" || interaction.customId === "shop_myitems")) {
    await handleShopButton(interaction as ButtonInteraction).catch(async (err) => {
      logger.error({ err }, "Erreur handleShopButton");
      await errReply(interaction as ButtonInteraction);
    });
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  try {
    await handleSlashCommand(interaction as ChatInputCommandInteraction);
  } catch (err) {
    logger.error({ err }, `Erreur slash command: ${(interaction as ChatInputCommandInteraction).commandName}`);
    const reply = { content: "❌ Une erreur est survenue.", ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});

// ── Messages ──────────────────────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message) => {
  if (!message.author.bot) recordMessage(); // compteur météo

  // Commande !claim-defi
  if (!message.author.bot && message.content.trim().toLowerCase() === "!claim-defi") {
    const guild = message.guild;
    if (!guild) return;
    const member = await guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;
    const result = await claimChallengeReward(member).catch(() => ({ success: false, message: "❌ Une erreur est survenue." }));
    const reply = await message.reply({
      embeds: [new EmbedBuilder()
        .setColor(result.success ? 0x00cc66 : 0xff4444)
        .setDescription(result.message)
        .setFooter({ text: "MAI•GESTION" })
        .setTimestamp()],
    }).catch(() => null);
    if (reply) setTimeout(() => reply.delete().catch(() => {}), 15_000);
    return;
  }

  await handleMessage(message as Message);
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
  if (reaction.message.partial) { try { await reaction.message.fetch(); } catch { return; } }
  const guild = reaction.message.guild;
  if (!guild) return;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  const emojiName = reaction.emoji.name ?? "";
  const messageId = reaction.message.id;
  if (emojiName === ENTER_REACTION && (rulesMessageId === null || messageId === rulesMessageId)) {
    await handleEnterReaction(member as GuildMember, messageId, "add");
  }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
  const guild = reaction.message.guild;
  if (!guild) return;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  const emojiName = reaction.emoji.name ?? "";
  const messageId = reaction.message.id;
  if (emojiName === ENTER_REACTION && (rulesMessageId === null || messageId === rulesMessageId)) {
    await handleEnterReaction(member as GuildMember, messageId, "remove");
  }
});

export function startBot() {
  const token = process.env["DISCORD_TOKEN"];
  if (!token) { logger.error("DISCORD_TOKEN manquant !"); return; }
  client.login(token).catch((err) => {
    logger.error({ err }, "Impossible de connecter le bot Discord");
  });
}
