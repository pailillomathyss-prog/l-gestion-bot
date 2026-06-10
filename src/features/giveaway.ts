import {
  Client, Guild, TextChannel, ChannelType, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
} from "discord.js";
import { createGiveaway, updateGiveawayMsg, joinGiveaway, endGiveaway, getActiveGiveaways, getUser, saveUser } from "../db.js";

const JOIN_BTN = "giveaway_join";
export { JOIN_BTN as GIVEAWAY_JOIN_BTN };

function parseMs(str: string): number {
  const m = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!m) throw new Error(`Durée invalide: \`${str}\`. Format: 30m, 2h, 1d`);
  const n = parseInt(m[1]!), u = m[2]!.toLowerCase();
  const map: Record<string, number> = { s:1000, m:60000, h:3600000, d:86400000 };
  return n * map[u]!;
}

function buildGiveawayEmbed(prize: string, endsAt: number, participants: number) {
  return new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle("🎉 GIVEAWAY")
    .setDescription(`**${prize}**\n\nClique sur le bouton pour participer !`)
    .addFields(
      { name: "⏰ Fin", value: `<t:${Math.floor(endsAt/1000)}:R>`, inline: true },
      { name: "👥 Participants", value: `**${participants}**`, inline: true },
    )
    .setFooter({ text: "MAI•GESTION • 1 participation par membre" }).setTimestamp();
}

async function finishGiveaway(client: Client, gId: number) {
  const actives = await getActiveGiveaways();
  const g = actives.find(x => x.id === gId);
  if (!g) return;
  const guild = client.guilds.cache.get(g.guildId);
  const ch = guild?.channels.cache.get(g.channelId) as TextChannel | undefined;
  const parts = g.participants;
  let winnerId: string | null = null;
  let announcement = "😢 Personne n'a participé !";

  if (parts.length > 0) {
    winnerId = parts[Math.floor(Math.random() * parts.length)]!;
    announcement = `🎊 <@${winnerId}> remporte **${g.prize}** !`;
    // Auto-give coins if prize contains a number + coins
    const coinMatch = g.prize.match(/(\d+)\s*(?:coins?|🪙|pièces?)/i);
    if (coinMatch && guild) {
      const amount = parseInt(coinMatch[1]!);
      const data = await getUser(g.guildId, winnerId);
      await saveUser(g.guildId, winnerId, { ...data, coins: data.coins + amount });
      announcement += `\n💰 **${amount} 🪙** ajoutés automatiquement !`;
    }
  }

  await endGiveaway(gId, winnerId);
  if (ch) {
    const embed = new EmbedBuilder()
      .setColor(winnerId ? 0x00cc66 : 0x888888)
      .setTitle("🎊 Giveaway Terminé !")
      .setDescription(`**${g.prize}**\n\n${announcement}`)
      .addFields({ name: "👥 Participants", value: `**${parts.length}**`, inline: true })
      .setFooter({ text: "MAI•GESTION" }).setTimestamp();
    if (g.messageId) {
      const msg = await ch.messages.fetch(g.messageId).catch(() => null);
      if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    }
    await ch.send({ content: winnerId ? `🎉 Félicitations <@${winnerId}> !` : undefined, embeds: [embed] }).catch(() => {});
  }
}

export async function launchGiveaway(client: Client, channelId: string, guildId: string, prize: string, durationStr: string) {
  const duration = parseMs(durationStr);
  const endsAt = Date.now() + duration;
  const guild = client.guilds.cache.get(guildId);
  const ch = guild?.channels.cache.get(channelId) as TextChannel | undefined;
  if (!ch) throw new Error("Salon introuvable.");
  const id = await createGiveaway({ guildId, channelId, messageId: null, prize, endsAt });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(JOIN_BTN).setLabel("🎉 Participer").setStyle(ButtonStyle.Primary)
  );
  const msg = await ch.send({ embeds: [buildGiveawayEmbed(prize, endsAt, 0)], components: [row] });
  await updateGiveawayMsg(id, msg.id);
  setTimeout(() => finishGiveaway(client, id).catch(() => {}), duration);
  return msg;
}

export async function resumeGiveaways(client: Client) {
  const actives = await getActiveGiveaways();
  const now = Date.now();
  for (const g of actives) {
    if (g.endsAt <= now) await finishGiveaway(client, g.id).catch(() => {});
    else setTimeout(() => finishGiveaway(client, g.id).catch(() => {}), g.endsAt - now);
  }
  console.log(`🎉 ${actives.length} giveaway(s) repris`);
}

export async function handleGiveawayJoin(btn: ButtonInteraction) {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }
  const actives = await getActiveGiveaways();
  const g = actives.find(x => x.messageId === btn.message.id);
  if (!g) { await btn.reply({ content: "❌ Giveaway introuvable ou terminé.", ephemeral: true }); return; }
  const joined = await joinGiveaway(g.id, btn.user.id).catch(() => false);
  await btn.reply({ content: joined ? "✅ Tu participes ! Bonne chance 🎉" : "❌ Tu participes déjà à ce giveaway.", ephemeral: true });
}

// ── !giveaway admin command ───────────────────────────────────────────────────
export async function giveawayCommand(client: Client, channelId: string, guildId: string, args: string[]) {
  if (args.length < 2) return { error: "Usage : `!giveaway [durée] [prix]`\nExemple : `!giveaway 24h Nitro Classic` ou `!giveaway 1h 500 coins`" };
  const duration = args[0]!;
  const prize = args.slice(1).join(" ");
  try {
    await launchGiveaway(client, channelId, guildId, prize, duration);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}
