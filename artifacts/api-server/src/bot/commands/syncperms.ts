import { Message, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { syncChannelPermissions } from "../modules/rulesGate";

export async function syncPermsCommand(message: Message) {
  if (!message.guild || !message.member) return;

  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("❌ Seuls les administrateurs peuvent utiliser cette commande.").catch(() => {});
    return;
  }

  const loading = await message.reply("⏳ Synchronisation des permissions en cours...").catch(() => null);

  try {
    await syncChannelPermissions(message.guild);
    const embed = new EmbedBuilder()
      .setColor(0x00cc66)
      .setTitle("✅ Permissions synchronisées")
      .setDescription("Tous les salons ont été mis à jour.\nLes membres punis voient uniquement ⚖️•JUGEMENT.")
      .setFooter({ text: "MAI•GESTION" })
      .setTimestamp();

    if (loading) await loading.edit({ content: "", embeds: [embed] }).catch(() => {});
    else await message.reply({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    if (loading) await loading.edit("❌ Erreur lors de la synchronisation.").catch(() => {});
  }
}
