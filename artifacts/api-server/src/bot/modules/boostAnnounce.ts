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

const BOOST_CHANNEL_NAME = "💎 • boost";

async function getBoostChannel(guild: Guild): Promise<TextChannel | null> {
  const ch = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      c.name === BOOST_CHANNEL_NAME
  ) as TextChannel | undefined;
  return ch ?? null;
}

/**
 * Appelle cette fonction dans l'événement GuildMemberUpdate
 * pour détecter un nouveau boost (premiumSince change de null → date)
 */
export async function handleBoostUpdate(
  oldMember: GuildMember,
  newMember: GuildMember
) {
  const wasBooster = Boolean(oldMember.premiumSince);
  const isBooster = Boolean(newMember.premiumSince);

  if (!wasBooster && isBooster) {
    await sendBoostAnnounce(newMember.guild, newMember);
  }
}

/**
 * Appelle cette fonction dans l'événement MessageCreate
 * pour capter les messages système de boost Discord
 */
export async function handleBoostMessage(message: Message) {
  if (!message.guild) return;
  if (
    message.type !== MessageType.UserPremiumGuildSubscription &&
    message.type !== MessageType.UserPremiumGuildSubscriptionTier1 &&
    message.type !== MessageType.UserPremiumGuildSubscriptionTier2 &&
    message.type !== MessageType.UserPremiumGuildSubscriptionTier3
  ) return;

  const member = message.member;
  if (!member) return;
  await sendBoostAnnounce(message.guild, member);
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
      { name: "Nombre de boosts", value: `**${guild.premiumSubscriptionCount ?? 0}** boost(s)`, inline: true }
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
