import { Message, PermissionFlagsBits } from "discord.js";
import { upsertXP } from "../modules/db.js";

export async function restoreXpCommand(message: Message) {
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("❌ Admin seulement.").catch(() => {});
    return;
  }
  const members = await message.guild.members.fetch();
  const { initMemberXP } = await import("../modules/expSystem.js");
  for (const [, m] of members) {
    if (!m.user.bot) await initMemberXP(m).catch(() => {});
  }
  await message.reply(`✅ XP initialisée pour **${members.size}** membres.`).catch(() => {});
}
