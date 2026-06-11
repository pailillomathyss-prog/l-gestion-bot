import { Message, EmbedBuilder, PermissionFlagsBits } from "discord.js";

export async function helpCommand(message: Message) {
  if (!message.guild || !message.member) return;
  const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("📋 Aide — MAI•GESTION")
    .addFields(
      {
        name: "⭐ XP & Niveaux",
        value: "`!rank [@membre]` — Voir son profil XP\n`!leaderboard` — Top 10 classement",
        inline: false,
      },
      {
        name: "💰 Économie",
        value: "`!balance [@membre]` — Voir son solde\n`!shop` — Voir la boutique\n`!daily` → Bouton dans le salon daily\n`!coinflip [mise]` — Pile ou Face\n`!slot [mise]` — Machine à sous",
        inline: false,
      },
      {
        name: "🎉 Giveaway",
        value: isAdmin ? "`!giveaway [durée] [prix]` — Lancer un giveaway" : "❌ Admin seulement",
        inline: false,
      },
      ...(isAdmin ? [{
        name: "🛡️ Modération (admins)",
        value: "`!ban @user [raison]` | `!unban [ID] [raison]`\n`!mute @user [durée] [raison]` | `!demute @user`\n`!lock [#salon]` | `!unlock [#salon]`\n`!clear [1-100]` | `!syncperms` | `!restorexp @user [xp]`\n`!addcoins [@membre] [montant]` — Ajouter/retirer des pièces",
        inline: false,
      }] : []),
      {
        name: "🎮 Jeux (boutons)",
        value: "Coin Flip | Slots | Blackjack | Duel | Gacha → Dans le salon 🎮・jeux",
        inline: false,
      },
      {
        name: "🎁 Jackpot",
        value: "5% de chaque perte au casino → Tirage hebdomadaire dans 🎁・jackpot",
        inline: false,
      },
    )
    .setFooter({ text: "MAI•GESTION • Utilise aussi les commandes / disponibles !" })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}
