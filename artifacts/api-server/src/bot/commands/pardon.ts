import { Message, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { getPunishmentStatus, restoreMember } from "../modules/punishSystem";

export async function pardonCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;

  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("❌ Seuls les administrateurs peuvent utiliser cette commande.").catch(() => {});
    return;
  }

  if (!args[0]) {
    await message.reply("❌ Utilisation : `!pardon @user`").catch(() => {});
    return;
  }

  const targetId = args[0].replace(/[<@!>]/g, "");
  const target = await message.guild.members.fetch(targetId).catch(() => null);

  if (!target) {
    await message.reply("❌ Membre introuvable.").catch(() => {});
    return;
  }

  const status = await getPunishmentStatus(message.guild.id, targetId);
  if (!status) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffcc00)
          .setDescription(`⚠️ ${target} n'est pas sanctionné(e) actuellement.`)
          .setFooter({ text: "MAI•GESTION" }),
      ],
    }).catch(() => {});
    return;
  }

  await restoreMember(message.client, message.guild.id, targetId);
}
