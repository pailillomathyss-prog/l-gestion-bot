import {
  Guild, Client, TextChannel, ChannelType,
  EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
} from "discord.js";
import { getState, setState, getUser, saveUser } from "../db.js";

// ── Constantes ────────────────────────────────────────────────────────────────
const JACKPOT_KEY   = (guildId: string) => `jackpot:${guildId}`;
const LAST_DRAW_KEY = (guildId: string) => `jackpot_last_draw:${guildId}`;
const CONTRIB_RATE  = 0.05; // 5% des pertes
const DRAW_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 jours
export const JACKPOT_CHAN = "🎯・jackpot";

// ── Accès cagnotte ────────────────────────────────────────────────────────────
export async function getJackpot(guildId: string): Promise<number> {
  const v = await getState(JACKPOT_KEY(guildId));
  return v ? parseInt(v) : 0;
}

export async function addToJackpot(guildId: string, amount: number): Promise<number> {
  const current = await getJackpot(guildId);
  const newVal  = current + Math.floor(amount);
  await setState(JACKPOT_KEY(guildId), String(newVal));
  return newVal;
}

async function resetJackpot(guildId: string) {
  await setState(JACKPOT_KEY(guildId), "0");
}

async function getLastDraw(guildId: string): Promise<number> {
  const v = await getState(LAST_DRAW_KEY(guildId));
  return v ? parseInt(v) : 0;
}

async function setLastDraw(guildId: string) {
  await setState(LAST_DRAW_KEY(guildId), String(Date.now()));
}

// ── Salon 🎯・jackpot ─────────────────────────────────────────────────────────
export async function postJackpotPanelIfNeeded(guild: Guild, botId: string) {
  const ch = await getOrCreateJackpotChannel(guild);
  if (!ch) return;

  const recent = await ch.messages.fetch({ limit: 10 }).catch(() => null);
  if (recent?.some(m => m.author.id === botId && m.embeds[0]?.title?.includes("Jackpot"))) return;

  await refreshJackpotPanel(guild, ch);
  console.log(`🎯 Panel jackpot → #${ch.name}`);
}

export async function refreshJackpotPanel(guild: Guild, ch: TextChannel) {
  const pot    = await getJackpot(guild.id);
  const last   = await getLastDraw(guild.id);
  const nextTs = last ? last + DRAW_INTERVAL : Date.now() + DRAW_INTERVAL;

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🎯 Jackpot Communautaire — MAI•GESTION")
    .setDescription(
      "**5% de chaque perte au casino** alimente cette cagnotte.\n" +
      "Chaque semaine, un membre actif est tiré au sort et remporte tout !"
    )
    .addFields(
      { name: "💰 Cagnotte actuelle", value: `**${pot.toLocaleString("fr-FR")} 🪙**`, inline: true },
      { name: "⏳ Prochain tirage",   value: `<t:${Math.floor(nextTs / 1000)}:R>`,     inline: true },
      { name: "📋 Comment participer", value: "• Joue au casino (Flip, Slots, BJ, Gacha, Duel)\n• Chaque perte contribue à la cagnotte\n• Tout le monde est automatiquement éligible !", inline: false },
    )
    .setFooter({ text: "MAI•GESTION • Bonne chance à tous !" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("jackpot_view").setLabel("👀 Voir la cagnotte").setStyle(ButtonStyle.Primary),
  );

  const messages = await ch.messages.fetch({ limit: 10 }).catch(() => null);
  const existing = messages?.find(m => m.author.id === guild.members.me?.id && m.embeds[0]?.title?.includes("Jackpot"));

  if (existing) {
    await existing.edit({ embeds: [embed], components: [row] }).catch(() => {});
  } else {
    await ch.send({ embeds: [embed], components: [row] }).catch(() => {});
  }
}

// ── Créer / récupérer le salon ────────────────────────────────────────────────
async function getOrCreateJackpotChannel(guild: Guild): Promise<TextChannel | null> {
  const existing = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText && (c.name.includes("jackpot") || c.name.includes("🎯"))
  ) as TextChannel | undefined;
  if (existing) return existing;

  try {
    // Trouver la catégorie jeux si elle existe
    const cat = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory &&
        (c.name.toLowerCase().includes("jeux") || c.name.toLowerCase().includes("game") || c.name.includes("🎮"))
    );

    const ch = await guild.channels.create({
      name: JACKPOT_CHAN,
      type: ChannelType.GuildText,
      ...(cat ? { parent: cat.id } : {}),
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
      ],
      topic: "🎯 Cagnotte communautaire — alimentée par 5% des pertes au casino. Tirage hebdomadaire !",
    }) as TextChannel;
    console.log(`🎯 Salon jackpot créé : #${ch.name}`);
    return ch;
  } catch { return null; }
}

