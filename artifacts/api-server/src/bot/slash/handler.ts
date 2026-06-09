import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ChannelType,
  TextChannel,
  GuildMember,
} from "discord.js";
import { getCoins } from "../modules/db";
import {
  buildGenericShopEmbed,
  buildGenericShopComponents,
  buildPersonalShopEmbed,
} from "../commands/shop";

export async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
  const { commandName, guild, member } = interaction;

  if (!guild || !member) {
    await interaction.reply({ content: "❌ Cette commande n'est disponible qu'en serveur.", ephemeral: true });
    return;
  }

  const guildMember = member as GuildMember;

  switch (commandName) {
    case "shop": {
      const balance = await getCoins(guild.id, interaction.user.id);
      const embed = buildPersonalShopEmbed(guildMember, balance);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "balance": {
      const balance = await getCoins(guild.id, interaction.user.id);
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("💰 Ton solde")
        .setDescription(`**${balance.toLocaleString("fr-FR")} 🪙**`)
        .setFooter({ text: "MAI•GESTION • Gagne des pièces en chattant, en vocal et en faisant des quêtes !" })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "postshop": {
      if (interaction.channel?.type !== ChannelType.GuildText) {
        await interaction.reply({ content: "❌ Utilise cette commande dans un salon texte.", ephemeral: true });
        return;
      }
      const embed = buildGenericShopEmbed();
      const components = buildGenericShopComponents();
      await (interaction.channel as TextChannel).send({ embeds: [embed], components });
      await interaction.reply({ content: "✅ Panneau de boutique posté !", ephemeral: true });
      break;
    }

    default:
      await interaction.reply({ content: "❌ Commande inconnue.", ephemeral: true });
  }
}
