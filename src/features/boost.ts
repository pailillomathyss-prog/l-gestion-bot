import { GuildMember, EmbedBuilder, ChannelType, TextChannel } from "discord.js";

function boostChannel(guild: import("discord.js").Guild): TextChannel | null {
  return guild.channels.cache.find(
    c => c.type === ChannelType.GuildText && (c.name.toLowerCase().includes("boost") || c.name.includes("💎"))
  ) as TextChannel | null ?? null;
}

export async function handleBoost(oldMember: GuildMember, newMember: GuildMember) {
  if (!oldMember.premiumSince && newMember.premiumSince) {
    const ch = boostChannel(newMember.guild);
    if (!ch) return;
    await ch.send({ embeds: [
      new EmbedBuilder()
        .setColor(0xff73fa)
        .setTitle("💎 Nouveau Boost !")
        .setDescription(`**${newMember.displayName}** vient de booster le serveur ! 🚀\n\nMerci infiniment pour ton soutien ! 💜`)
        .setThumbnail(newMember.user.displayAvatarURL())
        .addFields({ name: "Total boosts", value: `**${newMember.guild.premiumSubscriptionCount ?? 0}** 💎`, inline: true })
        .setFooter({ text: "MAI•GESTION" }).setTimestamp()
    ] }).catch(() => {});
  } else if (oldMember.premiumSince && !newMember.premiumSince) {
    const ch = boostChannel(newMember.guild);
    if (!ch) return;
    await ch.send({ embeds: [
      new EmbedBuilder()
        .setColor(0x999999)
        .setDescription(`💔 **${newMember.displayName}** n'est plus booster. Merci pour ton soutien ! 🙏`)
        .setFooter({ text: "MAI•GESTION" }).setTimestamp()
    ] }).catch(() => {});
  }
}
