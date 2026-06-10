import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from "discord.js";
import { logger } from "../../lib/logger.js";
import { createGiveaway, updateGiveawayMessage, getActiveGiveaways, endGiveaway, addCoins } from "./db.js";

function parseDuration(str: string): number {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) throw new Error(`Durée invalide: \`${str}\`. Exemple: \`1h\`, \`30m\`, \`2d\``);
  const val = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const mult: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return val * mult[unit];
}

function buildGiveawayEmbed(prize: string, endsAt: number, participants: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle("🎉 GIVEAWAY")
    .setDescription(`**${prize}**\n\nClique sur le bouton ci-dessous pour participer !`)
    .addFields(
      { name: "⏰ Fin", value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
      { name: "👥 Participants", value: `**${participants}**`, inline: true },
    )
    .setFooter({ text: "MAI•GESTION • 1 participation par personne" })
    .setTimestamp();
}

function buildGiveawayComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("giveaway_join")
      .setLabel("🎉 Participer")
      .setStyle(ButtonStyle.Primary),
  )];
}

async function findGiveawayChannel(client: Client, guildId: string, channelId: string): Promise<TextChannel | null> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  const ch = guild.channels.cache.get(channelId);
  if (ch?.type === ChannelType.GuildText) return ch as TextChannel;
  return null;
}

async function finishGiveaway(client: Client, giveawayId: number) {
  const actives = await getActiveGiveaways();
  const giveaway = actives.find(g => g.id === giveawayId);
  if (!giveaway) return;

  const ch = await findGiveawayChannel(client, giveaway.guildId, giveaway.channelId);
  const parts = giveaway.participants;

  let winnerId: string | null = null;
  let winnerTag = "Personne";
  let winnerDisplay = "Aucun participant 😢";

  if (parts.length > 0) {
    winnerId = parts[Math.floor(Math.random() * parts.length)];
    const guild = client.guilds.cache.get(giveaway.guildId);
    const winner = guild ? await guild.members.fetch(winnerId).catch(() => null) : null;
    winnerTag = winner?.displayName ?? `<@${winnerId}>`;
    winnerDisplay = `🎊 <@${winnerId}> (**${winnerTag}**) remporte **${giveaway.prize}** !`;

    // Si c'est des coins, les donner automatiquement
    const coinMatch = giveaway.prize.match(/(\d+)\s*(?:coins?|🪙|pièces?|pieces?)/i);
    if (coinMatch) {
      const amount = parseInt(coinMatch[1]);
      await addCoins(giveaway.guildId, winnerId, amount).catch(() => {});
      winnerDisplay += `\n💰 **${amount} 🪙** ont été ajoutés à ton solde !`;
    }
  }

  await endGiveaway(giveawayId, winnerId);

  if (ch) {
    const embed = new EmbedBuilder()
      .setColor(winnerId ? 0x00cc66 : 0x888888)
      .setTitle("🎊 Giveaway Terminé !")
      .setDescription(`**${giveaway.prize}**\n\n${winnerDisplay}`)
      .addFields(
        { name: "👥 Participants", value: `**${parts.length}**`, inline: true },
        { name: "📅 Terminé", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: "MAI•GESTION" })
      .setTimestamp();

    if (giveaway.messageId) {
      const msg = await ch.messages.fetch(giveaway.messageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
      }
    }
    await ch.send({ content: winnerId ? `🎉 Félicitations <@${winnerId}> !` : "😢 Pas de gagnant.", embeds: [embed] }).catch(() => {});
  }

  logger.info(`✅ Giveaway #${giveawayId} terminé — Gagnant: ${winnerTag}`);
}

export async function launchGiveaway(
  client: Client,
  channelId: string,
  guildId: string,
  prize: string,
  durationStr: string
): Promise<{ success: boolean; message: string }> {
  try {
    const duration = parseDuration(durationStr);
    const endsAt = Date.now() + duration;

    const ch = await findGiveawayChannel(client, guildId, channelId);
    if (!ch) return { success: false, message: "Salon introuvable." };

    const id = await createGiveaway(guildId, channelId, prize, endsAt);
    const embed = buildGiveawayEmbed(prize, endsAt, 0);
    const msg = await ch.send({ embeds: [embed], components: buildGiveawayComponents() });
    await updateGiveawayMessage(id, msg.id);

    setTimeout(() => finishGiveaway(client, id).catch(() => {}), duration);

    logger.info(`🎉 Giveaway #${id} lancé: "${prize}" (durée: ${durationStr})`);
    return { success: true, message: `Giveaway lancé pour **${prize}** !` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function resumeGiveaways(client: Client) {
  const actives = await getActiveGiveaways();
  const now = Date.now();
  let resumed = 0;

  for (const g of actives) {
    if (g.endsAt <= now) {
      await finishGiveaway(client, g.id).catch(() => {});
    } else {
      const delay = g.endsAt - now;
      setTimeout(() => finishGiveaway(client, g.id).catch(() => {}), delay);
      resumed++;
    }
  }

  logger.info(`🎉 ${resumed} giveaway(s) repris`);
}
