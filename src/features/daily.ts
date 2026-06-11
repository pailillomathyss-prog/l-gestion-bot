import {
  Guild, TextChannel, ChannelType,
  EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
} from "discord.js";
import { getState, setState, getUser, saveUser } from "../db.js";

// ── Constantes ────────────────────────────────────────────────────────────────
const COOLDOWN   = 24 * 60 * 60 * 1000;   // 24h
const STREAK_MAX = 30;
const MULT_MAX   = 3;

const dailyKey  = (g: string, u: string) => `daily2:${g}:${u}`;

interface DailyRecord { lastClaim: number; streak: number; }

async function getDailyRecord(guildId: string, userId: string): Promise<DailyRecord | null> {
  const v = await getState(dailyKey(guildId, userId));
  if (!v) return null;
  try { return JSON.parse(v) as DailyRecord; } catch { return null; }
}

async function setDailyRecord(guildId: string, userId: string, r: DailyRecord) {
  await setState(dailyKey(guildId, userId), JSON.stringify(r));
}

function getMult(streak: number) {
  return Math.min(1 + (streak - 1) * 0.1, MULT_MAX);
}

// ── Créer / récupérer le salon daily ─────────────────────────────────────────
async function getOrCreateDailyChannel(guild: Guild): Promise<TextChannel | null> {
  const existing = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText &&
      (c.name.includes("daily") || c.name.includes("quotidien") || c.name.includes("🎁"))
  ) as TextChannel | undefined;
  if (existing) return existing;

  try {
    const ch = await guild.channels.create({
      name: "🎁・daily",
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny:  [PermissionFlagsBits.SendMessages],
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        },
      ],
      topic: "🎁 Réclame ta récompense quotidienne ici ! Reviens chaque jour pour augmenter ton streak.",
    }) as TextChannel;
    console.log(`🎁 Salon daily créé : #${ch.name}`);
    return ch;
  } catch { return null; }
}

// ── Panel daily ───────────────────────────────────────────────────────────────
function buildDailyPanelEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🎁 Récompenses Quotidiennes — MAI•GESTION")
    .setDescription(
      "Clique sur **Réclamer** chaque jour pour gagner des 🪙 ou de l'XP !\n" +
      "Plus tu reviens, plus la récompense augmente grâce au **streak** 🔥"
    )
    .addFields(
      { name: "🪙 Coins", value: "50–300 🪙 × multiplicateur", inline: true },
      { name: "⭐ XP",    value: "50–150 XP × multiplicateur", inline: true },
      { name: "📈 Multiplicateur", value: "×1.0 → ×3.0 au bout de **30 jours**", inline: true },
      { name: "🔥 Comment fonctionne le streak ?",
        value: "• Reviens dans les **48h** → streak continue\n• Dépasse les 48h → streak remis à zéro\n• Cooldown : **24h** entre chaque récompense", inline: false },
      { name: "🏅 Paliers de streak",
        value: "7 jours → ×1.6 | 14 jours → ×2.3 | 30 jours → ×3.0 (maximum)", inline: false },
    )
    .setFooter({ text: "MAI•GESTION • Une seule récompense par jour !" })
    .setTimestamp();
}

function buildDailyButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("daily_claim").setLabel("🎁 Réclamer ma récompense").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("daily_streak").setLabel("🔥 Mon streak").setStyle(ButtonStyle.Secondary),
  );
}

export async function postDailyPanelIfNeeded(guild: Guild, botId: string) {
  const ch = await getOrCreateDailyChannel(guild);
  if (!ch) return;

  const recent = await ch.messages.fetch({ limit: 15 }).catch(() => null);
  if (recent?.some(m => m.author.id === botId && m.embeds[0]?.title?.includes("Quotidiennes"))) return;

  await ch.send({ embeds: [buildDailyPanelEmbed()], components: [buildDailyButtons()] }).catch(() => {});
  console.log(`🎁 Panel daily → #${ch.name}`);
}

