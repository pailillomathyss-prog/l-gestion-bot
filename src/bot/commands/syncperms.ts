import { Message, PermissionFlagsBits } from "discord.js";
import { syncChannelPermissions } from "../modules/rulesGate";

export async function syncPermsCommand(message: Message) {
  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator))
    return message.reply("❌ Commande réservée aux administrateurs.");
  if (!message.guild) return;

  const result = await syncChannelPermissions(message.guild);
  await message.reply(result);
}
