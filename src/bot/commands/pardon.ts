import { Message, PermissionFlagsBits } from "discord.js";
import { restoreMember } from "../modules/punishSystem.js";

export async function pardonCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("❌ Permission insuffisante.").catch(() => {});
    return;
  }
  const target = message.mentions.members?.first();
  if (!target) { await message.reply("❌ Usage: `!pardon @membre`").catch(() => {}); return; }
  await restoreMember(message.client, message.guild.id, target.id);
  await message.reply(`✅ Sanction levée pour **${target.displayName}**.`).catch(() => {});
}
