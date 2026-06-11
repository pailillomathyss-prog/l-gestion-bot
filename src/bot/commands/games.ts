import { Message, EmbedBuilder, ChannelType } from "discord.js";
import { getCoins, addCoins } from "../modules/db";
import { contributeJackpot } from "../modules/jackpot";

function isGamesChannel(name: string) {
  return name.toLowerCase().includes("jeux") || name.toLowerCase().includes("games");
}

export async function coinflipCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;
  if (!isGamesChannel((message.channel as any).name ?? "")) {
    return message.reply("❌ Utilise `!coinflip` uniquement dans le salon jeux.").then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  const bet = parseInt(args[0] ?? "");
  if (isNaN(bet) || bet <= 0) return message.reply("❌ Fournis une mise. Ex: `!coinflip 100`");

  const bal = await getCoins(message.guild.id, message.author.id);
  if (bal < bet) return message.reply(`❌ Pas assez de pièces ! Tu as **${bal} 🪙**.`);

  const win  = Math.random() < 0.5;
  const face = Math.random() < 0.5 ? "🪙 Face" : "🪙 Pile";

  if (win) {
    await addCoins(message.guild.id, message.author.id, bet);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("🪙 Coin Flip — Victoire !")
      .setDescription(`**${face}** — Tu gagnes **+${bet} 🪙** !`)
      .addFields({ name: "💰 Nouveau solde", value: `**${bal + bet} 🪙**`, inline: true })
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()] });
  } else {
    await addCoins(message.guild.id, message.author.id, -bet);
    await contributeJackpot(message.guild.id, bet);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("🪙 Coin Flip — Défaite !")
      .setDescription(`**${face}** — Tu perds **-${bet} 🪙** !`)
      .addFields({ name: "💰 Nouveau solde", value: `**${Math.max(0, bal - bet)} 🪙**`, inline: true })
      .setFooter({ text: "MAI•GESTION • 5% vont au jackpot !" }).setTimestamp()] });
  }
}

export async function slotCommand(message: Message, args: string[]) {
  if (!message.guild) return;
  if (!isGamesChannel((message.channel as any).name ?? "")) {
    return message.reply("❌ Utilise `!slot` uniquement dans le salon jeux.").then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  const bet = parseInt(args[0] ?? "");
  if (isNaN(bet) || bet <= 0) return message.reply("❌ Fournis une mise. Ex: `!slot 100`");

  const bal = await getCoins(message.guild.id, message.author.id);
  if (bal < bet) return message.reply(`❌ Pas assez de pièces ! Tu as **${bal} 🪙**.`);

  const SYMBOLS = ["🍒", "🍋", "🍊", "⭐", "💎", "7️⃣"];
  const MULT: Record<string, number> = { "🍒": 2, "🍋": 2.5, "🍊": 3, "⭐": 5, "💎": 10, "7️⃣": 20 };
  const s = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!;
  const r = [s(), s(), s()];

  let mult = 0;
  if (r[0] === r[1] && r[1] === r[2]) mult = MULT[r[0]!] ?? 2;
  else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) mult = 0.5;

  if (mult >= 1) {
    const gain = Math.floor(bet * mult);
    await addCoins(message.guild.id, message.author.id, gain);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("🎰 Slots — Victoire !")
      .setDescription(`${r.join(" | ")}\n\n🎉 **×${mult}** — Tu gagnes **+${gain} 🪙** !`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()] });
  } else if (mult === 0.5) {
    const loss = Math.floor(bet * 0.5);
    await addCoins(message.guild.id, message.author.id, -loss);
    await contributeJackpot(message.guild.id, loss);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xffa500).setTitle("🎰 Slots — Presque !")
      .setDescription(`${r.join(" | ")}\n\n2 identiques — Tu perds **-${loss} 🪙** (×0.5)`)
      .setFooter({ text: "MAI•GESTION • 5% vont au jackpot !" }).setTimestamp()] });
  } else {
    await addCoins(message.guild.id, message.author.id, -bet);
    await contributeJackpot(message.guild.id, bet);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("🎰 Slots — Défaite !")
      .setDescription(`${r.join(" | ")}\n\nAucune combinaison — Tu perds **-${bet} 🪙**`)
      .setFooter({ text: "MAI•GESTION • 5% vont au jackpot !" }).setTimestamp()] });
  }
}
