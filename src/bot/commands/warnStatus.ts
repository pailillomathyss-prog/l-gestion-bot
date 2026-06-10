import { Message, EmbedBuilder } from "discord.js";
import { getPunishmentStatus } from "../modules/punishSystem.js";

export async function warnStatusCommand(message: Message, args: string[]) {
  if (!message.guild) return;
  const target = message.mentions.users.first() ?? message.author;
  const record = await getPunishmentStatus(message.guild.id, target.id);
  await message.reply({
    embeds: [new EmbedBuilder()
      .setColor(record ? 0xff4444 : 0x00cc66)
      .setTitle(`⚠️ Statut de ${target.username}`)
      .setDescription(record
        ? `🪫 **Sanctionné** — \`${record.reason}\`\nLibération : <t:${Math.floor((record.expiresAt) / 1000)}:R>`
        : "✅ Aucune sanction active")
      .setThumbnail(target.displayAvatarURL())
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
  }).catch(() => {});
}
