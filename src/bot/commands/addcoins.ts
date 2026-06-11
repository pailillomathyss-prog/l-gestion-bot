import { Message, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { addCoins, getCoins } from "../modules/db";

export async function addCoinsCommand(message: Message, args: string[]) {
  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator))
    return message.reply("❌ Commande réservée aux administrateurs.");
  if (!message.guild) return;

  const target = message.mentions.members?.first() ?? message.member;
  const amountStr = message.mentions.members?.first() ? args[1] : args[0];
  const amount = parseInt(amountStr ?? "");

  if (isNaN(amount) || amount === 0)
    return message.reply("❌ Utilisation : `!addcoins [@membre] [montant]`\nEx: `!addcoins @user 500` ou `!addcoins -200`");

  const newBal = await addCoins(message.guild.id, target.id, amount);

  const sign  = amount > 0 ? "+" : "";
  const color = amount > 0 ? 0x57f287 : 0xff4444;
  const title = amount > 0 ? "💰 Pièces ajoutées !" : "💸 Pièces retirées !";

  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(
      { name: "👤 Membre",          value: `<@${target.id}>`,                                   inline: true },
      { name: "📈 Modification",    value: `**${sign}${amount.toLocaleString("fr-FR")} 🪙**`,   inline: true },
      { name: "💰 Nouveau solde",   value: `**${newBal.toLocaleString("fr-FR")} 🪙**`,          inline: true },
    )
    .setFooter({ text: `MAI•GESTION • Par ${message.author.tag}` })
    .setTimestamp()] });
}
