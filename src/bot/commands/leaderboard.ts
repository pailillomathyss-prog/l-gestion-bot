import { Message, EmbedBuilder } from "discord.js";
import { getAllXP } from "../modules/db.js";

export async function leaderboardCommand(message: Message) {
  if (!message.guild) return;
  const all = await getAllXP(message.guild.id);
  const top = all.slice(0, 10);
  const lines = await Promise.all(top.map(async (u, i) => {
    const m = await message.guild!.members.fetch(u.userId).catch(() => null);
    const name = m?.displayName ?? `<@${u.userId}>`;
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
    return `${medal} ${name} — **${u.xp.toLocaleString("fr-FR")} XP** (Nv. ${u.level})`;
  }));
  await message.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🏆 Classement XP")
      .setDescription(lines.length > 0 ? lines.join("\n") : "*Aucune donnée.*")
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
  }).catch(() => {});
}
