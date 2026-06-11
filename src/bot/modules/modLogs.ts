import { Guild, User, GuildChannel, EmbedBuilder, TextChannel, ChannelType } from "discord.js";
import { logger } from "../../lib/logger";

async function getLogChannel(guild: Guild): Promise<TextChannel | null> {
  const ch = guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText &&
    (c.name.toLowerCase().includes("mod-log") || c.name.toLowerCase().includes("logs") ||
     c.name.toLowerCase().includes("modlog") || c.name.toLowerCase().includes("sanctions"))
  ) as TextChannel | undefined;
  return ch ?? null;
}

async function send(guild: Guild, embed: EmbedBuilder) {
  const ch = await getLogChannel(guild);
  if (!ch) return;
  await ch.send({ embeds: [embed] }).catch(err => logger.warn({ err }, "modLog send failed"));
}

export async function logBan(guild: Guild, target: User, mod: User, reason: string) {
  await send(guild, new EmbedBuilder()
    .setColor(0xff0000).setTitle("🔨 Bannissement")
    .addFields(
      { name: "Utilisateur", value: `${target.tag} (${target.id})`, inline: true },
      { name: "Modérateur", value: mod.tag, inline: true },
      { name: "Raison", value: reason },
    ).setTimestamp());
}

export async function logUnban(guild: Guild, target: User, mod: User, reason: string) {
  await send(guild, new EmbedBuilder()
    .setColor(0x57f287).setTitle("✅ Débannissement")
    .addFields(
      { name: "Utilisateur", value: `${target.tag} (${target.id})`, inline: true },
      { name: "Modérateur", value: mod.tag, inline: true },
      { name: "Raison", value: reason },
    ).setTimestamp());
}

export async function logMute(guild: Guild, target: User, mod: User, duration: string, reason: string) {
  await send(guild, new EmbedBuilder()
    .setColor(0xffa500).setTitle("🔇 Mute")
    .addFields(
      { name: "Utilisateur", value: `${target.tag} (${target.id})`, inline: true },
      { name: "Modérateur", value: mod.tag, inline: true },
      { name: "Durée", value: duration, inline: true },
      { name: "Raison", value: reason },
    ).setTimestamp());
}

export async function logDemute(guild: Guild, target: User, mod: User, reason: string) {
  await send(guild, new EmbedBuilder()
    .setColor(0x57f287).setTitle("🔊 Démute")
    .addFields(
      { name: "Utilisateur", value: `${target.tag} (${target.id})`, inline: true },
      { name: "Modérateur", value: mod.tag, inline: true },
      { name: "Raison", value: reason },
    ).setTimestamp());
}

export async function logLock(guild: Guild, channel: GuildChannel, mod: User, reason: string, locked: boolean) {
  await send(guild, new EmbedBuilder()
    .setColor(locked ? 0xff0000 : 0x57f287).setTitle(locked ? "🔒 Salon verrouillé" : "🔓 Salon déverrouillé")
    .addFields(
      { name: "Salon", value: `<#${channel.id}>`, inline: true },
      { name: "Modérateur", value: mod.tag, inline: true },
      { name: "Raison", value: reason },
    ).setTimestamp());
}

export async function logAntiLink(guild: Guild, author: User, channel: TextChannel, content: string) {
  await send(guild, new EmbedBuilder()
    .setColor(0xff6b35).setTitle("🔗 Lien supprimé (Anti-Link)")
    .addFields(
      { name: "Utilisateur", value: `${author.tag} (${author.id})`, inline: true },
      { name: "Salon", value: `<#${channel.id}>`, inline: true },
      { name: "Message", value: content.slice(0, 200) },
    ).setTimestamp());
}
