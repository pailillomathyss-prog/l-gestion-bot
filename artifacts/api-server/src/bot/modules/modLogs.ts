import { Guild, EmbedBuilder, TextChannel, User, ChannelType } from "discord.js";
import { logger } from "../../lib/logger";

let logsChannelId: string | null = null;

export function setLogsChannelId(id: string) {
  logsChannelId = id;
}

async function getLogsChannel(guild: Guild): Promise<TextChannel | null> {
  if (logsChannelId) {
    const ch = guild.channels.cache.get(logsChannelId);
    if (ch?.type === ChannelType.GuildText) return ch as TextChannel;
  }

  const found = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      (c.name.includes("logs-mod") ||
        c.name.includes("mod-log") ||
        c.name.includes("logs-modération") ||
        c.name.includes("modlogs") ||
        c.name.includes("logs"))
  ) as TextChannel | undefined;

  if (found) {
    logsChannelId = found.id;
    return found;
  }
  return null;
}

export async function logBan(
  guild: Guild,
  target: User,
  moderator: User,
  reason: string
) {
  const ch = await getLogsChannel(guild);
  if (!ch) return;
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff0000)
        .setAuthor({ name: `🔨 Bannissement`, iconURL: target.displayAvatarURL() })
        .addFields(
          { name: "Membre", value: `${target.tag} (${target.id})`, inline: true },
          { name: "Modérateur", value: `${moderator.tag}`, inline: true },
          { name: "Raison", value: reason }
        )
        .setFooter({ text: `ID: ${target.id}` })
        .setTimestamp(),
    ],
  }).catch((e) => logger.warn({ e }, "Impossible d'envoyer le log ban"));
}

export async function logMute(
  guild: Guild,
  target: User,
  moderator: User,
  duration: string,
  reason: string
) {
  const ch = await getLogsChannel(guild);
  if (!ch) return;
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffa500)
        .setAuthor({ name: `🔇 Mute`, iconURL: target.displayAvatarURL() })
        .addFields(
          { name: "Membre", value: `${target.tag} (${target.id})`, inline: true },
          { name: "Modérateur", value: `${moderator.tag}`, inline: true },
          { name: "Durée", value: duration, inline: true },
          { name: "Raison", value: reason }
        )
        .setFooter({ text: `ID: ${target.id}` })
        .setTimestamp(),
    ],
  }).catch((e) => logger.warn({ e }, "Impossible d'envoyer le log mute"));
}

export async function logUnmute(
  guild: Guild,
  target: User,
  moderator: User,
  reason: string
) {
  const ch = await getLogsChannel(guild);
  if (!ch) return;
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setAuthor({ name: `🔊 Démute`, iconURL: target.displayAvatarURL() })
        .addFields(
          { name: "Membre", value: `${target.tag} (${target.id})`, inline: true },
          { name: "Modérateur", value: `${moderator.tag}`, inline: true },
          { name: "Raison", value: reason }
        )
        .setFooter({ text: `ID: ${target.id}` })
        .setTimestamp(),
    ],
  }).catch((e) => logger.warn({ e }, "Impossible d'envoyer le log unmute"));
}

export async function logClear(
  guild: Guild,
  channel: TextChannel,
  moderator: User,
  count: number
) {
  const ch = await getLogsChannel(guild);
  if (!ch) return;
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x00bfff)
        .setAuthor({ name: `🧹 Suppression de messages`, iconURL: moderator.displayAvatarURL() })
        .addFields(
          { name: "Salon", value: `${channel}`, inline: true },
          { name: "Messages supprimés", value: `${count}`, inline: true },
          { name: "Modérateur", value: `${moderator.tag}`, inline: true }
        )
        .setTimestamp(),
    ],
  }).catch((e) => logger.warn({ e }, "Impossible d'envoyer le log clear"));
}

export async function logAntiLink(
  guild: Guild,
  target: User,
  channel: TextChannel,
  content: string
) {
  const ch = await getLogsChannel(guild);
  if (!ch) return;
  const preview = content.length > 80 ? content.slice(0, 80) + "…" : content;
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff6b35)
        .setAuthor({ name: `🔗 Lien supprimé (anti-link)`, iconURL: target.displayAvatarURL() })
        .addFields(
          { name: "Membre", value: `${target.tag} (${target.id})`, inline: true },
          { name: "Salon", value: `${channel}`, inline: true },
          { name: "Message", value: `\`${preview}\`` }
        )
        .setFooter({ text: `ID: ${target.id}` })
        .setTimestamp(),
    ],
  }).catch((e) => logger.warn({ e }, "Impossible d'envoyer le log anti-link"));
}

  export async function logUnban(
    guild: Guild,
    user: User,
    moderator: User,
    reason: string
  ) {
    const channelId = getLogsChannelId(guild.id);
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ Membre débanni")
          .addFields(
            { name: "Utilisateur", value: `${user.tag} (${user.id})` },
            { name: "Raison", value: reason },
            { name: "Modérateur", value: moderator.tag }
          )
          .setThumbnail(user.displayAvatarURL())
          .setTimestamp(),
      ],
    }).catch(() => {});
  }
  