import {
  Guild,
  GuildMember,
  Message,
  MessageType,
  EmbedBuilder,
  TextChannel,
  ChannelType,
} from "discord.js";
import { logger } from "../../lib/logger";

// Nom exact du salon (caractère ・ = U+30FB)
const BOOST_CHANNEL_NAME = "💎・boost";

async function getBoostChannel(guild: Guild): Promise<TextChannel | null> {
  const ch = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === BOOST_CHANNEL_NAME
  ) as TextChannel | undefined;
  return ch ?? null;
}

/**
 * Détecte un boost via GuildMemberUpdate (premiumSince : null → date)
 */
export async function handleBoostUpdate(
  oldMember: GuildMember,
  newMember: GuildMember
) {
  const wasBooster = Boolean(oldMember.premiumSince);
  const isBooster  = Boolean(newMember.premiumSince);
  if (!wasBooster && isBooster) {
    await sendBoostAnnounce(newMember.guild, newMember);
  }
}

/**
 * Détecte un boost via les messages système Discord
 */
export async function handleBoostMessage(message: Message) {
  if (!message.guild) return;
  const boostTypes = [
    MessageType.UserPremiumGuildSubscription,
    MessageType.UserPremiumGuildSubscriptionTier1,
    MessageType.UserPremiumGuildSubscriptionTier2,
    MessageType.UserPremiumGuildSubscriptionTier3,
  ];
  if (!boostTypes.includes(message.type)) return;
  if (!message.member) return;
  await sendBoostAnnounce(message.guild, message.member);
}

async function sendBoostAnnounce(guild: Guild, member: GuildMember) {
  const ch = await getBoostChannel(guild);
  if (!ch) {
    logger.warn(`Salon "${BOOST_CHANNEL_NAME}" introuvable sur ${guild.name}`);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xff73fa)
    .setTitle("💎 Nouveau Boost !")
    .setDescription(
      `${member} vient de **booster** le serveur ! 🎉\nMerci pour ton soutien, tu es incroyable ! 💜`
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Niveau du serveur", value: `Niveau **${guild.premiumTier}**`, inline: true },
      { name: "Nombre de boosts",  value: `**${guild.premiumSubscriptionCount ?? 0}** boost(s)`, inline: true }
    )
    .setFooter({ text: "MAI•GESTION" })
    .setTimestamp();

  try {
    await ch.send({ content: `${member}`, embeds: [embed] });
    logger.info(`Annonce boost envoyée pour ${member.user.tag}`);
  } catch (err) {
    logger.warn({ err }, "Impossible d'envoyer l'annonce boost");
  }
}
