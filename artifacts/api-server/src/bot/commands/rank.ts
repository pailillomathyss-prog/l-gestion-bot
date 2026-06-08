import { Message, EmbedBuilder, GuildMember } from "discord.js";
import {
  getUserData,
  getLeaderboard,
  getRoleName,
  xpForLevel,
  getLevel,
} from "../modules/expSystem";

function progressBar(current: number, total: number, size = 12): string {
  const filled = Math.round((current / total) * size);
  const empty = size - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

export async function rankCommand(message: Message, args: string[]) {
  if (!message.guild) return;

  let target: GuildMember;

  if (args[0]) {
    const mention = args[0].replace(/[<@!>]/g, "");
    const fetched = await message.guild.members.fetch(mention).catch(() => null);
    if (!fetched) {
      await message.reply("❌ Membre introuvable.").catch(() => {});
      return;
    }
    target = fetched;
  } else {
    target = message.member!;
  }

  const data = getUserData(message.guild.id, target.id);
  const level = getLevel(data.xp);
  const xpInLevel = data.xp - xpForLevel(level);
  const xpNeeded = 100; // XP par niveau

  const bar = progressBar(xpInLevel, xpNeeded);
  const role = getRoleName(level);

  // Classement
  const lb = getLeaderboard(message.guild.id, 100);
  const rank = lb.findIndex((u) => u.userId === target.id) + 1;
  const rankStr = rank > 0 ? `#${rank}` : "Non classé";

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setAuthor({
      name: target.displayName,
      iconURL: target.user.displayAvatarURL(),
    })
    .setTitle("📊 Profil XP")
    .addFields(
      { name: "🏅 Niveau", value: `**${level}**`, inline: true },
      { name: "✨ XP Total", value: `**${data.xp}** XP`, inline: true },
      { name: "🏆 Classement", value: rankStr, inline: true },
      {
        name: `Progression vers nv ${level + 1}`,
        value: `\`${bar}\` ${xpInLevel}/${xpNeeded} XP`,
      },
      { name: "🎖️ Rôle actuel", value: role }
    )
    .setFooter({ text: "MAI•GESTION" })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}
