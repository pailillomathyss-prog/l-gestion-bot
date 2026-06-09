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
  ComponentType,
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
  syncChannelPermissions,
} from "./modules/rulesGate";
import { initMemberXP, processVoiceXP, trackVoiceJoin, trackVoiceLeave } from "./modules/expSystem";
import { handleBoostUpdate } from "./modules/boostAnnounce";
import { initPunishments } from "./modules/punishSystem";
import { registerSlashCommands } from "./slash/register";
import { handleSlashCommand } from "./slash/handler";
import { getSavedRulesMessageId } from "./state";
import { ensureTables } from "./modules/db";
import { resumeGiveaways } from "./modules/giveawaySystem";
import { startNewQuest, getQuestState } from "./modules/questSystem";
import { joinGiveaway, getActiveGiveaways } from "./modules/db";

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

client.once(Events.ClientReady, async (c) => {
  logger.info(`Bot connecté en tant que ${c.user.tag}`);
  c.user.setActivity("Surveille le serveur 🛡️");

  await ensureTables().catch((err) =>
    logger.error({ err }, "Impossible de créer les tables DB")
  );

  try {
    await c.user.setUsername("MAI•GESTION");
    logger.info("Nom du bot mis à jour ✅");
  } catch {
    logger.info("Nom déjà défini ou cooldown Discord");
  }

  try {
    const avatarPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "avatar.jpeg"
    );
    const avatarBuffer = readFileSync(avatarPath);
    await c.user.setAvatar(avatarBuffer);
    logger.info("Avatar mis à jour ✅");
  } catch {
    logger.info("Avatar déjà défini (cooldown Discord)");
  }

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

    await syncChannelPermissions(guild).catch((err) =>
      logger.error({ err }, `Erreur sync permissions sur ${guild.name}`)
    );

    for (const [, member] of guild.members.cache) {
      if (!member.user.bot) await initMemberXP(member).catch(() => {});
    }

    logger.info(`✅ Initialisation complète du serveur "${guild.name}"`);
  }

  await initPunishments(c).catch((err) =>
    logger.error({ err }, "Erreur initPunishments")
  );

  // ── Reprendre les giveaways actifs ────────────────────────────────────────
  await resumeGiveaways(c).catch((err) =>
    logger.error({ err }, "Erreur resumeGiveaways")
  );

  // ── Quêtes : démarrer ou reprendre ───────────────────────────────────────
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

  // ── XP vocal : +20 XP toutes les 10 minutes ──────────────────────────────
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
});

client.on(Events.GuildMemberAdd, async (member) => {
  await initMemberXP(member as GuildMember).catch(() => {});
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  await handleBoostUpdate(
    oldMember as GuildMember,
    newMember as GuildMember
  ).catch(() => {});
});

client.on(Events.VoiceStateUpdate, (oldState: VoiceState, newState: VoiceState) => {
  const guildId = newState.guild.id;
  const userId = newState.id;

  const joined = !oldState.channelId && newState.channelId;
  const left   = oldState.channelId && !newState.channelId;
  const moved  = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;

  if (joined || moved) {
    trackVoiceJoin(guildId, userId);
  } else if (left) {
    trackVoiceLeave(guildId, userId);
  }
});

// ── Interactions (slash + boutons) ───────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  // Bouton giveaway
  if (interaction.isButton() && interaction.customId === "giveaway_join") {
    const btn = interaction as ButtonInteraction;
    if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }

    // Trouver le giveaway associé au message
    const actives = await getActiveGiveaways().catch(() => []);
    const giveaway = actives.find(g => g.messageId === btn.message.id);
    if (!giveaway) {
      await btn.reply({ content: "❌ Ce giveaway est introuvable ou terminé.", ephemeral: true });
      return;
    }

    const joined = await joinGiveaway(giveaway.id, btn.user.id).catch(() => false);
    await btn.reply({
      content: joined
        ? "✅ Tu participes au giveaway ! Bonne chance 🎉"
        : "❌ Tu participes déjà à ce giveaway.",
      ephemeral: true,
    });

    // Mettre à jour le compteur sur le message
    if (joined) {
      const updatedActives = await getActiveGiveaways().catch(() => []);
      const updated = updatedActives.find(g => g.id === giveaway.id);
      if (updated && btn.message.editable) {
        const { EmbedBuilder } = await import("discord.js");
        const embed = new EmbedBuilder()
          .setColor(0xff69b4)
          .setTitle("🎉 GIVEAWAY")
          .setDescription(`**${updated.prize}**\n\nClique sur 🎉 ci-dessous pour participer !`)
          .addFields(
            { name: "⏰ Fin", value: `<t:${Math.floor(updated.endsAt / 1000)}:R>`, inline: true },
            { name: "👥 Participants", value: `**${updated.participants.length}**`, inline: true },
          )
          .setFooter({ text: "MAI•GESTION • 1 participation par personne" })
          .setTimestamp();
        btn.message.edit({ embeds: [embed] }).catch(() => {});
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  try {
    await handleSlashCommand(interaction as ChatInputCommandInteraction);
  } catch (err) {
    logger.error({ err }, `Erreur slash command: ${(interaction as ChatInputCommandInteraction).commandName}`);
    const reply = { content: "❌ Une erreur est survenue.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

client.on(Events.MessageCreate, handleMessage);

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

  if (
    emojiName === ENTER_REACTION &&
    (rulesMessageId === null || messageId === rulesMessageId)
  ) {
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

  if (
    emojiName === ENTER_REACTION &&
    (rulesMessageId === null || messageId === rulesMessageId)
  ) {
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
