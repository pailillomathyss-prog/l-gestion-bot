import { Message, EmbedBuilder, PermissionFlagsBits, TextChannel } from "discord.js";
import { logLock } from "../modules/modLogs";

export async function lockCommand(message: Message, args: string[]) {
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return message.reply("❌ Tu n'as pas la permission de verrouiller des salons.");
  }

  const channel = (message.mentions.channels.first() ?? message.channel) as TextChannel;
  const reason = args.filter((a) => !a.startsWith("<#")).join(" ") || "Aucune raison fournie";

  try {
    await channel.permissionOverwrites.edit(
      message.guild!.roles.everyone,
      { SendMessages: false },
      { reason: `${message.author.tag}: ${reason}` }
    );
    await logLock(message.guild!, channel, message.author, reason, true);

    await message.channel.send({
      embeds: [
        new EmbedBuilder().setColor(0xff0000).setTitle("🔒 Salon verrouillé")
          .addFields(
            { name: "Salon", value: `<#${channel.id}>` },
            { name: "Raison", value: reason },
            { name: "Modérateur", value: message.author.tag }
          ).setTimestamp(),
      ],
    });
  } catch {
    await message.reply("❌ Une erreur est survenue.");
  }
}

export async function unlockCommand(message: Message, args: string[]) {
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return message.reply("❌ Tu n'as pas la permission de déverrouiller des salons.");
  }

  const channel = (message.mentions.channels.first() ?? message.channel) as TextChannel;
  const reason = args.filter((a) => !a.startsWith("<#")).join(" ") || "Aucune raison fournie";

  try {
    await channel.permissionOverwrites.edit(
      message.guild!.roles.everyone,
      { SendMessages: null },
      { reason: `${message.author.tag}: ${reason}` }
    );
    await logLock(message.guild!, channel, message.author, reason, false);

    await message.channel.send({
      embeds: [
        new EmbedBuilder().setColor(0x57f287).setTitle("🔓 Salon déverrouillé")
          .addFields(
            { name: "Salon", value: `<#${channel.id}>` },
            { name: "Raison", value: reason },
            { name: "Modérateur", value: message.author.tag }
          ).setTimestamp(),
      ],
    });
  } catch {
    await message.reply("❌ Une erreur est survenue.");
  }
}
