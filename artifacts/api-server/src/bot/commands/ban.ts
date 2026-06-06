import { Message, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { logBan, logUnban } from "../modules/modLogs";

export async function banCommand(message: Message, args: string[]) {
  if (!message.member?.permissions.has(PermissionFlagsBits.BanMembers)) {
    return message.reply("❌ Tu n'as pas la permission de bannir.");
  }

  const target = message.mentions.members?.first();
  if (!target) return message.reply("❌ Mentionne un membre à bannir. Ex: `!ban @user raison`");
  if (!target.bannable) return message.reply("❌ Je ne peux pas bannir ce membre.");

  const reason = args.slice(1).join(" ") || "Aucune raison fournie";

  await target.send({
    embeds: [
      new EmbedBuilder().setColor(0xff0000).setTitle("🔨 Tu as été banni")
        .addFields(
          { name: "Serveur", value: message.guild!.name },
          { name: "Raison", value: reason },
          { name: "Modérateur", value: message.author.tag }
        ).setTimestamp(),
    ],
  }).catch(() => {});

  await target.ban({ reason: `${message.author.tag}: ${reason}` });
  await logBan(message.guild!, target.user, message.author, reason);

  await message.channel.send({
    embeds: [
      new EmbedBuilder().setColor(0xff0000).setTitle("🔨 Membre banni")
        .addFields(
          { name: "Utilisateur", value: `${target.user.tag} (${target.id})` },
          { name: "Raison", value: reason },
          { name: "Modérateur", value: message.author.tag }
        ).setThumbnail(target.user.displayAvatarURL()).setTimestamp(),
    ],
  });
}

export async function unbanCommand(message: Message, args: string[]) {
  if (!message.member?.permissions.has(PermissionFlagsBits.BanMembers)) {
    return message.reply("❌ Tu n'as pas la permission de débannir.");
  }

  const userId = args[0];
  if (!userId || !/^\d{17,19}$/.test(userId)) {
    return message.reply("❌ Fournis l'ID de l'utilisateur. Ex: `!unban 123456789012345678 raison`");
  }

  const reason = args.slice(1).join(" ") || "Aucune raison fournie";

  try {
    const bans = await message.guild!.bans.fetch();
    const banned = bans.get(userId);
    if (!banned) return message.reply("❌ Cet utilisateur n'est pas banni.");

    await message.guild!.members.unban(userId, `${message.author.tag}: ${reason}`);
    await logUnban(message.guild!, banned.user, message.author, reason);

    await message.channel.send({
      embeds: [
        new EmbedBuilder().setColor(0x57f287).setTitle("✅ Membre débanni")
          .addFields(
            { name: "Utilisateur", value: `${banned.user.tag} (${userId})` },
            { name: "Raison", value: reason },
            { name: "Modérateur", value: message.author.tag }
          ).setThumbnail(banned.user.displayAvatarURL()).setTimestamp(),
      ],
    });
  } catch {
    await message.reply("❌ Une erreur est survenue lors du débannissement.");
  }
}
