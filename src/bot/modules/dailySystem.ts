import {
  ButtonInteraction, EmbedBuilder, Guild, TextChannel,
  ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../../lib/logger.js";
import { getDailyReward, setDailyReward, addCoins, getXP, upsertXP } from "./db.js";

const COOLDOWN = 24 * 60 * 60 * 1000;
const STREAK_MAX_MULT = 3;

function getMult(streak: number) {
  return Math.min(1 + (streak - 1) * 0.1, STREAK_MAX_MULT);
}

function buildDailyEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🎁 Récompenses Quotidiennes — MAI•GESTION")
    .setDescription(
      "Clique sur **Réclamer** chaque jour pour gagner des 🪙 ou de l'XP !\n" +
      "Plus tu reviens, plus la récompense augmente grâce au **streak** 🔥\n\n" +
      "⏰ Cooldown : **24h** entre chaque récompense\n" +
      "🔄 Tu as **48h** pour maintenir ton streak avant qu'il se remette à zéro"
    )
    .addFields(
      { name: "🪙 Coins",           value: "50–250 🪙 × multiplicateur", inline: true },
      { name: "⭐ XP",              value: "50–150 XP × multiplicateur", inline: true },
      { name: "📈 Multiplicateur",  value: "×1.0 → ×3.0 max (30 jours)", inline: true },
      { name: "🏅 Paliers de streak",
        value: "7 jours → **×1.6** | 14 jours → **×2.3** | 30 jours → **×3.0** (max)", inline: false },
    )
    .setFooter({ text: "MAI•GESTION • Reviens chaque jour !" })
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
  // 1. Chercher un salon existant
  let dailyCh = guild.channels.cache.find(
    ch => ch.type === ChannelType.GuildText &&
      (ch.name.toLowerCase().includes("daily") ||
       ch.name.toLowerCase().includes("quotidien") ||
       ch.name.toLowerCase().includes("reward") ||
       ch.name.includes("🎁"))
  ) as TextChannel | undefined;

  // 2. Créer le salon s'il n'existe pas
  if (!dailyCh) {
    try {
      dailyCh = await guild.channels.create({
        name: "🎁・daily",
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny:  [PermissionFlagsBits.SendMessages],
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
          },
        ],
        topic: "🎁 Réclame ta récompense quotidienne ici ! Reviens chaque jour pour ton streak 🔥",
      }) as TextChannel;
      logger.info(`🎁 Salon daily créé : #${dailyCh.name}`);
    } catch (err) {
      logger.warn({ err }, "Impossible de créer le salon daily");
      return;
    }
  }

  // 3. Vérifier si le panel existe déjà (fetch 50 messages pour ne pas rater l'ancien)
  const recent = await dailyCh.messages.fetch({ limit: 50 }).catch(() => null);
  const hasPanel = recent?.some(
    m => m.author.id === botId &&
         m.embeds.length > 0 &&
         (m.embeds[0]?.title?.includes("Quotidiennes") || m.embeds[0]?.title?.includes("Quotidienne"))
  );
  if (hasPanel) return;

  await dailyCh.send({ embeds: [buildDailyEmbed()], components: buildDailyComponents() }).catch(() => {});
  logger.info(`🎁 Panel daily posté dans #${dailyCh.name}`);
}

