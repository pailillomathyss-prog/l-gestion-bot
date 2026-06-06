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
      c.name.toLowerCase().includes("moderator-only")
  ) as TextChannel | undefined;

  if (found) {
    logsChannelId = found.id;
    return found;
  }
  return null;
}

export async function logBan(guild: Guild, target: User, moderator: User, reason: string) {
  const ch = await getLogsChannel(guild);
  if (!ch) return;
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff0000)
        .setAuthor({ name: "🔨 Bannissement", iconURL: target.displayAvatarURL() })
        .addFields(
          { name: "Membre", value: `${target.tag} (${target.id})`, inline: true },
          { name: "Modérateur", value: moderator.tag, inline: true },
          { name: "Raison", value: reason }
        )
        .setFooter({ text: `ID: ${target.id}` })
        .setTimestamp(),
    ],
  }).catch((e) => logger.warn({ e }, "Impossible d'envoyer le log ban"));
}

export async function logUnban(guild: Guild, target: User, moderator: User, reason: string) {
  const ch = await getLogsChannel(guild);
  if (!ch) return;
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setAuthor({ name: "✅ Débannissement", iconURL: target.displayAvatarURL() })
        .addFields(
          { name: "Membre", value: `${target.tag} (${target.id})`, inline: true },
          { name: "Modérateur", value: moderator.tag, inline: true },
          { name: "Raison", value: reason }
        )
        .setFooter({ text: `ID: ${target.id}` })
        .setTimestamp(),
    ],
  }).catch((e) => logger.warn({ e }, "Impossible d'envoyer le log unban"));
}

export async function logMute(guild: Guild, target: User, moderator: User, duration: string, reason: string) {
  const ch = await getLogsChannel(guild);
  if (!ch) return;
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffa500)
        .setAuthor({ name: "🔇 Mute", iconURL: target.displayAvatarURL() })
        .addFields(
          { name: "Membre", value: `${target.tag} (${target.id})`, inline: true },
          { name: "Modérateur", value: moderator.tag, inline: true },
          { name: "Durée", value: duration, inline: true },
          { name: "Raison", value: reason }
        )
        .setFooter({ text: `ID: ${target.id}` })
        .setTimestamp(),
    ],
  }).catch((e) => logger.warn({ e }, "Impossible d'envoyer le log mute"));
}

export async function logDemute(guild: Guild, target: User, moderator: User, reason: string) {
  const ch = await getLogsChannel(guild);
  if (!ch) return;
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setAuthor({ name: "🔊 Démute", iconURL: target.displayAvatarURL() })
        .addFields(
          { name: "Membre", value: `${target.tag} (${target.id})`, inline: true },
          { name: "Modérateur", value: moderator.tag, inline: true },
          { name: "Raison", value: reason }
        )
        .setFooter({ text: `ID: ${target.id}` })
        .setTimestamp(),
    ],
  }).catch((e) => logger.warn({ e }, "Impossible d'envoyer le log demute"));
}

export async function logLock(guild: Guild, channel: TextChannel, moderator: User, reason: string, locked: boolean) {
  const ch = await getLogsChannel(guild);
  if (!ch) return;
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(locked ? 0xff0000 : 0x57f287)
        .setAuthor({ name: locked ? "🔒 Salon verrouillé" : "🔓 Salon déverrouillé", iconURL: moderator.displayAvatarURL() })
        .addFields(
          { name: "Salon", value: `<#${channel.id}>`, inline: true },
          { name: "Modérateur", value: moderator.tag, inline: true },
          { name: "Raison", value: reason }
        )
        .setTimestamp(),
    ],
  }).catch((e) => logger.warn({ e }, "Impossible d'envoyer le log lock"));
}

export async function logAntiLink(guild: Guild, target: User, channel: TextChannel, content: string) {
  const ch = await getLogsChannel(guild);
  if (!ch) return;
  const preview = content.length > 80 ? content.slice(0, 80) + "…" : content;
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff6b35)
        .setAuthor({ name: "🔗 Lien supprimé (anti-link)", iconURL: target.displayAvatarURL() })
        .addFields(
          { name: "Membre", value: `${target.tag} (${target.id})`, inline: true },
          { name: "Salon", value: `<#${channel.id}>`, inline: true },
          { name: "Message", value: `\`${preview}\`` }
        )
        .setFooter({ text: `ID: ${target.id}` })
        .setTimestamp(),
    ],
  }).catch((e) => logger.warn({ e }, "Impossible d'envoyer le log anti-link"));
}
