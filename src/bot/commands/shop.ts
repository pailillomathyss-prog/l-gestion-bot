import { Message, EmbedBuilder } from "discord.js";
import { getCoins } from "../modules/db";
import { buildShopEmbed, SHOP_ROLES, SHOP_XP } from "../modules/shop";

export async function shopCommand(message: Message) {
  if (!message.guild || !message.member) return;
  const bal = await getCoins(message.guild.id, message.author.id);
  const embed = buildShopEmbed()
    .addFields({ name: "💰 Ton solde", value: `**${bal.toLocaleString("fr-FR")} 🪙**`, inline: false });
  await message.reply({ embeds: [embed] });
}

export async function balanceCommand(message: Message) {
  if (!message.guild) return;
  const target = message.mentions.members?.first() ?? message.member!;
  const bal = await getCoins(message.guild.id, target.id);
  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(0xffd700).setTitle("💰 Solde")
    .setDescription(`**${target.displayName}** possède **${bal.toLocaleString("fr-FR")} 🪙**`)
    .setFooter({ text: "MAI•GESTION" }).setTimestamp()] });
}
