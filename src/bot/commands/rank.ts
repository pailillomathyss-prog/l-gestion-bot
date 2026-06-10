import { Message, EmbedBuilder, ChannelType } from "discord.js";
import { getUserData } from "../modules/expSystem.js";
import { getCoins, getAllXP } from "../modules/db.js";
import { levelToXP } from "../modules/expSystem.js";

const CMDS_CHANNEL_KEYWORDS = ["cmds", "commandes", "bot", "🌐"];

function isAllowedChannel(message: Message): boolean {
  const name = (message.channel as { name?: string }).name?.toLowerCase() ?? "";
  return CMDS_CHANNEL_KEYWORDS.some(kw => name.includes(kw));
}

export async function rankCommand(message: Message, args: string[]) {
  if (!message.guild) return;

  if (!isAllowedChannel(message)) {
    const botCh = message.guild.channels.cache.find(
      ch => ch.type === ChannelType.GuildText && CMDS_CHANNEL_KEYWORDS.some(kw => ch.name.toLowerCase().includes(kw))
    );
    const hint = botCh ? `Utilise <#${botCh.id}> pour cette commande.` : "Cette commande n'est pas autorisée ici.";
    const w = await message.reply(`❌ ${hint}`).catch(() => null);
    if (w) setTimeout(() => w.delete().catch(() => {}), 5000);
    return;
  }

  const target = message.mentions.members?.first() ?? message.member;
  if (!target) return;

  const data = await getUserData(message.guild.id, target.id);
  const coins = await getCoins(message.guild.id, target.id);
  const all = await getAllXP(message.guild.id);
  const rank = all.findIndex(u => u.userId === target.id) + 1;
  const nextXP = levelToXP(data.level + 1);
  const progress = Math.min(100, Math.floor((data.xp / nextXP) * 100));
  const bar = "█".repeat(Math.floor(progress / 7)) + "░".repeat(14 - Math.floor(progress / 7));

  await message.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`📊 Profil de ${target.displayName}`)
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: "🏆 Niveau", value: `**${data.level}**`, inline: true },
        { name: "⭐ XP", value: `**${data.xp.toLocaleString("fr-FR")}**`, inline: true },
        { name: "📈 Rang", value: `**#${rank || "?"}**`, inline: true },
        { name: "💰 Pièces", value: `**${coins.toLocaleString("fr-FR")} 🪙**`, inline: true },
        { name: `Progrès → Nv.${data.level + 1}`, value: `\`${bar}\` ${progress}%\n${data.xp.toLocaleString("fr-FR")} / ${nextXP.toLocaleString("fr-FR")} XP`, inline: false },
      )
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
  }).catch(() => {});
}
