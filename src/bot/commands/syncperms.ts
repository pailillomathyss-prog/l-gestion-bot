import { Message, PermissionFlagsBits } from "discord.js";
import { syncChannelPermissions } from "../modules/rulesGate.js";

export async function syncPermsCommand(message: Message) {
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("❌ Admin seulement.").catch(() => {});
    return;
  }
  await message.reply("⏳ Synchronisation en cours...").catch(() => {});
  await syncChannelPermissions(message.guild);
  await message.reply("✅ Permissions synchronisées !").catch(() => {});
}
