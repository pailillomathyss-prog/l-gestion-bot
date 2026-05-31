import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
  GuildMember,
  TextChannel,
  ChannelType,
  ChatInputCommandInteraction,
} from "discord.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { logger } from "../lib/logger";
import { handleMessage } from "./handlers/messageHandler";
import { handleGiveawayReaction } from "./handlers/giveawayHandler";
import {
  handleRulesReaction,
  RULES_REACTION,
  rulesMessageId,
  setRulesMessageId,
  sendRulesMessage,
  ensureMembresRolePermissions,
} from "./modules/rulesGate";
import {
  handleRoleSelectorReaction,
  ROLE_EMOJIS,
  roleSelectorMessageId,
  setRoleSelectorMessageId,
  sendRoleSelectorMessage,
} from "./modules/roleSelector";
import { registerSlashCommands } from "./slash/register";
import { handleSlashCommand } from "./slash/handler";
import {
  getSavedRulesMessageId,
  getSavedRoleSelectorMessageId,
  saveRulesMessageId,
  saveRoleSelectorMessageId,
} from "./state";

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

export const giveaways = new Collection<string, GiveawayData>();

export interface GiveawayData {
  messageId: string;
  channelId: string;
  prize: string;
  winner: number;
  endsAt: number;
  ended: boolean;
  participants: Set<string>;
  invitesRequired?: number;
}

client.once(Events.ClientReady, async (c) => {
  logger.info(`Bot connecté en tant que ${c.user.tag}`);
  c.user.setActivity("Surveille le serveur 🛡️");

  try {
    const avatarPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "avatar.jpeg"
    );
    const avatarBuffer = readFileSync(avatarPath);
    await c.user.setAvatar(avatarBuffer);
    logger.info("Avatar du bot mis à jour ✅");
  } catch {
    logger.info("Avatar déjà défini (cooldown Discord)");
  }

  const token = process.env["DISCORD_TOKEN"]!;
  await registerSlashCommands(token, c.user.id);

  for (const [, guild] of c.guilds.cache) {
    logger.info(`Scan du serveur : ${guild.name}`);

    const textChannels = guild.channels.cache.filter(
      (ch) => ch.type === ChannelType.GuildText
    ) as Collection<string, TextChannel>;

    const rulesChannel = textChannels.find((ch) =>
      ch.name.toLowerCase().includes("règles") ||
      ch.name.toLowerCase().includes("regles") ||
      ch.name.toLowerCase().includes("règlement")
    ) ?? null;

    const rolesChannel = textChannels.find((ch) =>
      ch.name.toLowerCase().includes("rôles") ||
      ch.name.toLowerCase().includes("roles") ||
      (ch.name.toLowerCase().includes("role") && !ch.name.toLowerCase().includes("selector"))
    ) ?? null;

    if (rulesChannel) {
      const savedId = getSavedRulesMessageId(guild.id);
      const existing = savedId
        ? await rulesChannel.messages.fetch(savedId).catch(() => null)
        : null;

      if (existing) {
        setRulesMessageId(savedId!);
        logger.info(`Règlement déjà présent dans #${rulesChannel.name} ✅`);
      } else {
        logger.info(`Envoi du règlement dans #${rulesChannel.name}`);
        const msgId = await sendRulesMessage(rulesChannel);
        if (msgId) {
          setRulesMessageId(msgId);
          saveRulesMessageId(guild.id, msgId);
          await ensureMembresRolePermissions(guild);
        }
      }
    } else {
      logger.warn(`Aucun salon "règles" trouvé sur ${guild.name}`);
    }

    if (rolesChannel) {
      const savedId = getSavedRoleSelectorMessageId(guild.id);
      const existing = savedId
        ? await rolesChannel.messages.fetch(savedId).catch(() => null)
        : null;

      if (existing) {
        setRoleSelectorMessageId(savedId!);
        logger.info(`Sélection de rôles déjà présente dans #${rolesChannel.name} ✅`);
      } else {
        logger.info(`Envoi du sélecteur de rôles dans #${rolesChannel.name}`);
        const msgId = await sendRoleSelectorMessage(rolesChannel);
        if (msgId) {
          setRoleSelectorMessageId(msgId);
          saveRoleSelectorMessageId(guild.id, msgId);
        }
      }
    } else {
      logger.warn(`Aucun salon "rôles" trouvé sur ${guild.name}`);
    }
  }
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

  if (emojiName === "🎉") { await handleGiveawayReaction(reaction, user, "add"); return; }

  if (emojiName === RULES_REACTION && (rulesMessageId === null || messageId === rulesMessageId)) {
    await handleRulesReaction(member as GuildMember, messageId, "add"); return;
  }

  if (ROLE_EMOJIS[emojiName] && (roleSelectorMessageId === null || messageId === roleSelectorMessageId)) {
    await handleRoleSelectorReaction(member as GuildMember, messageId, emojiName, "add");
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

  if (emojiName === "🎉") { await handleGiveawayReaction(reaction, user, "remove"); return; }

  if (emojiName === RULES_REACTION && (rulesMessageId === null || messageId === rulesMessageId)) {
    await handleRulesReaction(member as GuildMember, messageId, "remove"); return;
  }

  if (ROLE_EMOJIS[emojiName] && (roleSelectorMessageId === null || messageId === roleSelectorMessageId)) {
    await handleRoleSelectorReaction(member as GuildMember, messageId, emojiName, "remove");
  }
});

export function startBot() {
  const token = process.env["DISCORD_TOKEN"];
  if (!token) { logger.error("DISCORD_TOKEN manquant !"); return; }
  client.login(token).catch((err) => {
    logger.error({ err }, "Impossible de connecter le bot Discord");
  });
}
