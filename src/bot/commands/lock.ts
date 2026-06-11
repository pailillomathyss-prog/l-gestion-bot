import { Message, EmbedBuilder, PermissionFlagsBits, TextChannel, OverwriteType } from "discord.js";
import { logLock } from "../modules/modLogs";

export async function lockCommand(message: Message, args: string[]) {
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels))
    return message.reply("❌ Tu n'as pas la permission de verrouiller des salons.");
  if (!message.guild) return;

  const channel = (message.mentions.channels.first() ?? message.channel) as TextChannel;
  const reason  = args.filter(a => !a.startsWith("<#")).join(" ") || "Aucune raison fournie";

  try {
    // Récupère le rôle @everyone depuis l'ID de la guild (plus fiable que .roles.everyone)
    const everyoneRole = message.guild.roles.cache.get(message.guild.id)
      ?? await message.guild.roles.fetch(message.guild.id).catch(() => null);

    if (!everyoneRole) {
      return message.reply("❌ Impossible de trouver le rôle @everyone.");
    }

    await channel.permissionOverwrites.edit(
      everyoneRole,
      { SendMessages: false, AddReactions: false, CreatePublicThreads: false },
      { reason: `${message.author.tag}: ${reason}`, type: OverwriteType.Role }
    );

    await logLock(message.guild, channel, message.author, reason, true);

    await message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(0xff0000).setTitle("🔒 Salon verrouillé")
      .addFields(
        { name: "Salon",      value: `<#${channel.id}>`, inline: true },
        { name: "Raison",     value: reason,              inline: true },
        { name: "Modérateur", value: message.author.tag,  inline: true },
      ).setTimestamp()] });
  } catch (err: any) {
    await message.reply(`❌ Erreur lors du verrouillage : \`${err?.message ?? err}\``);
  }
}

export async function unlockCommand(message: Message, args: string[]) {
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels))
    return message.reply("❌ Tu n'as pas la permission de déverrouiller des salons.");
  if (!message.guild) return;

  const channel = (message.mentions.channels.first() ?? message.channel) as TextChannel;
  const reason  = args.filter(a => !a.startsWith("<#")).join(" ") || "Aucune raison fournie";

  try {
    const everyoneRole = message.guild.roles.cache.get(message.guild.id)
      ?? await message.guild.roles.fetch(message.guild.id).catch(() => null);

    if (!everyoneRole) {
      return message.reply("❌ Impossible de trouver le rôle @everyone.");
    }

    await channel.permissionOverwrites.edit(
      everyoneRole,
      { SendMessages: null, AddReactions: null, CreatePublicThreads: null },
      { reason: `${message.author.tag}: ${reason}`, type: OverwriteType.Role }
    );

    await logLock(message.guild, channel, message.author, reason, false);

    await message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(0x57f287).setTitle("🔓 Salon déverrouillé")
      .addFields(
        { name: "Salon",      value: `<#${channel.id}>`, inline: true },
        { name: "Raison",     value: reason,              inline: true },
        { name: "Modérateur", value: message.author.tag,  inline: true },
      ).setTimestamp()] });
  } catch (err: any) {
    await message.reply(`❌ Erreur lors du déverrouillage : \`${err?.message ?? err}\``);
  }
}
