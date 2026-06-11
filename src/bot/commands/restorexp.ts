import { Message, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { upsertXP, getXP } from "../modules/db";
import { xpToLevel } from "../modules/expSystem";

export async function restoreXpCommand(message: Message, args: string[]) {
  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator))
    return message.reply("❌ Commande réservée aux administrateurs.");
  if (!message.guild) return;

  const target = message.mentions.members?.first();
  const amount = parseInt(args[1] ?? "");

  if (!target) return message.reply("❌ Mentionne un membre. Ex: `!restorexp @user 5000`");
  if (isNaN(amount) || amount <= 0) return message.reply("❌ Fournis un montant valide.");

  const data    = await getXP(message.guild.id, target.id);
  const newXP   = data.xp + amount;
  const newLvl  = xpToLevel(newXP);

  await upsertXP(message.guild.id, target.id, newXP, newLvl, data.lastMessage);

  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(0x57f287).setTitle("✅ XP restauré")
    .addFields(
      { name: "Utilisateur", value: `${target.displayName}`, inline: true },
      { name: "XP ajouté",   value: `+${amount.toLocaleString("fr-FR")} XP`, inline: true },
      { name: "XP total",    value: `${newXP.toLocaleString("fr-FR")} XP`, inline: true },
      { name: "Niveau",      value: `${newLvl}`, inline: true },
    )
    .setFooter({ text: "MAI•GESTION" }).setTimestamp()] });
}
