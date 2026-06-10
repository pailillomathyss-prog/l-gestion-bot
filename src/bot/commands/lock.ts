import { Message, PermissionFlagsBits, ChannelType, TextChannel } from "discord.js";

export async function lockCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await message.reply("❌ Permission insuffisante.").catch(() => {});
    return;
  }
  const ch = message.mentions.channels.first() as TextChannel | undefined ?? message.channel as TextChannel;
  if (ch.type !== ChannelType.GuildText) {
    await message.reply("❌ Salon non compatible.").catch(() => {});
    return;
  }
  await ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
  await message.reply(`🔒 <#${ch.id}> est maintenant verrouillé.`).catch(() => {});
}

export async function unlockCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await message.reply("❌ Permission insuffisante.").catch(() => {});
    return;
  }
  const ch = message.mentions.channels.first() as TextChannel | undefined ?? message.channel as TextChannel;
  if (ch.type !== ChannelType.GuildText) {
    await message.reply("❌ Salon non compatible.").catch(() => {});
    return;
  }
  await ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
  await message.reply(`🔓 <#${ch.id}> est maintenant déverrouillé.`).catch(() => {});
}
