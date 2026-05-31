import { Message, EmbedBuilder, PermissionFlagsBits, TextChannel } from "discord.js";
import { getUserInviteCount } from "./invites";
import { giveaways, GiveawayData } from "../index";

function parseDuration(str: string): number {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 0;
  const val = parseInt(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return val * (multipliers[unit] ?? 0);
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} seconde(s)`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute(s)`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} heure(s)`;
  return `${Math.floor(h / 24)} jour(s)`;
}

export async function giveawayCommand(message: Message, args: string[]) {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return message.reply("❌ Tu n'as pas la permission de gérer les giveaways.");
  }

  const sub = args[0]?.toLowerCase();

  if (sub === "start") {
    const durationStr = args[1];
    const winners = parseInt(args[2] ?? "1");
    // Extraire invites:X des args
    const inviteArgIdx = args.findIndex((a) => /^invites:\d+$/i.test(a));
    let invitesRequired: number | undefined;
    if (inviteArgIdx >= 3) {
      invitesRequired = parseInt(args.splice(inviteArgIdx, 1)[0].split(":")[1]);
    }
    const prize = args.slice(3).join(" ");

    if (!durationStr || isNaN(winners) || !prize) {
      return message.reply(
        "❌ Usage: `!giveaway start [durée: 10m/1h/2d] [gagnants] [prix]`\nEx: `!giveaway start 1h 2 Nitro Classic`"
      );
    }

    const duration = parseDuration(durationStr);
    if (duration === 0) {
      return message.reply("❌ Durée invalide. Utilise: `10s`, `5m`, `2h`, `1d`");
    }

    const endsAt = Date.now() + duration;

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🎉 GIVEAWAY 🎉")
      .setDescription(
        `Réagis avec 🎉 pour participer !\n\n**Prix:** ${prize}\n**Gagnant(s):** ${winners}\n**Fin:** <t:${Math.floor(endsAt / 1000)}:R>\n**Organisé par:** ${message.author}`
      )
      .setFooter({ text: `Se termine dans ${formatDuration(duration)}` })
      .setTimestamp(endsAt);

    const gwMessage = await message.channel.send({ embeds: [embed] });
    await gwMessage.react("🎉");

    const gwData: GiveawayData = {
      messageId: gwMessage.id,
      channelId: gwMessage.channel.id,
      prize,
      winner: winners,
      endsAt,
      ended: false,
      participants: new Set(),
      invitesRequired,
    };

    giveaways.set(gwMessage.id, gwData);

    setTimeout(() => endGiveaway(gwMessage.id), duration);

    await message.delete().catch(() => {});
  } else if (sub === "end") {
    const msgId = args[1];
    if (!msgId) return message.reply("❌ Indique l'ID du message du giveaway: `!giveaway end [messageId]`");
    await endGiveaway(msgId, message);
  } else if (sub === "reroll") {
    const msgId = args[1];
    if (!msgId) return message.reply("❌ Indique l'ID du message: `!giveaway reroll [messageId]`");
    await rerollGiveaway(msgId, message);
  } else {
    await message.reply(
      "❌ Sous-commande inconnue. Utilise: `start`, `end`, `reroll`"
    );
  }
}

export async function endGiveaway(messageId: string, triggerMessage?: Message) {
  const gw = giveaways.get(messageId);
  if (!gw || gw.ended) return;

  gw.ended = true;
  giveaways.set(messageId, gw);

  const { client } = await import("../index");
  const channel = client.channels.cache.get(gw.channelId) as TextChannel | null;
  if (!channel) return;

  const gwMsg = await channel.messages.fetch(messageId).catch(() => null);
  if (!gwMsg) return;

  const reaction = gwMsg.reactions.cache.get("🎉");
  const users = await reaction?.users.fetch().catch(() => null);
  const rawEligible = users?.filter((u) => !u.bot).map((u) => u.id) ?? [];
  let eligible = rawEligible;
  if (gw.invitesRequired) {
    const gwChannel = client.channels.cache.get(gw.channelId) as TextChannel | null;
    const guildId = gwChannel?.guild?.id ?? '';
    const counts = await Promise.all(
      rawEligible.map(async (uid) => ({ uid, count: await getUserInviteCount(guildId, uid) }))
    );
    eligible = counts.filter((e) => e.count >= gw.invitesRequired!).map((e) => e.uid);
    if (!eligible.length) {
      const noWinEmbed = new EmbedBuilder().setColor(0xff0000).setTitle('🎉 GIVEAWAY TERMINÉ')
        .setDescription('**Prix:** ' + gw.prize + '\n❌ Aucun participant n\'a atteint les **' + gw.invitesRequired + '** invitation(s) requise(s).')
        .setTimestamp();
      await gwMsg.edit({ embeds: [noWinEmbed] });
      return;
    }
  }

  const winners: string[] = [];
  const pool = [...eligible];

  for (let i = 0; i < Math.min(gw.winner, pool.length); i++) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }

  const embed = new EmbedBuilder()
    .setColor(winners.length ? 0x57f287 : 0xff0000)
    .setTitle("🎉 GIVEAWAY TERMINÉ")
    .setDescription(
      winners.length
        ? `**Prix:** ${gw.prize}\n**Gagnant(s):** ${winners.map((id) => `<@${id}>`).join(", ")}\n**Organisé par:** <#${gw.channelId}>`
        : `**Prix:** ${gw.prize}\n❌ Pas assez de participants pour désigner un gagnant.`
    )
    .setTimestamp();

  await gwMsg.edit({ embeds: [embed] });

  if (winners.length) {
    await channel.send({
      content: `🎊 Félicitations ${winners.map((id) => `<@${id}>`).join(", ")} ! Vous avez gagné **${gw.prize}** !`,
    });
  }
}

async function rerollGiveaway(messageId: string, message: Message) {
  const gw = giveaways.get(messageId);
  if (!gw) return message.reply("❌ Giveaway introuvable.");

  const { client } = await import("../index");
  const channel = client.channels.cache.get(gw.channelId) as TextChannel | null;
  if (!channel) return;

  const gwMsg = await channel.messages.fetch(messageId).catch(() => null);
  if (!gwMsg) return message.reply("❌ Message du giveaway introuvable.");

  const reaction = gwMsg.reactions.cache.get("🎉");
  const users = await reaction?.users.fetch().catch(() => null);
  const eligible = users?.filter((u) => !u.bot).map((u) => u.id) ?? [];

  if (!eligible.length) return message.reply("❌ Aucun participant valide.");

  const newWinner = eligible[Math.floor(Math.random() * eligible.length)];

  await channel.send({
    content: `🔁 Nouveau gagnant pour **${gw.prize}** : <@${newWinner}> ! Félicitations !`,
  });
}
