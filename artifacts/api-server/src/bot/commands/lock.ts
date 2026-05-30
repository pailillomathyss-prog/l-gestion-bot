import { Message, PermissionFlagsBits, EmbedBuilder, ChannelType, PermissionsBitField } from "discord.js";

  export async function lockCommand(message: Message, args: string[]) {
    if (!message.guild) return;
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply("❌ Tu n'as pas la permission de verrouiller des salons.");
    }

    const channel = message.mentions.channels.first() ?? message.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      return message.reply("❌ Salon invalide. Mentionne un salon texte ou utilise la commande dans le salon à verrouiller.");
    }

    const reason = args.slice(1).join(" ") || "Aucune raison fournie";

    try {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
        SendMessages: false,
      }, { reason: `${message.author.tag}: ${reason}` });

      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("🔒 Salon verrouillé")
        .addFields(
          { name: "Salon", value: `<#${channel.id}>` },
          { name: "Raison", value: reason },
          { name: "Modérateur", value: message.author.tag }
        )
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
      await message.delete().catch(() => {});
    } catch {
      await message.reply("❌ Une erreur est survenue lors du verrouillage.");
    }
  }

  export async function unlockCommand(message: Message, args: string[]) {
    if (!message.guild) return;
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply("❌ Tu n'as pas la permission de déverrouiller des salons.");
    }

    const channel = message.mentions.channels.first() ?? message.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      return message.reply("❌ Salon invalide.");
    }

    const reason = args.slice(1).join(" ") || "Aucune raison fournie";

    try {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
        SendMessages: null,
      }, { reason: `${message.author.tag}: ${reason}` });

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔓 Salon déverrouillé")
        .addFields(
          { name: "Salon", value: `<#${channel.id}>` },
          { name: "Raison", value: reason },
          { name: "Modérateur", value: message.author.tag }
        )
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
      await message.delete().catch(() => {});
    } catch {
      await message.reply("❌ Une erreur est survenue lors du déverrouillage.");
    }
  }
  