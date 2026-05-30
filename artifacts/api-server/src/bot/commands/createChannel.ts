import {
  Message,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} from "discord.js";

export async function createChannelCommand(message: Message, args: string[]) {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return message.reply("❌ Tu n'as pas la permission de créer des salons.");
  }

  const type = args[0]?.toLowerCase();
  const nameRaw = args.slice(1).join("-").toLowerCase().replace(/\s+/g, "-");
  const channelName = nameRaw || "nouveau-salon";

  if (!type || !["text", "voice", "announce"].includes(type)) {
    return message.reply(
      "❌ Type invalide. Utilise: `!cc text [nom]`, `!cc voice [nom]`, `!cc announce [nom]`"
    );
  }

  let channelType: ChannelType;
  let emoji: string;

  switch (type) {
    case "voice":
      channelType = ChannelType.GuildVoice;
      emoji = "🔊";
      break;
    case "announce":
      channelType = ChannelType.GuildAnnouncement;
      emoji = "📢";
      break;
    default:
      channelType = ChannelType.GuildText;
      emoji = "💬";
  }

  const channel = await message.guild.channels.create({
    name: channelName,
    type: channelType,
    reason: `Créé par ${message.author.tag}`,
  }).catch(() => null);

  if (!channel) {
    return message.reply("❌ Impossible de créer le salon (permissions insuffisantes ?).");
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`${emoji} Salon créé`)
    .addFields(
      { name: "Nom", value: channel.name, inline: true },
      { name: "Type", value: type, inline: true },
      { name: "Créé par", value: message.author.tag, inline: true }
    )
    .setTimestamp();

  await message.channel.send({ embeds: [embed] });
}
