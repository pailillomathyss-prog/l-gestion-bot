import { Message, PermissionFlagsBits, EmbedBuilder } from "discord.js";

export async function banCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
    await message.reply("❌ Permission insuffisante.").catch(() => {});
    return;
  }
  const target = message.mentions.users.first();
  if (!target) { await message.reply("❌ Usage: `!ban @membre [raison]`").catch(() => {}); return; }
  const reason = args.slice(1).join(" ") || "Aucune raison fournie";
  try {
    await message.guild.members.ban(target.id, { reason });
    await message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("🔨 Membre banni")
        .setDescription(`**${target.tag}** a été banni.\nRaison : ${reason}`)
        .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
    }).catch(() => {});
  } catch {
    await message.reply("❌ Impossible de bannir ce membre.").catch(() => {});
  }
}

export async function unbanCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
    await message.reply("❌ Permission insuffisante.").catch(() => {});
    return;
  }
  const id = args[0];
  if (!id) { await message.reply("❌ Usage: `!unban [ID]`").catch(() => {}); return; }
  try {
    await message.guild.members.unban(id);
    await message.reply(`✅ Membre \`${id}\` débanni.`).catch(() => {});
  } catch {
    await message.reply("❌ Impossible de débannir (ID invalide ?).").catch(() => {});
  }
}
