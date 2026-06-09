import { Message, EmbedBuilder } from "discord.js";
import { getLeaderboard, getRoleName } from "../modules/expSystem";

export async function leaderboardCommand(message: Message) {
  if (!message.guild) return;

  const lb = await getLeaderboard(message.guild.id, 10);

  if (lb.length === 0) {
    await message.reply("❌ Aucun membre classé pour l'instant.").catch(() => {});
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];

  const lines = await Promise.all(
    lb.map(async (entry, i) => {
      const member = await message.guild!.members.fetch(entry.userId).catch(() => null);
      const name = member?.displayName ?? `<@${entry.userId}>`;
      const prefix = medals[i] ?? `**#${i + 1}**`;
      return `${prefix} ${name} — **${entry.xp} XP** · nv ${entry.level}`;
    })
  );

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🏆 Classement XP du serveur")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "MAI•GESTION • Top 10" })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}
