import { Client, EmbedBuilder, TextChannel, ChannelType, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } from "discord.js";
import { logger } from "../../lib/logger";
import { createGiveaway, updateGiveawayMessage, joinGiveaway, endGiveaway, getActiveGiveaways } from "./db";

function parseDuration(str: string): number | null {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  switch (match[2].toLowerCase()) {
    case "s": return n * 1000;
    case "m": return n * 60 * 1000;
    case "h": return n * 3600 * 1000;
    case "d": return n * 86400 * 1000;
  }
  return null;
}

function buildGiveawayEmbed(prize: string, endsAt: number, participants: number, ended = false, winner?: string) {
  if (ended) {
    return new EmbedBuilder()
      .setColor(0x888888)
      .setTitle("🎉 Giveaway terminé")
      .setDescription(`**${prize}**`)
      .addFields(
        { name: "🏆 Gagnant", value: winner ? `<@${winner}>` : "*Aucun participant*", inline: true },
        { name: "👥 Participants", value: `**${participants}**`, inline: true },
      )
      .setFooter({ text: "MAI•GESTION • Giveaway terminé" })
      .setTimestamp();
  }
  return new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle("🎉 GIVEAWAY")
    .setDescription(`**${prize}**\n\nClique sur 🎉 ci-dessous pour participer !`)
    .addFields(
      { name: "⏰ Fin", value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
      { name: "👥 Participants", value: `**${participants}**`, inline: true },
    )
    .setFooter({ text: "MAI•GESTION • 1 participation par personne" })
    .setTimestamp();
}

const joinButton = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId("giveaway_join").setLabel("🎉 Participer").setStyle(ButtonStyle.Primary)
);

export async function launchGiveaway(client: Client, channelId: string, guildId: string, prize: string, duration: string): Promise<{ success: boolean; message: string }> {
  const ms = parseDuration(duration);
  if (!ms) return { success: false, message: "❌ Durée invalide. Exemples : `30m`, `2h`, `1d`" };
  if (ms < 10000) return { success: false, message: "❌ Durée minimale : 10 secondes." };

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { success: false, message: "❌ Serveur introuvable." };

  const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel) return { success: false, message: "❌ Salon introuvable." };

  const endsAt = Date.now() + ms;
  const id = await createGiveaway(guildId, channelId, prize, endsAt);

  const msg = await channel.send({
    embeds: [buildGiveawayEmbed(prize, endsAt, 0)],
    components: [joinButton()],
  });
  await updateGiveawayMessage(id, msg.id);

  scheduleGiveawayEnd(client, id, guildId, channelId, msg.id, prize, endsAt);

  logger.info(`🎉 Giveaway #${id} "${prize}" lancé pour ${duration}`);
  return { success: true, message: `🎉 Giveaway lancé dans <#${channelId}> pendant **${duration}** !` };
}

export function scheduleGiveawayEnd(client: Client, id: number, guildId: string, channelId: string, messageId: string, prize: string, endsAt: number) {
  const remaining = endsAt - Date.now();
  if (remaining <= 0) {
    finalizeGiveaway(client, id, guildId, channelId, messageId, prize);
    return;
  }
  setTimeout(() => finalizeGiveaway(client, id, guildId, channelId, messageId, prize), remaining);
}

async function finalizeGiveaway(client: Client, id: number, guildId: string, channelId: string, messageId: string, prize: string) {
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel) return;

    const giveaways = await getActiveGiveaways();
    const giveaway = giveaways.find(g => g.id === id);
    if (!giveaway || giveaway.ended) return;

    const participants = giveaway.participants;
    const winnerId = participants.length > 0 ? participants[Math.floor(Math.random() * participants.length)] : null;

    await endGiveaway(id, winnerId);

    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (msg) {
      await msg.edit({
        embeds: [buildGiveawayEmbed(prize, giveaway.endsAt, participants.length, true, winnerId ?? undefined)],
        components: [],
      });
    }

    if (winnerId) {
      const winner = await guild.members.fetch(winnerId).catch(() => null);
      if (winner) {
        await winner.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xffd700)
              .setTitle("🎉 Tu as gagné un giveaway !")
              .setDescription(`Félicitations ! Tu as remporté **${prize}** sur **${guild.name}** !`)
              .setFooter({ text: "MAI•GESTION" })
              .setTimestamp(),
          ],
        }).catch(() => {});
        await channel.send({ content: `🎉 Félicitations <@${winnerId}> ! Tu remportes **${prize}** !` }).catch(() => {});
      }
    } else {
      await channel.send({ content: `😢 Le giveaway pour **${prize}** s'est terminé sans participants.` }).catch(() => {});
    }

    logger.info(`🎉 Giveaway #${id} terminé — gagnant: ${winnerId ?? "aucun"}`);
  } catch (err) {
    logger.error({ err }, `Erreur finalisation giveaway #${id}`);
  }
}

export async function handleGiveawayButton(client: Client, guildId: string, userId: string, giveawayId: number): Promise<string> {
  const joined = await joinGiveaway(giveawayId, userId);
  return joined ? "✅ Tu participes au giveaway !" : "❌ Tu participes déjà à ce giveaway.";
}

export async function resumeGiveaways(client: Client) {
  const actives = await getActiveGiveaways();
  for (const g of actives) {
    if (!g.messageId) continue;
    scheduleGiveawayEnd(client, g.id, g.guildId, g.channelId, g.messageId, g.prize, g.endsAt);
    logger.info(`⏱️ Giveaway #${g.id} repris`);
  }
}
