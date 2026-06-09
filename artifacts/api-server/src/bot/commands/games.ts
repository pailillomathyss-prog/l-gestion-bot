import { Message, EmbedBuilder, ChannelType } from "discord.js";
import { getCoins, addCoins } from "../modules/db";

function isGamesChannel(name: string): boolean {
  return name.toLowerCase().includes("jeux") || name.toLowerCase().includes("games") || name.toLowerCase().includes("casino");
}

async function checkGamesChannel(message: Message): Promise<boolean> {
  if (message.channel.type !== ChannelType.GuildText) return false;
  if (!isGamesChannel(message.channel.name)) {
    await message.reply("❌ Les jeux sont réservés au salon **jeux** !").catch(() => {});
    return false;
  }
  return true;
}

async function parseBet(message: Message, args: string[]): Promise<number | null> {
  if (!message.guild) return null;
  const betStr = args[0];
  if (!betStr) { await message.reply("❌ Indique une mise. Ex: `!coinflip 100`").catch(() => {}); return null; }
  const bet = parseInt(betStr);
  if (isNaN(bet) || bet <= 0) { await message.reply("❌ Mise invalide.").catch(() => {}); return null; }
  if (bet < 10) { await message.reply("❌ Mise minimale : **10 🪙**").catch(() => {}); return null; }
  const balance = await getCoins(message.guild.id, message.author.id);
  if (balance < bet) { await message.reply(`❌ Pas assez de pièces ! Tu as **${balance} 🪙**`).catch(() => {}); return null; }
  return bet;
}

export async function coinflipCommand(message: Message, args: string[]) {
  if (!await checkGamesChannel(message)) return;
  if (!message.guild) return;
  const bet = await parseBet(message, args);
  if (bet === null) return;

  const win = Math.random() < 0.5;
  const delta = win ? bet : -bet;
  const newBalance = await addCoins(message.guild.id, message.author.id, delta);

  const embed = new EmbedBuilder()
    .setColor(win ? 0x00cc66 : 0xff4444)
    .setTitle(win ? "🟡 Face — Tu gagnes !" : "⚫ Pile — Tu perds !")
    .setDescription(win ? `**+${bet} 🪙**` : `**-${bet} 🪙**`)
    .addFields({ name: "💰 Solde", value: `**${newBalance} 🪙**`, inline: true })
    .setFooter({ text: `MAI•GESTION • ${message.author.username}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}

const SLOT_SYMBOLS = ["🍒", "🍋", "🍊", "⭐", "💎", "7️⃣"];
const SLOT_MULTIPLIERS: Record<string, number> = {
  "🍒": 2, "🍋": 2.5, "🍊": 3, "⭐": 5, "💎": 10, "7️⃣": 20,
};

export async function slotCommand(message: Message, args: string[]) {
  if (!await checkGamesChannel(message)) return;
  if (!message.guild) return;
  const bet = await parseBet(message, args);
  if (bet === null) return;

  const spin = () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
  const s1 = spin(), s2 = spin(), s3 = spin();
  const display = `[ ${s1} | ${s2} | ${s3} ]`;

  let multiplier = 0;
  let result = "";

  if (s1 === s2 && s2 === s3) {
    multiplier = SLOT_MULTIPLIERS[s1] ?? 2;
    result = `🎰 JACKPOT x${multiplier} !`;
  } else if (s1 === s2 || s2 === s3 || s1 === s3) {
    multiplier = 1.5;
    result = "✨ Deux identiques — x1.5 !";
  } else {
    result = "😢 Rien...";
  }

  const gain = multiplier > 0 ? Math.floor(bet * multiplier) - bet : -bet;
  const newBalance = await addCoins(message.guild.id, message.author.id, gain);

  const embed = new EmbedBuilder()
    .setColor(multiplier > 0 ? 0xffd700 : 0xff4444)
    .setTitle("🎰 Machine à sous")
    .setDescription(`**${display}**\n\n${result}`)
    .addFields(
      { name: gain >= 0 ? "💰 Gain" : "💸 Perte", value: `**${gain >= 0 ? "+" : ""}${gain} 🪙**`, inline: true },
      { name: "💰 Solde", value: `**${newBalance} 🪙**`, inline: true },
    )
    .setFooter({ text: `MAI•GESTION • ${message.author.username}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}
