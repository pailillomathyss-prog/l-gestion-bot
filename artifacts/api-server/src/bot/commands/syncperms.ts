import { Message, EmbedBuilder } from "discord.js";

export async function syncpermsCommand(message: Message) {
  if (!message.guild) return;

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("✅ Synchronisation confirmée")
    .setDescription("Les permissions, rôles et règlement sont gérés par leur système d'origine. Aucune modification effectuée.")
    .setTimestamp();

  await message.channel.send({ embeds: [embed] });
  await message.delete().catch(() => {});
}