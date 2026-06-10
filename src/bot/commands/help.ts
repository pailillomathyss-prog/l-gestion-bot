import { Message, EmbedBuilder, PermissionFlagsBits } from "discord.js";

export async function helpCommand(message: Message) {
  if (!message.guild || !message.member) return;

  const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

  const publicFields = [
    { name: "📊 `!rank [@membre]`",       value: "Affiche ton profil XP ou celui d'un membre.", inline: false },
    { name: "🏆 `!leaderboard`",          value: "Classement des 10 meilleurs membres.", inline: false },
    { name: "💰 `!balance`",              value: "Affiche ton solde de pièces.", inline: false },
    { name: "🧸 `!shop`",                 value: "Affiche la boutique de rôles.", inline: false },
    { name: "🛒 `!buy [nom du rôle]`",    value: "Acheter un rôle dans la boutique.", inline: false },
    { name: "🪙 `!coinflip [mise]`",      value: "Pile ou face. Double ou rien (50/50).", inline: false },
    { name: "🎰 `!slot [mise]`",          value: "Machine à sous. Deux identiques = x1.5, trois = x2 à x20.", inline: false },
    { name: "🎁 `!daily`",               value: "Réclame ta récompense quotidienne (coins ou XP) avec streak.", inline: false },
    { name: "🎯 `!quest`",               value: "Affiche ta progression sur la quête active.", inline: false },
    { name: "✅ `!claim`",               value: "Réclamer la récompense de la quête active.", inline: false },
    { name: "⚠️ `!warn [@membre]`",      value: "Affiche le statut de sanction d'un membre.", inline: false },
    { name: "❓ `!help`",               value: "Affiche cette aide.", inline: false },
  ];

  const adminFields = [
    { name: "🔨 `!ban @membre [raison]`",                       value: "Bannir un membre.", inline: false },
    { name: "🔓 `!unban [ID]`",                                 value: "Débannir un membre.", inline: false },
    { name: "🔇 `!mute @membre`",                               value: "Rendre un membre muet.", inline: false },
    { name: "🔊 `!demute @membre`",                             value: "Retirer le mute.", inline: false },
    { name: "🔒 `!lock [#salon]`",                              value: "Verrouiller un salon.", inline: false },
    { name: "🔓 `!unlock [#salon]`",                            value: "Déverrouiller un salon.", inline: false },
    { name: "🗑️ `!clear [nombre]`",                            value: "Supprimer des messages en masse.", inline: false },
    { name: "✅ `!pardon @membre`",                             value: "Lever manuellement une sanction.", inline: false },
    { name: "🎉 `!giveaway [prix] [durée]`",                   value: "Lancer un giveaway (ex: `!giveaway Nitro 1h`).", inline: false },
    { name: "🎯 `!event [type] [cible] [récompense] [jours]`", value: "Lancer une quête communautaire custom.\nTypes : `messages`, `xp`, `vocal`\nEx : `!event messages 500 1000 7`", inline: false },
    { name: "🔄 `!syncperms`",                                  value: "Synchroniser les permissions des salons.", inline: false },
    { name: "📋 `!postrules`",                                  value: "Afficher les règles des jeux dans le salon règles.", inline: false },
  ];

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("📖 Aide — MAI•GESTION")
    .setDescription("Préfixe : `!` — Toutes les commandes sont aussi disponibles en `/`")
    .addFields({ name: "━━━━━━ Commandes publiques ━━━━━━", value: "\u200B" }, ...publicFields);

  if (isAdmin) {
    embed.addFields({ name: "━━━━━━ Commandes admin ━━━━━━", value: "\u200B" }, ...adminFields);
  }

  embed.setFooter({ text: "MAI•GESTION" }).setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}
