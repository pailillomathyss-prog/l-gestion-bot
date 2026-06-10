import { Message, PermissionFlagsBits } from "discord.js";
import { launchGiveaway } from "../modules/giveawaySystem.js";

export async function giveawayCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("❌ Admin seulement.").catch(() => {});
    return;
  }
  if (args.length < 2) {
    await message.reply("❌ Usage: `!giveaway [prix] [durée]`\nExemple: `!giveaway Nitro 24h` ou `!giveaway \"500 coins\" 1h`").catch(() => {});
    return;
  }
  const duration = args[args.length - 1];
  const prize = args.slice(0, -1).join(" ");
  const loading = await message.reply("⏳ Lancement du giveaway...").catch(() => null);
  const result = await launchGiveaway(message.client, message.channel.id, message.guild.id, prize, duration);
  await loading?.edit(result.success ? `✅ Giveaway lancé pour **${prize}** !` : `❌ ${result.message}`).catch(() => {});
}