// ── Bouton : Réclamer ─────────────────────────────────────────────────────────
export async function handleDailyClaim(btn: ButtonInteraction) {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur serveur.", ephemeral: true }); return; }

  const now    = Date.now();
  const record = await getDailyRecord(btn.guild.id, btn.user.id);

  // Cooldown check
  if (record && now - record.lastClaim < COOLDOWN) {
    const next = record.lastClaim + COOLDOWN;
    await btn.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle("⏳ Déjà réclamé !")
        .setDescription(`Prochain dans <t:${Math.floor(next / 1000)}:R>`)
        .addFields(
          { name: "🔥 Streak", value: `**${record.streak} jour(s)**`, inline: true },
          { name: "📈 Multiplicateur", value: `**×${getMult(record.streak).toFixed(1)}**`, inline: true },
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

  // Récompense aléatoire : coins ou XP
  const isCoins   = Math.random() < 0.5;
  const baseCoins = Math.floor(Math.random() * 251) + 50;
  const baseXP    = Math.floor(Math.random() * 101) + 50;
  const coins     = isCoins ? Math.floor(baseCoins * mult) : 0;
  const xp        = !isCoins ? Math.floor(baseXP * mult) : 0;

  // Appliquer
  const data      = await getUser(btn.guild.id, btn.user.id);
  const newCoins  = data.coins + coins;
  const newXP     = data.xp + xp;
  const newLevel  = Math.floor(Math.sqrt(newXP / 100));
  await saveUser(btn.guild.id, btn.user.id, { ...data, coins: newCoins, xp: newXP, level: Math.max(data.level, newLevel) });
  await setDailyRecord(btn.guild.id, btn.user.id, { lastClaim: now, streak: newStreak });

  // Message de milestone
  let milestone = "";
  if (newStreak === 7)  milestone = "\n\n🎉 **1 semaine de streak !** Continue comme ça !";
  if (newStreak === 14) milestone = "\n\n🔥 **2 semaines consécutives !** Tu es une machine !";
  if (newStreak === 30) milestone = "\n\n👑 **30 jours — Multiplicateur MAXIMUM ×3 !**";

  await btn.reply({
    embeds: [new EmbedBuilder()
      .setColor(isCoins ? 0xffd700 : 0x9b59b6)
      .setTitle("🎁 Récompense réclamée !")
      .setDescription(
        `${isCoins ? `💰 **+${coins} 🪙**` : `⭐ **+${xp} XP**`}\n\n` +
        `Solde : **${newCoins.toLocaleString("fr-FR")} 🪙** · XP : **${newXP.toLocaleString("fr-FR")}**` +
        milestone
      )
      .addFields(
        { name: "🔥 Streak",         value: `**${newStreak} jour(s)**`,          inline: true },
        { name: "📈 Multiplicateur", value: `**×${mult.toFixed(1)}**`,            inline: true },
        { name: "⏳ Prochain",       value: `<t:${Math.floor((now + COOLDOWN) / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: "MAI•GESTION • Reviens demain pour continuer !" })
      .setTimestamp()],
    ephemeral: true,
  });
}

// ── Bouton : Mon streak ───────────────────────────────────────────────────────
export async function handleDailyStreak(btn: ButtonInteraction) {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }

  const record = await getDailyRecord(btn.guild.id, btn.user.id);
  const streak = record?.streak ?? 0;
  const last   = record?.lastClaim ?? 0;
  const mult   = getMult(streak);
  const now    = Date.now();
  const canClaim = !last || now - last >= COOLDOWN;

  const nextLevel = streak < STREAK_MAX
    ? [7, 14, 30].find(n => n > streak) ?? null
    : null;

  await btn.reply({
    embeds: [new EmbedBuilder()
      .setColor(streak >= 30 ? 0xffd700 : streak >= 7 ? 0xff9900 : 0x9b59b6)
      .setTitle("🔥 Ton Streak Daily")
      .setDescription(canClaim ? "✅ **Tu peux réclamer ta récompense !**" : `⏳ Prochain dans <t:${Math.floor((last + COOLDOWN) / 1000)}:R>`)
      .addFields(
        { name: "📅 Streak actuel",  value: `**${streak} jour(s)**`,       inline: true },
        { name: "📈 Multiplicateur", value: `**×${mult.toFixed(1)}**`,      inline: true },
        { name: "🕐 Dernier claim",  value: last ? `<t:${Math.floor(last / 1000)}:R>` : "Jamais", inline: true },
        ...(nextLevel ? [{ name: "🎯 Prochain palier", value: `**${nextLevel} jours** → ×${getMult(nextLevel).toFixed(1)}`, inline: false }] : []),
      )
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
    ephemeral: true,
  });
}
