import {
  Guild, GuildMember, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  TextChannel, ChannelType, ButtonInteraction,
} from "discord.js";
import { logger } from "../../lib/logger";
import { getDailyReward, setDailyReward, addCoins, getXP, upsertXP } from "./db";
import { xpToLevel } from "./expSystem";
import { ensurePanel } from "./panelUtils";

const COOLDOWN = 24 * 60 * 60 * 1000;

export function buildDailyEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle("🎁 Récompense quotidienne")
    .setDescription(
      "Clique sur **Réclamer** pour recevoir ta récompense du jour !\n\n" +
      "🪙 **Coins** ou ✨ **XP** — aléatoire chaque jour\n" +
      "🔥 **Streak** — reviens chaque jour pour multiplier tes gains !\n\n" +
      "• Streak 3j → **+30%**\n" +
      "• Streak 7j → **+70%**\n" +
      "• Streak 30j → **x3 MAX** 🚀"
    )
    .setFooter({ text: "MAI•GESTION • Une récompense par jour" })
    .setTimestamp();
}

export function buildDailyComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("daily_claim").setLabel("🎁 Réclamer").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("daily_streak").setLabel("🔥 Mon streak").setStyle(ButtonStyle.Secondary),
  )];
}

export async function postDailyMenuIfNeeded(guild: Guild, botId: string): Promise<void> {
  const ch = guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText &&
    (c.name.toLowerCase().includes("daily") || c.name.toLowerCase().includes("quotidien") ||
     c.name.toLowerCase().includes("recompense") || c.name.toLowerCase().includes("récompense"))
  ) as TextChannel | undefined;
  if (!ch) return;

  await ensurePanel(
    ch, botId,
    "Récompense quotidienne",
    "daily_claim",
    buildDailyEmbed,
    buildDailyComponents,
    "🎁 Daily",
  );
}

export async function handleDailyClaim(btn: ButtonInteraction): Promise<void> {
  if (!btn.guild || !btn.member) { await btn.reply({ content: "❌ Erreur serveur.", ephemeral: true }); return; }

  const member = await btn.guild.members.fetch(btn.user.id).catch(() => null) as GuildMember | null;
  if (!member) { await btn.reply({ content: "❌ Profil introuvable.", ephemeral: true }); return; }

  await btn.deferReply({ ephemeral: true });

  const guildId = btn.guild.id;
  const userId  = btn.user.id;
  const now     = Date.now();
  const record  = await getDailyReward(guildId, userId);

  if (record && now - record.lastClaim < COOLDOWN) {
    const next = record.lastClaim + COOLDOWN;
    await btn.editReply({ embeds: [new EmbedBuilder()
      .setColor(0xff4444).setTitle("⏳ Déjà réclamé !")
      .setDescription(`Reviens <t:${Math.floor(next / 1000)}:R> pour ta prochaine récompense.`)
      .addFields({ name: "🔥 Streak actuel", value: `**${record.streak} jour(s)**`, inline: true })
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()] });
    return;
  }

  const isConsecutive = record && now - record.lastClaim < COOLDOWN * 2;
  const newStreak     = isConsecutive ? record.streak + 1 : 1;
  const mult          = Math.min(1 + (newStreak - 1) * 0.1, 3);
  const isCoinsDay    = Math.random() < 0.5;

  const baseCoins = Math.floor(Math.random() * 201) + 50;
  const baseXP    = Math.floor(Math.random() * 101) + 50;
  const coins     = isCoinsDay ? Math.floor(baseCoins * mult) : 0;
  const xp        = !isCoinsDay ? Math.floor(baseXP * mult) : 0;

  let newBalance = 0;
  let newXP = 0;

  if (coins > 0) newBalance = await addCoins(guildId, userId, coins);
  if (xp > 0) {
    const userData = await getXP(guildId, userId);
    newXP = userData.xp + xp;
    await upsertXP(guildId, userId, newXP, xpToLevel(newXP), userData.lastMessage);
  }

  await setDailyReward(guildId, userId, { lastClaim: now, streak: newStreak });

  const streakBonus = mult > 1 ? ` *(x${mult.toFixed(1)} streak 🔥)*` : "";

  await btn.editReply({ embeds: [new EmbedBuilder()
    .setColor(0xffd700).setTitle("🎁 Récompense réclamée !")
    .setDescription(isCoinsDay
      ? `Tu reçois **${coins} 🪙**${streakBonus} !`
      : `Tu reçois **${xp} ✨ XP**${streakBonus} !`)
    .addFields(
      { name: "🔥 Streak", value: `**${newStreak} jour(s)**`, inline: true },
      isCoinsDay
        ? { name: "💳 Solde", value: `**${newBalance} 🪙**`, inline: true }
        : { name: "✨ XP total", value: `**${newXP} XP**`, inline: true },
    )
    .setFooter({ text: "MAI•GESTION • Reviens demain pour continuer ton streak !" })
    .setTimestamp()] });
}

export async function handleDailyStreak(btn: ButtonInteraction): Promise<void> {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }
  await btn.deferReply({ ephemeral: true });

  const record = await getDailyReward(btn.guild.id, btn.user.id);
  const streak = record?.streak ?? 0;
  const last   = record?.lastClaim ?? 0;
  const next   = last + COOLDOWN;
  const now    = Date.now();
  const mult   = Math.min(1 + (streak - 1) * 0.1, 3);

  await btn.editReply({ embeds: [new EmbedBuilder()
    .setColor(0xf59e0b).setTitle("🔥 Ton streak daily")
    .addFields(
      { name: "📆 Streak",         value: `**${streak} jour(s)**`,       inline: true },
      { name: "✖️ Multiplicateur", value: `**x${mult.toFixed(1)}**`,     inline: true },
      { name: now < next ? "⏳ Prochain claim" : "✅ Disponible !",
        value: now < next ? `<t:${Math.floor(next / 1000)}:R>` : "Maintenant !",
        inline: true },
    )
    .setFooter({ text: "MAI•GESTION • Max x3 à 30 jours de streak" })
    .setTimestamp()] });
}
