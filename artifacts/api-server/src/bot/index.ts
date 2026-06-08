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
import { initMemberXP } from "./modules/expSystem";
import { handleBoostUpdate } from "./modules/boostAnnounce";
import { initPunishments } from "./modules/punishSystem";
import { registerSlashCommands } from "./slash/register";
import { handleSlashCommand } from "./slash/handler";
import { getSavedRulesMessageId } from "./state";

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

    // ── Salon règlement → message "entrer ?" persistant ──────────────────
    const textChannels = guild.channels.cache.filter(
      (ch) => ch.type === ChannelType.GuildText
    ) as Collection<string, TextChannel>;

    const rulesChannel = textChannels.find((ch) => {
      const n = ch.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return n.includes("reglement") || n.includes("rules") || n.includes("regles");
    }) ?? null;

    if (rulesChannel) {
      const savedId = getSavedRulesMessageId(guild.id);
      const msgId = await findOrSendEnterMessage(rulesChannel, savedId, guild.id);
      if (msgId) setRulesMessageId(msgId);
    } else {
      logger.warn(`Aucun salon "règlement" trouvé sur ${guild.name}`);
    }

    // ── Synchroniser les permissions des salons ───────────────────────────
    await syncChannelPermissions(guild).catch((err) =>
      logger.error({ err }, `Erreur sync permissions sur ${guild.name}`)
    );

    // ── Initialiser XP / rôles de niveau pour les membres existants ───────
    for (const [, member] of guild.members.cache) {
      if (!member.user.bot) await initMemberXP(member).catch(() => {});
    }

    logger.info(`✅ Initialisation complète du serveur "${guild.name}"`);
  }

  // ── Reprendre les sanctions actives après redéploiement ──────────────────
  await initPunishments(c).catch((err) =>
    logger.error({ err }, "Erreur initPunishments")
  );
});

// Nouveau membre → initialiser XP
client.on(Events.GuildMemberAdd, async (member) => {
  await initMemberXP(member as GuildMember).catch(() => {});
});

// Boost via mise à jour du membre
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  await handleBoostUpdate(
    oldMember as GuildMember,
    newMember as GuildMember
  ).catch(() => {});
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleSlashCommand(interaction as ChatInputCommandInteraction);
  } catch (err) {
    logger.error({ err }, `Erreur slash command: ${interaction.commandName}`);
    const reply = { content: "❌ Une erreur est survenue.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

client.on(Events.MessageCreate, handleMessage);

// Réaction ✅ → donner le rôle ⏳・nouveaux
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

// Retrait de réaction → retirer le rôle
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
