import {
  Client, EmbedBuilder, TextChannel, ChannelType,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType,
} from "discord.js";
import { logger } from "../../lib/logger";
import { createGiveaway, updateGiveawayMessage, joinGiveaway, endGiveaway, getActiveGiveaways, addCoins } from "./db";

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
      .setColor(0x888888).setTitle("🎉 Giveaway terminé").setDescription(`**${prize}**`)
      .addFields(
        { name: "🏆 Gagnant",      value: winner ? `<@${winner}>` : "*Aucun participant*", inline: true },
        { name: "👥 Participants", value: `**${participants}**`,                            inline: true },
      )
      .setFooter({ text: "MAI•GESTION • Giveaway terminé" }).setTimestamp();
  }
  return new EmbedBuilder()
    .setColor(0xff69b4).setTitle("🎉 GIVEAWAY").setDescription(`**${prize}**\n\nClique sur 🎉 ci-dessous pour participer !`)
    .addFields(
      { name: "⏰ Fin",            value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
      { name: "👥 Participants",   value: `**${participants}**`,                 inline: true },
    )
    .setFooter({ text: "MAI•GESTION • Clique pour participer !" }).setTimestamp();
}

function buildGiveawayRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("giveaway_join").setLabel("🎉 Participer").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("giveaway_count").setLabel("👥 Participants").setStyle(ButtonStyle.Secondary),
  );
}

export async function launchGiveaway(
  guildId: string, channelId: string, prize: string, durationStr: string,
  client: Client
) {
  const duration = parseDuration(durationStr);
  if (!duration) return "❌ Durée invalide. Exemples : `30s`, `5m`, `2h`, `1d`";

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return "❌ Serveur introuvable.";

  const ch = guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!ch) return "❌ Salon introuvable.";

  const endsAt = Date.now() + duration;
  const id     = `${guildId}_${Date.now()}`;

  await createGiveaway({ id, guildId, channelId, messageId: null, prize, endsAt, participants: [], ended: false, winner: null });

  const msg = await ch.send({
    embeds: [buildGiveawayEmbed(prize, endsAt, 0)],
    components: [buildGiveawayRow()],
  });

  await updateGiveawayMessage(id, msg.id);

  // Collecteur de boutons
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: duration });

  collector.on("collect", async btn => {
    if (btn.customId === "giveaway_join") {
      const parts = await joinGiveaway(id, btn.user.id);
      await btn.reply({ content: `✅ Tu participes ! (**${parts.length}** participants)`, ephemeral: true });
      await msg.edit({ embeds: [buildGiveawayEmbed(prize, endsAt, parts.length)] }).catch(() => {});
    } else if (btn.customId === "giveaway_count") {
      const gw = (await getActiveGiveaways()).find(g => g.id === id);
      await btn.reply({ content: `👥 **${gw?.participants.length ?? 0}** participant(s)`, ephemeral: true });
    }
  });

  collector.on("end", async () => {
    const gw = (await getActiveGiveaways()).find(g => g.id === id);
    const participants = gw?.participants ?? [];
    const winner = participants.length > 0 ? participants[Math.floor(Math.random() * participants.length)]! : null;

    await endGiveaway(id, winner);

    // Si pièces → créditer
    const coinMatch = prize.match(/^(\d+)\s*🪙$/);
    if (coinMatch && winner) {
      await addCoins(guildId, winner, parseInt(coinMatch[1]));
    }

    await msg.edit({
      embeds: [buildGiveawayEmbed(prize, endsAt, participants.length, true, winner ?? undefined)],
      components: [],
    }).catch(() => {});

    if (winner) {
      await ch.send(`🎉 Félicitations <@${winner}> ! Tu remportes **${prize}** !`).catch(() => {});
    } else {
      await ch.send("😢 Aucun participant pour ce giveaway.").catch(() => {});
    }
  });

  return null;
}

export async function restoreGiveaways(client: Client) {
  const actives = await getActiveGiveaways();
  for (const gw of actives) {
    const remaining = gw.endsAt - Date.now();
    if (remaining <= 0) {
      await endGiveaway(gw.id, null);
      continue;
    }
    const guild = client.guilds.cache.get(gw.guildId);
    if (!guild) continue;
    const ch = guild.channels.cache.get(gw.channelId) as TextChannel | undefined;
    if (!ch || !gw.messageId) continue;

    setTimeout(async () => {
      const participants = gw.participants;
      const winner = participants.length > 0 ? participants[Math.floor(Math.random() * participants.length)]! : null;
      await endGiveaway(gw.id, winner);
      if (winner) await addCoins(gw.guildId, winner, 0).catch(() => {});
      const msg = await ch.messages.fetch(gw.messageId!).catch(() => null);
      if (msg) {
        await msg.edit({
          embeds: [buildGiveawayEmbed(gw.prize, gw.endsAt, participants.length, true, winner ?? undefined)],
          components: [],
        }).catch(() => {});
        if (winner) await ch.send(`🎉 Félicitations <@${winner}> ! Tu remportes **${gw.prize}** !`).catch(() => {});
      }
    }, remaining);
  }
  logger.info(`🎉 ${actives.length} giveaway(s) restauré(s)`);
}
