import { Message, PermissionFlagsBits, TextChannel } from "discord.js";

export async function clearCommand(message: Message, args: string[]) {
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages))
    return message.reply("❌ Tu n'as pas la permission de supprimer des messages.");

  const amount = parseInt(args[0] ?? "");
  if (isNaN(amount) || amount < 1 || amount > 100)
    return message.reply("❌ Fournis un nombre entre 1 et 100. Ex: `!clear 10`");

  const ch = message.channel as TextChannel;
  await message.delete().catch(() => {});
  const deleted = await ch.bulkDelete(amount, true).catch(() => null);

  const reply = await ch.send(`✅ **${deleted?.size ?? 0}** message(s) supprimé(s).`);
  setTimeout(() => reply.delete().catch(() => {}), 4000);
}
