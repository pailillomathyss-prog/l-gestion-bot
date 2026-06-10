import { Client, Guild, TextChannel, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../../lib/logger";
import { getState, setState, addCoins } from "./db";

const LOTO_INTERVAL    = 14 * 24 * 60 * 60 * 1000; // 14 jours
const LOTO_PRIZE       = 5_000;
const LOTO_RESUME_KEY  = (g: string) => `loto_ends:${g}`;
const LOTO_MSG_KEY     = (g: string) => `loto_msg:${g}`;
const LOTO_PARTS_KEY   = (g: string) => `loto_parts:${g}`;
const LOTO_DONE_KEY    = (g: string) => `loto_done:${g}`;

const participants = new Map<string, Set<string>>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function findGiveawayChannel(guild: Guild): TextChannel | null {
  return (guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      (c.name.toLowerCase().includes("giveaway") ||
        c.name.toLowerCase().includes("give") ||
        c.name.includes("⚡"))
  ) as TextChannel) ?? null;
}

function buildLotoEmbed(endsAt: number, count: number, ended = false, winnerId?: string | null): EmbedBuilder {
  if (ended) {
    return new EmbedBuilder()
      .setColor(0x888888)
      .setTitle("🎰 Loto bi-hebdomadaire — Terminé !")
      .setDescription(`**${LOTO_PRIZE.toLocaleString("fr-FR")} 🪙** ont été attribués !`)
      .addFields(
        { name: "🏆 Gagnant",     value: winnerId ? `<@${winnerId}>` : "*Aucun participant*", inline: true },
        { name: "👥 Participants", value: `**${count}**`,                                      inline: true },
      )
      .setFooter({ text: "MAI•GESTION • Prochain loto dans 2 semaines !" })
      .setTimestamp();
  }
  return new EmbedBuilder()
    .setColor(0xe84393)
    .setTitle("🎰 Loto bi-hebdomadaire !")
    .setDescription(`**${LOTO_PRIZE.toLocaleString("fr-FR")} 🪙** à gagner !\nParticipe gratuitement — 1 ticket par personne !`)
    .addFields(
      { name: "⏰ Tirage",        value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
      { name: "👥 Participants",  value: `**${count}**`,                        inline: true },
      { name: "🪙 Prix",          value: `**${LOTO_PRIZE.toLocaleString("fr-FR")} pièces**`, inline: true },
    )
    .setFooter({ text: "MAI•GESTION • Bonne chance !" })
    .setTimestamp();
}

function lotoRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("loto_join").setLabel("🎰 Participer").setStyle(ButtonStyle.Primary)
  );
}

// ── Join loto ─────────────────────────────────────────────────────────────────

export async function joinLoto(guildId: string, userId: string): Promise<boolean> {
  if (!participants.has(guildId)) participants.set(guildId, new Set());
  const set = participants.get(guildId)!;
  if (set.has(userId)) return false;
  set.add(userId);
  await setState(LOTO_PARTS_KEY(guildId), JSON.stringify([...set])).catch(() => {});
  return true;
}

export function getLotoParticipantCount(guildId: string): number {
  return participants.get(guildId)?.size ?? 0;
}

// ── Update loto message ───────────────────────────────────────────────────────

export async function updateLotoMessage(guildId: string, client: Client): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const endsAtStr = await getState(LOTO_RESUME_KEY(guildId)).catch(() => null);
  const msgId     = await getState(LOTO_MSG_KEY(guildId)).catch(() => null);
  if (!endsAtStr || !msgId) return;
  const endsAt = Number(endsAtStr);
  if (Date.now() > endsAt) return;
  const ch = findGiveawayChannel(guild);
  if (!ch) return;
  const msg = await ch.messages.fetch(msgId).catch(() => null);
  if (!msg) return;
  const count = getLotoParticipantCount(guildId);
  await msg.edit({ embeds: [buildLotoEmbed(endsAt, count)], components: [lotoRow()] }).catch(() => {});
}

// ── Start loto ────────────────────────────────────────────────────────────────

