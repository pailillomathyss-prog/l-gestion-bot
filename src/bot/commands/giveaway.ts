import { Message, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { launchGiveaway } from "../modules/giveawaySystem";
import { Client } from "discord.js";

let _client: Client | null = null;
export function setGiveawayClient(c: Client) { _client = c; }

export async function giveawayCommand(message: Message, args: string[]) {
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild))
    return message.reply("❌ Seuls les administrateurs peuvent lancer des giveaways.");
  if (!message.guild) return;

  const duration = args[0];
  const prize    = args.slice(1).join(" ");

  if (!duration || !prize)
    return message.reply("❌ Utilisation : `!giveaway [durée] [prix]`\nEx: `!giveaway 1h 500 🪙`");

  if (!_client) return message.reply("❌ Bot non initialisé.");

  const err = await launchGiveaway(message.guild.id, message.channel.id, prize, duration, _client);
  if (err) return message.reply(err);

  const reply = await message.reply({ embeds: [new EmbedBuilder()
    .setColor(0xff69b4).setTitle("🎉 Giveaway lancé !")
    .setDescription(`Le giveaway pour **${prize}** a commencé dans <#${message.channel.id}> !`)
    .setFooter({ text: "MAI•GESTION" }).setTimestamp()] });
  setTimeout(() => reply.delete().catch(() => {}), 5000);
}
