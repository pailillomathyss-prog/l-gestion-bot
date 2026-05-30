import { Message, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { logBan } from "../modules/modLogs";

export async function banCommand(message: Message, args: string[]) {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.BanMembers)) {
    return message.reply("❌ Tu n'as pas la permission de bannir des membres.");
  }

  const targetUser =
    message.mentions.members?.first() ||
    (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null);

  if (!targetUser) {
    return message.reply("❌ Mentionne un membre valide à bannir. Ex: `!ban @user raison`");
  }

  if (!targetUser.bannable) {
    return message.reply("❌ Je ne peux pas bannir ce membre (rôle trop élevé ou permissions insuffisantes).");
  }

  const reason = args.slice(1).join(" ") || "Aucune raison fournie";

  try {
    await targetUser.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("🔨 Tu as été banni")
          .addFields(
            { name: "Serveur", value: message.guild.name },
            { name: "Raison", value: reason },
            { name: "Modérateur", value: message.author.tag }
          )
          .setTimestamp(),
      ],
    }).catch(() => {});

    await targetUser.ban({ reason: `${message.author.tag}: ${reason}` });

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🔨 Membre banni")
      .addFields(
        { name: "Utilisateur", value: `${targetUser.user.tag} (${targetUser.id})` },
        { name: "Raison", value: reason },
        { name: "Modérateur", value: message.author.tag }
      )
      .setThumbnail(targetUser.user.displayAvatarURL())
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    await message.delete().catch(() => {});

    await logBan(message.guild, targetUser.user, message.author, reason);
  } catch {
    await message.reply("❌ Une erreur est survenue lors du bannissement.");
  }
}
