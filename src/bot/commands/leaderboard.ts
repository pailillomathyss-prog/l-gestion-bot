import { Message, EmbedBuilder, ChannelType } from "discord.js";
import { getAllXP, getCoins } from "../modules/db";
import { xpToLevel, topMilestone } from "../modules/expSystem";

export async function leaderboardCommand(message: Message) {
  if (!message.guild) return;

  const top = await getAllXP(message.guild.id);
  const top10 = top.slice(0, 10);

  if (!top10.length) {
    await message.reply("❌ Aucune donnée de classement disponible.");
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines = await Promise.all(top10.map(async (u, i) => {
    const medal = medals[i] ?? `**${i + 1}.**`;
    let name: string;
    try {
      const member = await message.guild!.members.fetch(u.userId).catch(() => null);
      name = member?.displayName ?? `<@${u.userId}>`;
    } catch { name = `<@${u.userId}>`; }

    const ms = topMilestone(u.level);
    return `${medal} **${name}** — Nv. **${u.level}** | **${u.xp.toLocaleString("fr-FR")} XP**${ms ? ` *(${ms.name})*` : ""}`;
  }));

  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🏆 Classement XP — MAI•GESTION")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `MAI•GESTION • ${top.length} joueur(s) au total` })
    .setTimestamp()] });
}
