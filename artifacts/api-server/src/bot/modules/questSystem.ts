import { Client, Guild, EmbedBuilder, TextChannel, ChannelType, GuildMember, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../../lib/logger";
import { getQuestState, setQuestState, updateQuestMessageId, getQuestProgress, upsertQuestProgress, getAllQuestProgress, addCoins, QuestStateRow } from "./db";

const QUESTS = [
  { id: "msg_20",   label: "Envoie **20 messages**",        type: "messages",      target: 20,  reward: 150  },
  { id: "msg_50",   label: "Envoie **50 messages**",        type: "messages",      target: 50,  reward: 350  },
  { id: "xp_300",   label: "Gagne **300 XP**",              type: "xp",            target: 300, reward: 250  },
  { id: "xp_600",   label: "Gagne **600 XP**",              type: "xp",            target: 600, reward: 500  },
  { id: "voice_20", label: "Passe **20 minutes en vocal**", type: "voice_minutes", target: 20,  reward: 300  },
  { id: "msg_100",  label: "Envoie **100 messages**",       type: "messages",      target: 100, reward: 700  },
];

let lastQuestIndex = -1;

function pickNextQuest() {
  let idx;
  do { idx = Math.floor(Math.random() * QUESTS.length); } while (idx === lastQuestIndex);
  lastQuestIndex = idx;
  return QUESTS[idx];
}

function progressBar(current: number, total: number, size = 14): string {
  const filled = Math.min(size, Math.round((current / total) * size));
  return "█".repeat(filled) + "░".repeat(size - filled);
}

async function findQuestChannel(guild: Guild): Promise<TextChannel | null> {
  return (guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name.toLowerCase().includes("qu") && (c.name.toLowerCase().includes("ête") || c.name.toLowerCase().includes("ete") || c.name.toLowerCase().includes("quest"))
  ) as TextChannel) ?? null;
}