// ── Tirage hebdomadaire ───────────────────────────────────────────────────────
export async function checkWeeklyDraw(client: Client) {
  for (const [, guild] of client.guilds.cache) {
    const last = await getLastDraw(guild.id);
    if (last && Date.now() - last < DRAW_INTERVAL) continue;

    const pot = await getJackpot(guild.id);
    if (pot <= 0) { await setLastDraw(guild.id); continue; }

    // Récupérer les membres humains
    await guild.members.fetch().catch(() => {});
    const humans = guild.members.cache.filter(m => !m.user.bot && m.presence !== undefined || true);
    if (humans.size === 0) { await setLastDraw(guild.id); continue; }

    const winners = [...humans.values()];
    const winner  = winners[Math.floor(Math.random() * winners.length)]!;

    // Créditer le gagnant
    const data = await getUser(guild.id, winner.id);
    await saveUser(guild.id, winner.id, { ...data, coins: data.coins + pot });
    await resetJackpot(guild.id);
    await setLastDraw(guild.id);

    // Annoncer
    const ch = await getOrCreateJackpotChannel(guild);
    if (ch) {
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("🎉 JACKPOT — Tirage Hebdomadaire !")
        .setDescription(`🏆 **<@${winner.id}>** remporte la cagnotte communautaire !\n\n💰 Gain : **${pot.toLocaleString("fr-FR")} 🪙**`)
        .addFields({ name: "🔄 Nouvelle cagnotte", value: "La cagnotte repart de zéro ! Jouez au casino pour l'alimenter.", inline: false })
        .setThumbnail(winner.user.displayAvatarURL())
        .setFooter({ text: "MAI•GESTION • Félicitations !" })
        .setTimestamp();

      await ch.send({ content: `🎊 Félicitations <@${winner.id}> !`, embeds: [embed] }).catch(() => {});
      // Mettre à jour le panel
      await refreshJackpotPanel(guild, ch);
    }

    console.log(`🎯 Jackpot tiré : ${winner.user.tag} → ${pot} 🪙`);
  }
}

// ── Bouton "Voir la cagnotte" ─────────────────────────────────────────────────
export async function handleJackpotButton(btn: ButtonInteraction) {
  if (!btn.guild) return;
  const pot    = await getJackpot(btn.guild.id);
  const last   = await getLastDraw(btn.guild.id);
  const nextTs = last ? last + DRAW_INTERVAL : Date.now() + DRAW_INTERVAL;

  await btn.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🎯 Cagnotte Jackpot")
      .addFields(
        { name: "💰 Montant actuel", value: `**${pot.toLocaleString("fr-FR")} 🪙**`, inline: true },
        { name: "⏳ Prochain tirage", value: `<t:${Math.floor(nextTs / 1000)}:R>`, inline: true },
        { name: "📈 Comment ça marche", value: "5% de chaque perte au casino va dans la cagnotte.\nChaque semaine, un membre est tiré au sort et remporte tout !", inline: false },
      )
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
    ephemeral: true,
  });
}

// ── Commande /jackpot (admin : forcer le tirage) ──────────────────────────────
export async function jackpotCommand(guild: Guild, forceDraw: boolean): Promise<EmbedBuilder> {
  const pot  = await getJackpot(guild.id);
  const last = await getLastDraw(guild.id);
  const nextTs = last ? last + DRAW_INTERVAL : Date.now() + DRAW_INTERVAL;

  if (!forceDraw) {
    return new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🎯 Jackpot Communautaire")
      .addFields(
        { name: "💰 Cagnotte", value: `**${pot.toLocaleString("fr-FR")} 🪙**`, inline: true },
        { name: "⏳ Prochain tirage", value: `<t:${Math.floor(nextTs / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: "MAI•GESTION" }).setTimestamp();
  }

  // Force draw (admin)
  if (pot <= 0) {
    return new EmbedBuilder().setColor(0xff4444).setDescription("❌ La cagnotte est vide, impossible de tirer.").setTimestamp();
  }

  await guild.members.fetch().catch(() => {});
  const humans  = [...guild.members.cache.filter(m => !m.user.bot).values()];
  const winner  = humans[Math.floor(Math.random() * humans.length)]!;
  const data    = await getUser(guild.id, winner.id);
  await saveUser(guild.id, winner.id, { ...data, coins: data.coins + pot });
  await resetJackpot(guild.id);
  await setLastDraw(guild.id);

  const ch = await getOrCreateJackpotChannel(guild);
  if (ch) {
    await ch.send({
      content: `🎊 <@${winner.id}>`,
      embeds: [new EmbedBuilder()
        .setColor(0xffd700).setTitle("🎉 JACKPOT — Tirage forcé par un admin !")
        .setDescription(`🏆 **<@${winner.id}>** remporte **${pot.toLocaleString("fr-FR")} 🪙** !`)
        .setThumbnail(winner.user.displayAvatarURL())
        .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
    }).catch(() => {});
    await refreshJackpotPanel(guild, ch);
  }

  return new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle("✅ Tirage effectué !")
    .setDescription(`🏆 **<@${winner.id}>** remporte **${pot.toLocaleString("fr-FR")} 🪙** !`)
    .setFooter({ text: "MAI•GESTION" }).setTimestamp();
}
