import { Message, PermissionFlagsBits, EmbedBuilder, TextChannel } from "discord.js";
import { logClear } from "../modules/modLogs";

export async function clearCommand(message: Message, args: string[]) {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return message.reply("❌ Tu n'as pas la permission de supprimer des messages.");
  }

  const amount = parseInt(args[0] ?? "10");

  if (isNaN(amount) || amount < 1 || amount > 100) {
    return message.reply("❌ Indique un nombre entre 1 et 100. Ex: `!clear 20`");
  }

  await message.delete().catch(() => {});

  const deleted = await message.channel.bulkDelete(amount, true).catch(() => null);
  const count = deleted?.size ?? 0;

  const reply = await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x00bfff)
        .setDescription(`🧹 **${count}** message(s) supprimé(s) par ${message.author.tag}`)
        .setTimestamp(),
    ],
  });

  setTimeout(() => reply.delete().catch(() => {}), 4000);

  await logClear(message.guild, message.channel as TextChannel, message.author, count);
}