export async function handleDailyClaim(btn: ButtonInteraction) {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }

  const guildId = btn.guild.id;
  const userId  = btn.user.id;
  const now     = Date.now();

  const record = await getDailyReward(guildId, userId);

  // Cooldown actif
  if (record && now - record.lastClaim < COOLDOWN) {
    const next = record.lastClaim + COOLDOWN;
    const mult = getMult(record.streak);
    await btn.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle("⏳ Déjà réclamé !")
        .setDescription(`Prochain dans <t:${Math.floor(next / 1000)}:R>`)
        .addFields(
          { name: "🔥 Streak",         value: `**${record.streak} jour(s)**`, inline: true },
          { name: "📈 Multiplicateur", value: `**×${mult.toFixed(1)}**`,       inline: true },
        )
        .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
      ephemeral: true,
    });
    return;
  }

  // Calcul streak
  const isConsecutive = record && now - record.lastClaim < COOLDOWN * 2;
  const newStreak     = isConsecutive ? record.streak + 1 : 1;
  const mult          = getMult(newStreak);

  // Récompense aléatoire
  const isCoinsDay = Math.random() < 0.5;
  const baseCoins  = Math.floor(Math.random() * 201) + 50;
  const baseXP     = Math.floor(Math.random() * 101) + 50;
  const coins      = isCoinsDay ? Math.floor(baseCoins * mult) : 0;
  const xp         = !isCoinsDay ? Math.floor(baseXP * mult) : 0;

  if (coins > 0) await addCoins(guildId, userId, coins);
  if (xp > 0) {
    const data    = await getXP(guildId, userId);
    const newXP   = data.xp + xp;
    const { xpToLevel } = await import("./expSystem.js");
    await upsertXP(guildId, userId, newXP, xpToLevel(newXP), data.lastMessage);
  }

  await setDailyReward(guildId, userId, { lastClaim: now, streak: newStreak });

  // Milestones
  let milestone = "";
  if (newStreak === 7)  milestone = "\n\n🎉 **1 semaine de streak !**";
  if (newStreak === 14) milestone = "\n\n🔥 **2 semaines consécutives !**";
  if (newStreak === 30) milestone = "\n\n👑 **30 jours — Multiplicateur MAXIMUM ×3 !**";

  const embed = new EmbedBuilder()
    .setColor(isCoinsDay ? 0xffd700 : 0x9b59b6)
    .setTitle("🎁 Récompense réclamée !")
    .setDescription(
      `${isCoinsDay ? `🪙 **+${coins} pièces**` : `⭐ **+${xp} XP**`}${milestone}`
    )
    .addFields(
      { name: "🔥 Streak",         value: `**${newStreak} jour(s)**`, inline: true },
      { name: "📈 Multiplicateur", value: `**×${mult.toFixed(1)}**`,  inline: true },
      { name: "⏳ Prochain",
        value: `<t:${Math.floor((now + COOLDOWN) / 1000)}:R>`,        inline: true },
    )
    .setFooter({ text: "MAI•GESTION • Reviens demain !" })
    .setTimestamp();

  await btn.reply({ embeds: [embed], ephemeral: true });
}

export async function handleDailyStreak(btn: ButtonInteraction) {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }

  const record = await getDailyReward(btn.guild.id, btn.user.id);
  const streak = record?.streak ?? 0;
  const last   = record?.lastClaim ?? 0;
  const mult   = getMult(streak);
  const now    = Date.now();
  const canClaim = !last || now - last >= COOLDOWN;

  const next = [7, 14, 30].find(n => n > streak);

  await btn.reply({
    embeds: [new EmbedBuilder()
      .setColor(streak >= 30 ? 0xffd700 : streak >= 7 ? 0xff9900 : 0x9b59b6)
      .setTitle("🔥 Ton Streak Daily")
      .setDescription(
        canClaim
          ? "✅ **Tu peux réclamer ta récompense !**"
          : `⏳ Prochain dans <t:${Math.floor((last + COOLDOWN) / 1000)}:R>`
      )
      .addFields(
        { name: "📅 Streak",         value: `**${streak} jour(s)**`, inline: true },
        { name: "📈 Multiplicateur", value: `**×${mult.toFixed(1)}**`, inline: true },
        { name: "🕐 Dernier claim",  value: last ? `<t:${Math.floor(last / 1000)}:R>` : "Jamais", inline: true },
        ...(next ? [{ name: "🎯 Prochain palier", value: `**${next} jours** → ×${getMult(next).toFixed(1)}`, inline: false }] : []),
      )
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
    ephemeral: true,
  });
}
