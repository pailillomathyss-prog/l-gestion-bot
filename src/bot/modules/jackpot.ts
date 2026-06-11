import {
  Guild, Client, TextChannel, ChannelType, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
} from "discord.js";
import { logger } from "../../lib/logger";
import { getState, setState, getCoins, addCoins } from "./db";

const JACKPOT_KEY   = (g: string) => `jackpot:${g}`;
const LAST_DRAW_KEY = (g: string) => `jackpot_last_draw:${g}`;
const CONTRIB_RATE  = 0.05;
const DRAW_INTERVAL = 7 * 24 * 60 * 60 * 1000;
export const JACKPOT_CHAN = "🎁・jackpot";

// ── Cagnotte ───────────────────────────────────────────────────────────────────
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

// ── Salon 🎁・jackpot ──────────────────────────────────────────────────────────
async function getOrCreateJackpotChannel(guild: Guild): Promise<TextChannel | null> {
  const existing = guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText &&
    (c.name === JACKPOT_CHAN || c.name.toLowerCase().includes("jackpot"))
  ) as TextChannel | undefined;
  if (existing) return existing;

  try {
    const cat = guild.channels.cache.find(c =>
      c.type === ChannelType.GuildCategory &&
      (c.name.toLowerCase().includes("jeux") || c.name.toLowerCase().includes("game") || c.name.includes("🎮"))
    );
    const ch = await guild.channels.create({
      name: JACKPOT_CHAN,
      type: ChannelType.GuildText,
      ...(cat ? { parent: cat.id } : {}),
      permissionOverwrites: [{
        id: guild.roles.everyone,
        deny: [PermissionFlagsBits.SendMessages],
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      }],
      topic: "🎁 Cagnotte communautaire — alimentée par 5% des pertes au casino. Tirage hebdomadaire !",
    }) as TextChannel;
    logger.info(`🎁 Salon jackpot créé : #${ch.name}`);
    return ch;
  } catch { return null; }
}

export async function postJackpotPanelIfNeeded(guild: Guild, botId: string) {
  const ch = await getOrCreateJackpotChannel(guild);
  if (!ch) return;
  const recent = await ch.messages.fetch({ limit: 50 }).catch(() => null);
  if (recent?.some(m => m.author.id === botId && m.embeds[0]?.title?.includes("Jackpot"))) return;
  await refreshJackpotPanel(guild, ch);
  logger.info(`🎁 Panel jackpot → #${ch.name}`);
}

export async function refreshJackpotPanel(guild: Guild, ch: TextChannel) {
  const pot    = await getJackpot(guild.id);
  const last   = await getLastDraw(guild.id);
  const nextTs = last ? last + DRAW_INTERVAL : Date.now() + DRAW_INTERVAL;

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🎁 Jackpot Communautaire — MAI•GESTION")
    .setDescription(
      "**5% de chaque perte au casino** alimente cette cagnotte.\n" +
      "Chaque semaine, un membre actif est tiré au sort et remporte tout !"
    )
    .addFields(
      { name: "💰 Cagnotte actuelle", value: `**${pot.toLocaleString("fr-FR")} 🪙**`, inline: true },
      { name: "⏳ Prochain tirage",   value: `<t:${Math.floor(nextTs / 1000)}:R>`,    inline: true },
      { name: "📋 Comment participer",
        value: "• Joue au casino (Flip, Slots, Blackjack, Gacha, Duel)\n• Chaque perte contribue à la cagnotte\n• Tout le monde est automatiquement éligible !",
        inline: false },
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

// ── Bouton vue cagnotte ────────────────────────────────────────────────────────
export async function handleJackpotButton(btn: ButtonInteraction) {
  if (!btn.guild) return;
  const pot    = await getJackpot(btn.guild.id);
  const last   = await getLastDraw(btn.guild.id);
  const nextTs = last ? last + DRAW_INTERVAL : Date.now() + DRAW_INTERVAL;

  await btn.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🎁 Cagnotte Jackpot")
      .addFields(
        { name: "💰 Montant actuel",  value: `**${pot.toLocaleString("fr-FR")} 🪙**`, inline: true },
        { name: "⏳ Prochain tirage", value: `<t:${Math.floor(nextTs / 1000)}:R>`,    inline: true },
        { name: "📈 Comment ça marche",
          value: "5% de chaque perte au casino va dans la cagnotte.\nChaque semaine, un membre est tiré au sort et remporte tout !",
          inline: false },
      )
      .setFooter({ text: "MAI•GESTION" })
      .setTimestamp()],
    ephemeral: true,
  });
}

// ── Tirage hebdomadaire ────────────────────────────────────────────────────────
export async function checkWeeklyDraw(client: Client) {
  for (const [, guild] of client.guilds.cache) {
    const last = await getLastDraw(guild.id);
    if (last && Date.now() - last < DRAW_INTERVAL) continue;

    const pot = await getJackpot(guild.id);
    if (pot <= 0) { await setLastDraw(guild.id); continue; }

    await guild.members.fetch().catch(() => {});
    const humans = [...guild.members.cache.filter(m => !m.user.bot).values()];
    if (humans.length === 0) { await setLastDraw(guild.id); continue; }

    const winner = humans[Math.floor(Math.random() * humans.length)]!;
    await addCoins(guild.id, winner.id, pot);
    await resetJackpot(guild.id);
    await setLastDraw(guild.id);

    const ch = await getOrCreateJackpotChannel(guild);
    if (ch) {
      await ch.send({
        content: `🎊 Félicitations <@${winner.id}> !`,
        embeds: [new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle("🎉 JACKPOT — Tirage Hebdomadaire !")
          .setDescription(`🏆 **<@${winner.id}>** remporte la cagnotte communautaire !\n\n💰 Gain : **${pot.toLocaleString("fr-FR")} 🪙**`)
          .addFields({ name: "🔄 Nouvelle cagnotte", value: "La cagnotte repart de zéro ! Jouez au casino pour l'alimenter.", inline: false })
          .setThumbnail(winner.user.displayAvatarURL())
          .setFooter({ text: "MAI•GESTION • Félicitations !" })
          .setTimestamp()],
      }).catch(() => {});
      await refreshJackpotPanel(guild, ch);
    }
    logger.info(`🎁 Jackpot tiré : ${winner.user.tag} → ${pot} 🪙`);
  }
}

// ── Contribution jackpot depuis les pertes ─────────────────────────────────────
export async function contributeJackpot(guildId: string, lossAmount: number) {
  const contrib = Math.floor(lossAmount * CONTRIB_RATE);
  if (contrib <= 0) return;
  await addToJackpot(guildId, contrib);
}
