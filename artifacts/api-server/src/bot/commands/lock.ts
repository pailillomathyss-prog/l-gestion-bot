import { Message, PermissionFlagsBits, EmbedBuilder, GuildChannel, OverwriteType } from "discord.js";
import { logger } from "../../lib/logger";

export async function lockCommand(message: Message, args: string[]) {
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
    // 1. Bloquer @everyone
    await channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      { SendMessages: false },
      { reason: mod + ": " + reason }
    );

    // 2. Bloquer aussi chaque rôle qui a un overwrite explicite SendMessages = true
    //    (ex: @Random) pour eviter qu'ils contournent le lock
    for (const [, overwrite] of channel.permissionOverwrites.cache) {
      if (overwrite.type !== OverwriteType.Role) continue;
      if (overwrite.id === message.guild.roles.everyone.id) continue;
      const allows = overwrite.allow;
      if (allows.has(PermissionFlagsBits.SendMessages)) {
        await channel.permissionOverwrites.edit(
          overwrite.id,
          { SendMessages: false },
          { reason: mod + ": lock salon" }
        );
      }
    }

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
    // Remettre SendMessages a null (herite) pour @everyone et tous les roles
    for (const [, overwrite] of channel.permissionOverwrites.cache) {
      if (overwrite.type !== OverwriteType.Role) continue;
      await channel.permissionOverwrites.edit(
        overwrite.id,
        { SendMessages: null },
        { reason: mod + ": " + reason }
      );
    }

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