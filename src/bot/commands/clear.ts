import { Message, PermissionFlagsBits, ChannelType, TextChannel } from "discord.js";

export async function clearCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.reply("❌ Permission insuffisante.").catch(() => {});
    return;
  }
  const nb = parseInt(args[0]);
  if (isNaN(nb) || nb < 1 || nb > 100) {
    await message.reply("❌ Usage: `!clear [1-100]`").catch(() => {});
    return;
  }
  if (message.channel.type !== ChannelType.GuildText) return;
  await message.delete().catch(() => {});
  const deleted = await (message.channel as TextChannel).bulkDelete(nb, true).catch(() => null);
  const confirm = await message.channel.send(`✅ **${deleted?.size ?? 0}** messages supprimés.`).catch(() => null);
  if (confirm) setTimeout(() => confirm.delete().catch(() => {}), 4000);
}
