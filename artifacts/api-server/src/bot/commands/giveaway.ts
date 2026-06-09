import { Message, EmbedBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { launchGiveaway } from "../modules/giveawaySystem";

export async function giveawayCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;

  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("❌ Seuls les administrateurs peuvent lancer un giveaway.").catch(() => {});
    return;
  }

  if (message.channel.type !== ChannelType.GuildText ||
      !message.channel.name.toLowerCase().includes("giveaway") &&
      !message.channel.name.includes("⚡")) {
    await message.reply("❌ Les giveaways doivent être lancés depuis le salon **giveaway** !").catch(() => {});
    return;
  }

  if (args.length < 2) {
    await message.reply("❌ Utilisation : `!giveaway [durée] [lot]`\nExemple : `!giveaway 2h Nitro Classic`").catch(() => {});
    return;
  }

  const duration = args[0];
  const prize = args.slice(1).join(" ");

  const result = await launchGiveaway(message.client, message.channel.id, message.guild.id, prize, duration);

  if (!result.success) {
    await message.reply(result.message).catch(() => {});
  } else {
    await message.delete().catch(() => {});
  }
}
