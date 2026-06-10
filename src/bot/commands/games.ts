import { Message, EmbedBuilder, ChannelType } from "discord.js";
import { getCoins, addCoins } from "../modules/db.js";

const GAME_CHANNEL_KEYWORDS = ["jeux", "game", "👾", "casino"];

function isGameChannel(message: Message): boolean {
  const name = (message.channel as { name?: string }).name?.toLowerCase() ?? "";
  return GAME_CHANNEL_KEYWORDS.some(kw => name.includes(kw));
}

function getGameChannelHint(message: Message): string {
  const ch = message.guild?.channels.cache.find(
    c => c.type === ChannelType.GuildText && GAME_CHANNEL_KEYWORDS.some(kw => c.name.toLowerCase().includes(kw))
  );
  return ch ? `Utilise <#${ch.id}> pour les jeux.` : "Utilise le salon jeux pour les commandes de jeux.";
}

export async function coinflipCommand(message: Message, args: string[]) {
  if (!message.guild) return;
  if (!isGameChannel(message)) {
    const w = await message.reply(`❌ ${getGameChannelHint(message)}`).catch(() => null);
    if (w) setTimeout(() => w.delete().catch(() => {}), 5000);
    return;
  }
  const bet = parseInt(args[0]);
  if (isNaN(bet) || bet < 1) { await message.reply("❌ Usage: `!coinflip [mise minimum 1]`").catch(() => {}); return; }
  const balance = await getCoins(message.guild.id, message.author.id);
  if (balance < bet) { await message.reply(`❌ Solde insuffisant. Tu as **${balance} 🪙**.`).catch(() => {}); return; }
  const win = Math.random() < 0.5;
  const newBal = await addCoins(message.guild.id, message.author.id, win ? bet : -bet);
  await message.reply({
    embeds: [new EmbedBuilder()
      .setColor(win ? 0x00cc66 : 0xff4444)
      .setTitle(win ? "🟡 Face — Victoire !" : "⚫ Pile — Défaite !")
      .setDescription(win ? `**+${bet} 🪙** → Solde : **${newBal} 🪙**` : `**-${bet} 🪙** → Solde : **${newBal} 🪙**`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
  }).catch(() => {});
}

export async function slotCommand(message: Message, args: string[]) {
  if (!message.guild) return;
  if (!isGameChannel(message)) {
    const w = await message.reply(`❌ ${getGameChannelHint(message)}`).catch(() => null);
    if (w) setTimeout(() => w.delete().catch(() => {}), 5000);
    return;
  }
  const bet = parseInt(args[0]);
  if (isNaN(bet) || bet < 1) { await message.reply("❌ Usage: `!slot [mise minimum 1]`").catch(() => {}); return; }
  const balance = await getCoins(message.guild.id, message.author.id);
  if (balance < bet) { await message.reply(`❌ Solde insuffisant. Tu as **${balance} 🪙**.`).catch(() => {}); return; }
  const SYMBOLS = ["🍒", "🍋", "🍊", "⭐", "💎", "7️⃣"];
  const MULT: Record<string, number> = { "🍒": 2, "🍋": 2.5, "🍊": 3, "⭐": 5, "💎": 10, "7️⃣": 20 };
  const reels = [0, 1, 2].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
  let gain = 0; let resultText = "";
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    gain = Math.floor(bet * MULT[reels[0]]); resultText = `🎉 **JACKPOT !** ×${MULT[reels[0]]} → **+${gain} 🪙**`;
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    gain = Math.floor(bet * 1.5); resultText = `✨ **2 identiques !** ×1.5 → **+${gain} 🪙**`;
  } else {
    gain = -bet; resultText = `💸 **Rien...** → **-${bet} 🪙**`;
  }
  const newBal = await addCoins(message.guild.id, message.author.id, gain);
  await message.reply({
    embeds: [new EmbedBuilder()
      .setColor(gain > 0 ? 0x00cc66 : 0xff4444)
      .setTitle("🎰 Machine à sous")
      .setDescription(`${reels.join(" | ")}\n\n${resultText}\n\nSolde : **${newBal} 🪙**`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
  }).catch(() => {});
}
