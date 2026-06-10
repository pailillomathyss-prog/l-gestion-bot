import { ButtonInteraction, EmbedBuilder, Guild, TextChannel, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildMember } from "discord.js";
import { logger } from "../../lib/logger.js";
import { getDailyReward, setDailyReward, addCoins, getXP, upsertXP } from "./db.js";

const COOLDOWN = 24 * 60 * 60 * 1000;

function buildDailyEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🎁 Récompense Quotidienne")
    .setDescription(
      "Reviens chaque jour pour gagner des pièces ou de l'XP !\n\n" +
      "🔥 **Streak** : Plus tu reviens chaque jour, plus la récompense augmente !\n" +
      "📈 Multiplicateur max : **x3** (30 jours consécutifs)"
    )
    .addFields(
      { name: "🪙 Récompense coins", value: "50–250 🪙 × multiplicateur", inline: true },
      { name: "⭐ Récompense XP", value: "50–150 XP × multiplicateur", inline: true },
    )
    .setFooter({ text: "MAI•GESTION • Cooldown: 24h" })
    .setTimestamp();
}

function buildDailyComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("daily_claim")
      .setLabel("🎁 Réclamer ma récompense")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("daily_streak")
      .setLabel("🔥 Mon streak")
      .setStyle(ButtonStyle.Secondary),
  )];
}

export async function postDailyMenuIfNeeded(guild: Guild, botId: string) {
  const dailyCh = guild.channels.cache.find(
    ch => ch.type === ChannelType.GuildText &&
      (ch.name.toLowerCase().includes("daily") || ch.name.toLowerCase().includes("quotidien") ||
       ch.name.toLowerCase().includes("reward") || ch.name.includes("🎁"))
  ) as TextChannel | undefined;

  if (!dailyCh) return;

  const recent = await dailyCh.messages.fetch({ limit: 10 }).catch(() => null);
  if (recent?.some(m => m.author.id === botId && m.embeds[0]?.title?.includes("Quotidienne"))) return;

  await dailyCh.send({ embeds: [buildDailyEmbed()], components: buildDailyComponents() }).catch(() => {});
}

export async function handleDailyClaim(btn: ButtonInteraction) {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }

  const guildId = btn.guild.id;
  const userId = btn.user.id;
  const now = Date.now();

  const record = await getDailyReward(guildId, userId);

  if (record && now - record.lastClaim < COOLDOWN) {
    const next = record.lastClaim + COOLDOWN;
    await btn.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff9900)
          .setTitle("⏳ Déjà réclamé !")
          .setDescription(`Prochain dans <t:${Math.floor(next / 1000)}:R>\n🔥 Streak actuel: **${record.streak} jour(s)**`)
          .setFooter({ text: "MAI•GESTION" }).setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  const isConsecutive = record && now - record.lastClaim < COOLDOWN * 2;
  const newStreak = isConsecutive ? record.streak + 1 : 1;
  const mult = Math.min(1 + (newStreak - 1) * 0.1, 3);

  const isCoinsDay = Math.random() < 0.5;
  const baseCoins = Math.floor(Math.random() * 201) + 50;
  const baseXP = Math.floor(Math.random() * 101) + 50;
  const coins = isCoinsDay ? Math.floor(baseCoins * mult) : 0;
  const xp = !isCoinsDay ? Math.floor(baseXP * mult) : 0;

  if (coins > 0) await addCoins(guildId, userId, coins);
  if (xp > 0) {
    const data = await getXP(guildId, userId);
    const newXP = data.xp + xp;
    const { xpToLevel } = await import("./expSystem.js");
    await upsertXP(guildId, userId, newXP, xpToLevel(newXP), data.lastMessage);
  }

  await setDailyReward(guildId, userId, { lastClaim: now, streak: newStreak });

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🎁 Récompense réclamée !")
    .addFields(
      { name: isCoinsDay ? "🪙 Pièces gagnées" : "⭐ XP gagnée", value: `**+${isCoinsDay ? coins : xp}** ${isCoinsDay ? "🪙" : "XP"}`, inline: true },
      { name: "🔥 Streak", value: `**${newStreak} jour(s)** (×${mult.toFixed(1)})`, inline: true },
    )
    .setDescription(newStreak >= 7 ? "🔥 Incroyable — **1 semaine** de streak !" : newStreak >= 30 ? "🌟 **30 jours** — Multiplicateur maximum !" : "Reviens demain pour continuer !")
    .setFooter({ text: "MAI•GESTION" }).setTimestamp();

  await btn.reply({ embeds: [embed], ephemeral: true });
}

export async function handleDailyStreak(btn: ButtonInteraction) {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }

  const record = await getDailyReward(btn.guild.id, btn.user.id);
  const streak = record?.streak ?? 0;
  const last = record?.lastClaim ?? 0;
  const mult = Math.min(1 + (streak - 1) * 0.1, 3);

  await btn.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle("🔥 Ton streak")
        .addFields(
          { name: "📅 Streak", value: `**${streak} jour(s)**`, inline: true },
          { name: "📈 Multiplicateur", value: `**×${mult.toFixed(1)}**`, inline: true },
          { name: "🕐 Dernier claim", value: last ? `<t:${Math.floor(last / 1000)}:R>` : "Jamais", inline: true },
        )
        .setFooter({ text: "MAI•GESTION" }).setTimestamp(),
    ],
    ephemeral: true,
  });
}
