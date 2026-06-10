import { GuildMember, EmbedBuilder, TextChannel, ChannelType, Message } from "discord.js";
import { logger } from "../../lib/logger.js";

function findBoostChannel(guild: import("discord.js").Guild): TextChannel | null {
  return guild.channels.cache.find(
    ch => ch.type === ChannelType.GuildText &&
      (ch.name.toLowerCase().includes("boost") || ch.name.includes("💎"))
  ) as TextChannel | null ?? null;
}

export async function handleBoostUpdate(oldMember: GuildMember, newMember: GuildMember) {
  const oldBoosting = oldMember.premiumSince;
  const newBoosting = newMember.premiumSince;

  if (!oldBoosting && newBoosting) {
    // Nouveau boost
    const ch = findBoostChannel(newMember.guild);
    if (!ch) return;

    const embed = new EmbedBuilder()
      .setColor(0xff73fa)
      .setTitle("💎 Nouveau Boost !")
      .setDescription(`**${newMember.displayName}** vient de booster le serveur ! 🚀\n\nMerci infiniment pour ton soutien ! 💜`)
      .setThumbnail(newMember.user.displayAvatarURL())
      .addFields({
        name: "Total de boosts",
        value: `**${newMember.guild.premiumSubscriptionCount ?? 0}** 💎`,
        inline: true,
      })
      .setFooter({ text: "MAI•GESTION • Merci pour ton soutien !" })
      .setTimestamp();

    await ch.send({ embeds: [embed] }).catch(err =>
      logger.warn({ err }, "Impossible d'annoncer le boost")
    );
  } else if (oldBoosting && !newBoosting) {
    // Fin de boost
    const ch = findBoostChannel(newMember.guild);
    if (!ch) return;

    const embed = new EmbedBuilder()
      .setColor(0x999999)
      .setTitle("💔 Fin de Boost")
      .setDescription(`**${newMember.displayName}** n'est plus booster du serveur.\nNous espérons te revoir bientôt ! 🙏`)
      .setFooter({ text: "MAI•GESTION" })
      .setTimestamp();

    await ch.send({ embeds: [embed] }).catch(() => {});
  }
}

export async function handleBoostMessage(message: Message) {
  // Détection des messages système de boost Discord
  if (message.type === 8 /* MessageType.UserPremiumGuildSubscription */) {
    const ch = findBoostChannel(message.guild!);
    if (!ch) return;

    const embed = new EmbedBuilder()
      .setColor(0xff73fa)
      .setTitle("💎 Boost reçu !")
      .setDescription(`**${message.author.username}** a boosté le serveur ! 🎉`)
      .setThumbnail(message.author.displayAvatarURL())
      .setFooter({ text: "MAI•GESTION" })
      .setTimestamp();

    await ch.send({ embeds: [embed] }).catch(() => {});
  }
}
