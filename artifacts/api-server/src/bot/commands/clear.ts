import { Message, EmbedBuilder, PermissionFlagsBits, TextChannel } from "discord.js";

export async function clearCommand(message: Message, args: string[]) {
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return message.reply("❌ Tu n'as pas la permission de supprimer des messages.");
  }

  const channel = message.channel as TextChannel;
  const input = args[0]?.toLowerCase();

  if (!input) {
    return message.reply("❌ Précise un nombre ou `all`. Ex: `!clear 50` ou `!clear all`");
  }

  await message.delete().catch(() => {});

  let toDelete: number;

  if (input === "all") {
    toDelete = 500;
  } else {
    toDelete = parseInt(input);
    if (isNaN(toDelete) || toDelete < 1) {
      return message.channel.send("❌ Nombre invalide. Ex: `!clear 50` ou `!clear all`");
    }
    if (toDelete > 500) toDelete = 500;
  }

  let totalDeleted = 0;
  let remaining = toDelete;

  while (remaining > 0) {
    const batch = Math.min(remaining, 100);
    const deleted = await channel.bulkDelete(batch, true).catch(() => null);
    const count = deleted?.size ?? 0;
    totalDeleted += count;
    remaining -= batch;
    if (count < batch) break;
    if (remaining > 0) await new Promise((r) => setTimeout(r, 1000));
  }

  const confirm = await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🧹 Messages supprimés")
        .setDescription(`**${totalDeleted}** message(s) supprimé(s) dans <#${channel.id}>`)
        .setFooter({ text: "Ce message disparaît dans 5 secondes" })
        .setTimestamp(),
    ],
  });

  setTimeout(() => confirm.delete().catch(() => {}), 5000);
}
