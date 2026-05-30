import { Message, PermissionFlagsBits, EmbedBuilder } from "discord.js";
  import { logUnban } from "../modules/modLogs";

  export async function debanCommand(message: Message, args: string[]) {
    if (!message.guild) return;
    if (!message.member?.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply("❌ Tu n'as pas la permission de débannir des membres.");
    }

    const userId = args[0];
    if (!userId || !/^\d{17,19}$/.test(userId)) {
      return message.reply("❌ Fournis un ID valide. Ex: `!deban 123456789012345678 raison`");
    }

    const reason = args.slice(1).join(" ") || "Aucune raison fournie";

    try {
      const bans = await message.guild.bans.fetch();
      const banned = bans.get(userId);
      if (!banned) {
        return message.reply("❌ Cet utilisateur n'est pas banni.");
      }

      await message.guild.members.unban(userId, `${message.author.tag}: ${reason}`);

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Membre débanni")
        .addFields(
          { name: "Utilisateur", value: `${banned.user.tag} (${userId})` },
          { name: "Raison", value: reason },
          { name: "Modérateur", value: message.author.tag }
        )
        .setThumbnail(banned.user.displayAvatarURL())
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
      await message.delete().catch(() => {});

      await logUnban(message.guild, banned.user, message.author, reason);
    } catch {
      await message.reply("❌ Une erreur est survenue lors du débannissement.");
    }
  }
  