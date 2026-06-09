import { Message, EmbedBuilder } from "discord.js";
import { PermissionFlagsBits } from "discord.js";

export async function helpCommand(message: Message) {
  if (!message.guild || !message.member) return;

  const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

  const publicFields = [
    { name: "📊 `!rank [@membre]`", value: "Affiche ton profil XP ou celui d'un membre.", inline: false },
    { name: "🏆 `!leaderboard`", value: "Classement des 10 meilleurs membres.", inline: false },
    { name: "⚠️ `!warn [@membre]`", value: "Affiche le statut de sanction d'un membre.", inline: false },
    { name: "❓ `!help`", value: "Affiche cette aide.", inline: false },
  ];

  const adminFields = [
    { name: "🔨 `!ban @membre [raison]`", value: "Bannir un membre du serveur.", inline: false },
    { name: "🔓 `!unban [ID]`", value: "Débannir un membre.", inline: false },
    { name: "🔇 `!mute @membre`", value: "Rendre un membre muet.", inline: false },
    { name: "🔊 `!demute @membre`", value: "Retirer le mute d'un membre.", inline: false },
    { name: "🔒 `!lock [#salon]`", value: "Verrouiller un salon.", inline: false },
    { name: "🔓 `!unlock [#salon]`", value: "Déverrouiller un salon.", inline: false },
    { name: "🗑️ `!clear [nombre]`", value: "Supprimer des messages en masse.", inline: false },
    { name: "✅ `!pardon @membre`", value: "Lever manuellement une sanction.", inline: false },
  ];

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("📖 Aide — MAI•GESTION")
    .setDescription("Préfixe des commandes : `!`")
    .addFields(
      { name: "━━━━━━ Commandes publiques ━━━━━━", value: "\u200B" },
      ...publicFields
    );

  if (isAdmin) {
    embed.addFields(
      { name: "━━━━━━ Commandes admin ━━━━━━", value: "\u200B" },
      ...adminFields
    );
  }

  embed
    .setFooter({ text: "MAI•GESTION" })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}