async function startLotoForGuild(client: Client, guild: Guild): Promise<void> {
  const now    = Date.now();
  const endsAt = now + LOTO_INTERVAL;

  participants.set(guild.id, new Set());
  await setState(LOTO_RESUME_KEY(guild.id), String(endsAt));
  await setState(LOTO_PARTS_KEY(guild.id), "[]");
  await setState(LOTO_DONE_KEY(guild.id), "0");

  const ch = findGiveawayChannel(guild);
  if (!ch) { logger.warn(`Salon giveaway introuvable sur ${guild.name} (loto)`); return; }

  const msg = await ch.send({ embeds: [buildLotoEmbed(endsAt, 0)], components: [lotoRow()] });
  await setState(LOTO_MSG_KEY(guild.id), msg.id);
  logger.info(`🎰 Loto lancé sur ${guild.name} (fin <t:${Math.floor(endsAt / 1000)}>)`);

  scheduleFinalize(client, guild, endsAt);
}

// ── Finalize loto ─────────────────────────────────────────────────────────────

async function finalizeLotoForGuild(client: Client, guild: Guild): Promise<void> {
  const done = await getState(LOTO_DONE_KEY(guild.id)).catch(() => null);
  if (done === "1") return;

  const partsStr   = await getState(LOTO_PARTS_KEY(guild.id)).catch(() => null);
  const parts: string[] = partsStr ? JSON.parse(partsStr) : [...(participants.get(guild.id) ?? [])];
  const endsAtStr  = await getState(LOTO_RESUME_KEY(guild.id)).catch(() => null);
  const endsAt     = endsAtStr ? Number(endsAtStr) : Date.now();
  const msgId      = await getState(LOTO_MSG_KEY(guild.id)).catch(() => null);

  const winnerId = parts.length > 0
    ? parts[Math.floor(Math.random() * parts.length)]
    : null;

  await setState(LOTO_DONE_KEY(guild.id), "1");

  const ch = findGiveawayChannel(guild);

  if (ch && msgId) {
    const msg = await ch.messages.fetch(msgId).catch(() => null);
    if (msg) {
      await msg.edit({
        embeds: [buildLotoEmbed(endsAt, parts.length, true, winnerId)],
        components: [],
      }).catch(() => {});
    }
  }

  if (winnerId) {
    await addCoins(guild.id, winnerId, LOTO_PRIZE).catch(() => {});
    const winner = await guild.members.fetch(winnerId).catch(() => null);
    if (ch) {
      await ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle("🎰 Résultat du loto !")
            .setDescription(`🏆 Félicitations <@${winnerId}> !\nTu remportes **${LOTO_PRIZE.toLocaleString("fr-FR")} 🪙** !\n\nProchain loto dans 2 semaines 😉`)
            .setThumbnail(winner?.user.displayAvatarURL() ?? null)
            .setFooter({ text: "MAI•GESTION" })
            .setTimestamp(),
        ],
      }).catch(() => {});
    }
    logger.info(`🎰 Loto terminé sur ${guild.name} — gagnant: ${winnerId} (+${LOTO_PRIZE} 🪙)`);
  } else {
    if (ch) await ch.send({ content: `😢 Le loto s'est terminé sans participants. Prochain loto dans 2 semaines !` }).catch(() => {});
  }

  participants.set(guild.id, new Set());

  // Prochain loto dans LOTO_INTERVAL
  setTimeout(() => startLotoForGuild(client, guild).catch(() => {}), LOTO_INTERVAL);
}

function scheduleFinalize(client: Client, guild: Guild, endsAt: number): void {
  const remaining = Math.max(0, endsAt - Date.now());
  setTimeout(() => finalizeLotoForGuild(client, guild).catch(() => {}), remaining);
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initLoto(client: Client): Promise<void> {
  for (const [, guild] of client.guilds.cache) {
    try {
      const endsAtStr = await getState(LOTO_RESUME_KEY(guild.id));
      if (endsAtStr) {
        const endsAt = Number(endsAtStr);
        const done   = await getState(LOTO_DONE_KEY(guild.id)).catch(() => null);

        if (done !== "1" && Date.now() < endsAt) {
          // Loto actif — restaurer participants et replanifier
          const partsStr = await getState(LOTO_PARTS_KEY(guild.id)).catch(() => null);
          if (partsStr) participants.set(guild.id, new Set(JSON.parse(partsStr)));
          const remaining = endsAt - Date.now();
          logger.info(`🎰 Loto actif sur ${guild.name}, fin dans ${Math.round(remaining / 60_000)} min`);
          scheduleFinalize(client, guild, endsAt);
          continue;
        }
      }
      // Démarrer un nouveau loto
      await startLotoForGuild(client, guild);
    } catch (err) {
      logger.error({ err }, `Erreur init loto sur ${guild.name}`);
    }
  }
  logger.info("🎰 Loto system actif (bi-hebdomadaire, 5 000 🪙)");
}
