import { Message, PermissionFlagsBits, EmbedBuilder, ChannelType, GuildChannel } from "discord.js";
import { logger } from "../../lib/logger";

export async function lockCommand(message: Message, args: string[]) {
  if (!message.guild) return;

  const channel = (message.mentions.channels.first() ?? message.channel) as GuildChannel;
  if (!channel || !("permissionOverwrites" in channel)) {
    return message.reply("❌ Salon invalide. Mentionne un salon texte ou utilise la commande dans le salon a verrouiller.");
  }

  // Verifier que le bot a la permission ManageChannels
  const botMember = message.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return message.reply("❌ Le bot n'a pas la permission `Gérer les salons`.");
  }

  const reason = args.slice(1).join(" ") || "Aucune raison fournie";
  const mod = message.author.username ?? message.author.id;

  try {
    await channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      { SendMessages: false },
      { reason: mod + ": " + reason }
    );

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🔒 Salon verrouillé")
      .addFields(
        { name: "Salon", value: "<#" + channel.id + ">", inline: true },
        { name: "Raison", value: reason, inline: true },
        { name: "Modérateur", value: "<@" + message.author.id + ">", inline: true }
      )
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    await message.delete().catch(() => {});
  } catch (err: any) {
    logger.error({ err }, "lockCommand error");
    await message.reply("❌ Erreur : " + (err?.message ?? "inconnue")).catch(() => {});
  }
}

export async function unlockCommand(message: Message, args: string[]) {
  if (!message.guild) return;

  const channel = (message.mentions.channels.first() ?? message.channel) as GuildChannel;
  if (!channel || !("permissionOverwrites" in channel)) {
    return message.reply("❌ Salon invalide.");
  }

  const botMember = message.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return message.reply("❌ Le bot n'a pas la permission `Gérer les salons`.");
  }

  const reason = args.slice(1).join(" ") || "Aucune raison fournie";
  const mod = message.author.username ?? message.author.id;

  try {
    await channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      { SendMessages: null },
      { reason: mod + ": " + reason }
    );

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🔓 Salon déverrouillé")
      .addFields(
        { name: "Salon", value: "<#" + channel.id + ">", inline: true },
        { name: "Raison", value: reason, inline: true },
        { name: "Modérateur", value: "<@" + message.author.id + ">", inline: true }
      )
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    await message.delete().catch(() => {});
  } catch (err: any) {
    logger.error({ err }, "unlockCommand error");
    await message.reply("❌ Erreur : " + (err?.message ?? "inconnue")).catch(() => {});
  }
}