export async function buildQuestEmbed(guild: Guild, quest: QuestStateRow, endsAt: number): Promise<EmbedBuilder> {
  const topProgress = await getAllQuestProgress(guild.id, quest.questId);
  
  let progressLines = "";
  if (topProgress.length > 0) {
    const lines = await Promise.all(topProgress.slice(0, 5).map(async (p) => {
      const member = await guild.members.fetch(p.userId).catch(() => null);
      const name = member?.displayName ?? `<@${p.userId}>`;
      const bar = progressBar(p.progress, quest.questTarget, 10);
      const done = p.claimed ? " ✅" : (p.progress >= quest.questTarget ? " 🎯" : "");
      return `${name}${done}\n\`${bar}\` ${p.progress}/${quest.questTarget}`;
    }));
    progressLines = lines.join("\n\n");
  } else {
    progressLines = "*Aucune progression pour l'instant...*";
  }

  return new EmbedBuilder()
    .setColor(0xff9900)
    .setTitle("🎯 Quête active")
    .setDescription(quest.questLabel)
    .addFields(
      { name: "🪙 Récompense", value: `**${quest.questReward} pièces**`, inline: true },
      { name: "⏰ Expire", value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
      { name: "📊 Progression (top 5)", value: progressLines },
    )
    .setFooter({ text: "MAI•GESTION • Complète la quête puis clique sur Réclamer !" })
    .setTimestamp();
}

export function buildQuestComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("quest_claim")
        .setLabel("🎁 Réclamer ma récompense")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("quest_progress")
        .setLabel("📊 Ma progression")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export async function startNewQuest(client: Client) {
  const quest = pickNextQuest();
  const now = Date.now();
  const endsAt = now + 12 * 60 * 60 * 1000;

  for (const [, guild] of client.guilds.cache) {
    try {
      const questState: QuestStateRow = {
        questId: quest.id,
        questLabel: quest.label,
        questType: quest.type,
        questTarget: quest.target,
        questReward: quest.reward,
        startedAt: now,
        messageId: null,
      };
      await setQuestState(guild.id, questState);

      const ch = await findQuestChannel(guild);
      if (!ch) { logger.warn(`Salon quêtes introuvable sur ${guild.name}`); continue; }

      const embed = await buildQuestEmbed(guild, questState, endsAt);
      const msg = await ch.send({ embeds: [embed], components: buildQuestComponents() });
      await updateQuestMessageId(guild.id, msg.id);

      logger.info(`🎯 Nouvelle quête "${quest.id}" sur ${guild.name}`);
    } catch (err) {
      logger.error({ err }, `Erreur quête sur ${guild.name}`);
    }
  }
}

export async function updateQuestMessage(guild: Guild) {
  const questState = await getQuestState(guild.id);
  if (!questState || !questState.messageId) return;

  const endsAt = questState.startedAt + 12 * 60 * 60 * 1000;
  if (Date.now() > endsAt) return;

  const ch = await findQuestChannel(guild);
  if (!ch) return;

  try {
    const msg = await ch.messages.fetch(questState.messageId).catch(() => null);
    if (!msg) return;
    const embed = await buildQuestEmbed(guild, questState, endsAt);
    await msg.edit({ embeds: [embed], components: buildQuestComponents() });
  } catch { /* ignoré */ }
}

let lastUpdateMap = new Map<string, number>();

export async function onQuestProgress(member: GuildMember, type: "messages" | "xp" | "voice_minutes", amount: number) {
  const guildId = member.guild.id;
  const userId = member.id;

  const questState = await getQuestState(guildId);
  if (!questState) return;

  const endsAt = questState.startedAt + 12 * 60 * 60 * 1000;
  if (Date.now() > endsAt) return;
  if (questState.questType !== type) return;

  const existing = await getQuestProgress(guildId, userId, );
  if (existing && existing.questId === questState.questId && existing.claimed) return;

  const currentProgress = (existing?.questId === questState.questId ? existing.progress : 0);
  const newProgress = Math.min(questState.questTarget, currentProgress + amount);

  await upsertQuestProgress(guildId, userId, questState.questId, newProgress, false);

  // Update quest message (rate-limited: max 1x per 30s per guild)
  const lastUpdate = lastUpdateMap.get(guildId) ?? 0;
  if (Date.now() - lastUpdate > 30_000) {
    lastUpdateMap.set(guildId, Date.now());
    updateQuestMessage(member.guild).catch(() => {});
  }
}

export async function claimQuest(member: GuildMember): Promise<{ success: boolean; message: string }> {
  const guildId = member.guild.id;
  const userId = member.id;

  const questState = await getQuestState(guildId);
  if (!questState) return { success: false, message: "❌ Aucune quête active en ce moment." };

  const endsAt = questState.startedAt + 12 * 60 * 60 * 1000;
  if (Date.now() > endsAt) return { success: false, message: "❌ La quête a expiré." };

  const progress = await getQuestProgress(guildId, userId);
  if (!progress || progress.questId !== questState.questId)
    return { success: false, message: `❌ Tu n'as pas encore progressé sur cette quête.\nObjectif : ${questState.questLabel}` };

  if (progress.claimed) return { success: false, message: "❌ Tu as déjà réclamé la récompense de cette quête." };
  if (progress.progress < questState.questTarget)
    return { success: false, message: `❌ Quête incomplète — **${progress.progress}/${questState.questTarget}**.\nContinue ! 💪` };

  await upsertQuestProgress(guildId, userId, questState.questId, progress.progress, true);
  const newBalance = await addCoins(guildId, userId, questState.questReward);

  return { success: true, message: `✅ Récompense réclamée ! **+${questState.questReward} 🪙** (solde : **${newBalance} 🪙**)` };
}

export async function getMyQuestProgress(member: GuildMember): Promise<EmbedBuilder> {
  const guildId = member.guild.id;
  const userId = member.id;

  const questState = await getQuestState(guildId);
  if (!questState) {
    return new EmbedBuilder().setColor(0x888888).setDescription("Aucune quête active pour le moment.");
  }

  const endsAt = questState.startedAt + 12 * 60 * 60 * 1000;
  const progress = await getQuestProgress(guildId, userId);
  const current = (progress?.questId === questState.questId ? progress.progress : 0);
  const claimed = progress?.questId === questState.questId ? progress.claimed : false;
  const bar = progressBar(current, questState.questTarget);
  const done = current >= questState.questTarget;

  return new EmbedBuilder()
    .setColor(done ? 0x00cc66 : 0xff9900)
    .setTitle("🎯 Ta progression de quête")
    .setDescription(questState.questLabel)
    .addFields(
      { name: "📊 Progression", value: `\`${bar}\` **${current}/${questState.questTarget}**`, inline: false },
      { name: "🪙 Récompense", value: `**${questState.questReward} pièces**`, inline: true },
      { name: "⏰ Expire", value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
      { name: "Statut", value: claimed ? "✅ Réclamée" : done ? "🎯 Complète — tape `!claim` !" : "⏳ En cours", inline: true },
    )
    .setFooter({ text: "MAI•GESTION" })
    .setTimestamp();
}
