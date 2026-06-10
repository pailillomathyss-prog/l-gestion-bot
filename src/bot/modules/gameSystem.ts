import {
  Guild, TextChannel, ChannelType, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ButtonInteraction, UserSelectMenuBuilder, UserSelectMenuInteraction,
  GuildMember, ComponentType,
} from "discord.js";
import { logger } from "../../lib/logger.js";
import { getCoins, addCoins } from "./db.js";

// ── Gacha roles ──────────────────────────────────────────────────────────────
export const GACHA_ROLES = [
  // Commun 60%
  { name: "🎀 Commun", color: 0x95a5a6, weight: 300, rarity: "Commun", emoji: "🎀" },
  { name: "🍀 Chanceux", color: 0x2ecc71, weight: 300, rarity: "Commun", emoji: "🍀" },
  // Peu commun 25%
  { name: "⚡ Peu Commun", color: 0x3498db, weight: 125, rarity: "Peu Commun", emoji: "⚡" },
  { name: "🌸 Fleuri", color: 0xff69b4, weight: 125, rarity: "Peu Commun", emoji: "🌸" },
  // Rare 10%
  { name: "💜 Rare", color: 0x9b59b6, weight: 50, rarity: "Rare", emoji: "💜" },
  { name: "🔥 Embrasé", color: 0xe67e22, weight: 50, rarity: "Rare", emoji: "🔥" },
  // Épique 4%
  { name: "💎 Épique", color: 0x00bcd4, weight: 20, rarity: "Épique", emoji: "💎" },
  { name: "🌟 Étoile", color: 0xffd700, weight: 20, rarity: "Épique", emoji: "🌟" },
  // Légendaire 0.9%
  { name: "👑 Légendaire", color: 0xdaa520, weight: 5, rarity: "Légendaire", emoji: "👑" },
  { name: "🌌 Cosmos", color: 0x7b2d8b, weight: 4, rarity: "Légendaire", emoji: "🌌" },
  // Mythique 0.1%
  { name: "⚜️ Mythique", color: 0xe74c3c, weight: 1, rarity: "Mythique", emoji: "⚜️" },
];

const TOTAL_WEIGHT = GACHA_ROLES.reduce((s, r) => s + r.weight, 0);
const GACHA_PRICE = 200;
const RARITY_COLORS: Record<string, number> = {
  "Commun": 0x95a5a6, "Peu Commun": 0x2ecc71, "Rare": 0x9b59b6,
  "Épique": 0x00bcd4, "Légendaire": 0xffd700, "Mythique": 0xe74c3c,
};

function pickGachaRole() {
  let rand = Math.random() * TOTAL_WEIGHT;
  for (const r of GACHA_ROLES) {
    rand -= r.weight;
    if (rand <= 0) return r;
  }
  return GACHA_ROLES[0];
}

// ── Jeu: pendingDuels ────────────────────────────────────────────────────────
const pendingDuels = new Map<string, { challengerId: string; bet: number; guildId: string }>();

// ── Menu jeux ────────────────────────────────────────────────────────────────
function buildGameMenu(): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("👾 Jeux — Casino & Fun")
    .setDescription(
      "Gagne des pièces en jouant ! Utilise les boutons ci-dessous.\n\n" +
      "💡 Tu dois avoir assez de pièces pour miser."
    )
    .addFields(
      { name: "🪙 Coin Flip", value: "Pile ou face — Mise et double ou rien ! (50/50)", inline: false },
      { name: "🎰 Slots", value: "Machine à sous — jusqu'à **×20** ta mise !", inline: false },
      { name: "🃏 Blackjack", value: "21 contre le croupier — Mise et bats la maison !", inline: false },
      { name: "🎲 Duel 1v1", value: "Défie un autre membre et le gagnant prend tout !", inline: false },
      { name: "🎁 Gacha", value: `Tire un rôle aléatoire pour **${GACHA_PRICE} 🪙** — 11 rôles possibles !`, inline: false },
    )
    .setFooter({ text: "MAI•GESTION • Joue responsablement !" })
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("game_coinflip_10").setLabel("🪙 Flip 10").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("game_coinflip_50").setLabel("🪙 Flip 50").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("game_coinflip_100").setLabel("🪙 Flip 100").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("game_coinflip_500").setLabel("🪙 Flip 500").setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("game_slots_50").setLabel("🎰 Slots 50").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("game_slots_200").setLabel("🎰 Slots 200").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("game_bj_100").setLabel("🃏 BJ 100").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("game_bj_500").setLabel("🃏 BJ 500").setStyle(ButtonStyle.Success),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("game_duel_50").setLabel("🎲 Duel 50").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("game_duel_200").setLabel("🎲 Duel 200").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("game_gacha").setLabel(`🎁 Gacha ${GACHA_PRICE}🪙`).setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

export async function postGameMenuIfNeeded(guild: Guild, botId: string) {
  const jeux = guild.channels.cache.find(
    ch => ch.type === ChannelType.GuildText &&
      (ch.name.toLowerCase().includes("jeux") || ch.name.includes("👾") || ch.name.toLowerCase().includes("game"))
  ) as TextChannel | undefined;
  if (!jeux) return;

  const recent = await jeux.messages.fetch({ limit: 10 }).catch(() => null);
  if (recent?.some(m => m.author.id === botId && m.embeds[0]?.title?.includes("Jeux"))) return;

  const menu = buildGameMenu();
  await jeux.send(menu).catch(err => logger.warn({ err }, "Impossible de poster le menu jeux"));
  logger.info(`👾 Menu jeux posté dans #${jeux.name}`);
}

// ── Coin Flip ────────────────────────────────────────────────────────────────
async function handleCoinFlip(btn: ButtonInteraction, bet: number) {
  if (!btn.guild) return;
  const balance = await getCoins(btn.guild.id, btn.user.id);
  if (balance < bet) {
    await btn.reply({ content: `❌ Solde insuffisant. Tu as **${balance} 🪙** mais tu mises **${bet} 🪙**.`, ephemeral: true });
    return;
  }
  const win = Math.random() < 0.5;
  const newBal = await addCoins(btn.guild.id, btn.user.id, win ? bet : -bet);
  await btn.reply({
    embeds: [new EmbedBuilder()
      .setColor(win ? 0x00cc66 : 0xff4444)
      .setTitle(win ? "🟡 Face — Victoire !" : "⚫ Pile — Défaite !")
      .setDescription(win ? `**+${bet} 🪙** → Solde : **${newBal} 🪙**` : `**-${bet} 🪙** → Solde : **${newBal} 🪙**`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
    ephemeral: true,
  });
}

// ── Slots ─────────────────────────────────────────────────────────────────────
const SYMBOLS = ["🍒", "🍋", "🍊", "⭐", "💎", "7️⃣"];
const MULT: Record<string, number> = { "🍒": 2, "🍋": 2.5, "🍊": 3, "⭐": 5, "💎": 10, "7️⃣": 20 };

async function handleSlots(btn: ButtonInteraction, bet: number) {
  if (!btn.guild) return;
  const balance = await getCoins(btn.guild.id, btn.user.id);
  if (balance < bet) {
    await btn.reply({ content: `❌ Solde insuffisant. Tu as **${balance} 🪙**.`, ephemeral: true });
    return;
  }
  const reels = [0, 1, 2].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
  let gain = 0; let resultText = "";
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    gain = Math.floor(bet * MULT[reels[0]]);
    resultText = `🎉 **JACKPOT !** ×${MULT[reels[0]]} → **+${gain} 🪙**`;
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    gain = Math.floor(bet * 1.5);
    resultText = `✨ **2 identiques !** ×1.5 → **+${gain} 🪙**`;
  } else {
    gain = -bet;
    resultText = `💸 **Rien...** → **-${bet} 🪙**`;
  }
  const newBal = await addCoins(btn.guild.id, btn.user.id, gain);
  await btn.reply({
    embeds: [new EmbedBuilder()
      .setColor(gain > 0 ? 0x00cc66 : 0xff4444)
      .setTitle("🎰 Machine à sous")
      .setDescription(`${reels.join(" | ")}\n\n${resultText}\n\nSolde : **${newBal} 🪙**`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
    ephemeral: true,
  });
}

// ── Blackjack ─────────────────────────────────────────────────────────────────
function drawCard() {
  const cards = [2,3,4,5,6,7,8,9,10,10,10,10,11];
  return cards[Math.floor(Math.random() * cards.length)];
}
function handValue(cards: number[]) {
  let total = cards.reduce((a, b) => a + b, 0);
  let aces = cards.filter(c => c === 11).length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

async function handleBlackjack(btn: ButtonInteraction, bet: number) {
  if (!btn.guild) return;
  const balance = await getCoins(btn.guild.id, btn.user.id);
  if (balance < bet) {
    await btn.reply({ content: `❌ Solde insuffisant. Tu as **${balance} 🪙**.`, ephemeral: true });
    return;
  }

  await btn.deferReply({ ephemeral: true });

  const playerCards = [drawCard(), drawCard()];
  const dealerCards = [drawCard(), drawCard()];

  const playerTotal = handValue(playerCards);

  // Blackjack naturel
  if (playerTotal === 21) {
    const gain = Math.floor(bet * 1.5);
    const newBal = await addCoins(btn.guild.id, btn.user.id, gain);
    await btn.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("🃏 Blackjack ! Naturel !")
        .setDescription(`🎉 Tu fais **21** ! **+${gain} 🪙** (×1.5)\n\nSolde : **${newBal} 🪙**`)
        .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
    });
    return;
  }

  // Game logic simplifié
  let dealerTotal = handValue(dealerCards);
  while (dealerTotal < 17) dealerCards.push(drawCard()), dealerTotal = handValue(dealerCards);

  let gain = 0; let result = "";
  if (playerTotal > 21) {
    gain = -bet; result = `💥 **Bust !** (${playerTotal}) → **-${bet} 🪙**`;
  } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
    gain = bet; result = `✅ **Victoire !** ${playerTotal} vs ${dealerTotal} → **+${bet} 🪙**`;
  } else if (playerTotal === dealerTotal) {
    gain = 0; result = `🤝 **Égalité !** ${playerTotal} vs ${dealerTotal} → Remboursé`;
  } else {
    gain = -bet; result = `❌ **Défaite !** ${playerTotal} vs ${dealerTotal} → **-${bet} 🪙**`;
  }

  const newBal = await addCoins(btn.guild.id, btn.user.id, gain);
  await btn.editReply({
    embeds: [new EmbedBuilder()
      .setColor(gain > 0 ? 0x00cc66 : gain === 0 ? 0xffd700 : 0xff4444)
      .setTitle("🃏 Blackjack")
      .addFields(
        { name: "🧑 Toi", value: `**${playerCards.join(" + ")} = ${playerTotal}**`, inline: true },
        { name: "🏦 Croupier", value: `**${dealerCards.join(" + ")} = ${dealerTotal}**`, inline: true },
      )
      .setDescription(`${result}\n\nSolde : **${newBal} 🪙**`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
  });
}

// ── Duel 1v1 ─────────────────────────────────────────────────────────────────
async function handleDuel(btn: ButtonInteraction, bet: number) {
  if (!btn.guild) return;
  const balance = await getCoins(btn.guild.id, btn.user.id);
  if (balance < bet) {
    await btn.reply({ content: `❌ Solde insuffisant. Tu as **${balance} 🪙**.`, ephemeral: true });
    return;
  }

  const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`game_duel_pick:${bet}`)
      .setPlaceholder("Choisis ton adversaire...")
      .setMinValues(1).setMaxValues(1),
  );

  await btn.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("🎲 Duel 1v1")
      .setDescription(`Tu veux miser **${bet} 🪙**. Choisis ton adversaire !`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
    components: [row],
    ephemeral: true,
  });
}

export async function handleGameSelect(select: UserSelectMenuInteraction) {
  if (!select.guild) return;
  const [, betStr] = select.customId.split(":");
  const bet = parseInt(betStr);
  const challengerId = select.user.id;
  const targetId = select.values[0];

  if (targetId === challengerId) {
    await select.reply({ content: "❌ Tu ne peux pas te défier toi-même !", ephemeral: true });
    return;
  }

  const target = await select.guild.members.fetch(targetId).catch(() => null) as GuildMember | null;
  if (!target || target.user.bot) {
    await select.reply({ content: "❌ Membre invalide.", ephemeral: true });
    return;
  }

  const challengerBal = await getCoins(select.guild.id, challengerId);
  if (challengerBal < bet) {
    await select.reply({ content: `❌ Tu n'as pas assez de pièces. Solde: **${challengerBal} 🪙**.`, ephemeral: true });
    return;
  }

  const duelKey = `${select.guild.id}:${targetId}`;
  pendingDuels.set(duelKey, { challengerId, bet, guildId: select.guild.id });

  // Trouver le salon jeux pour annoncer
  const jeux = select.guild.channels.cache.find(
    ch => ch.type === ChannelType.GuildText &&
      (ch.name.toLowerCase().includes("jeux") || ch.name.includes("👾"))
  ) as TextChannel | undefined;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`game_duel_accept:${targetId}:${bet}`).setLabel("✅ Accepter").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`game_duel_refuse:${targetId}`).setLabel("❌ Refuser").setStyle(ButtonStyle.Danger),
  );

  const challengeEmbed = new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle("🎲 Défi Duel !")
    .setDescription(`<@${challengerId}> défie <@${targetId}> pour **${bet} 🪙** !`)
    .addFields({ name: "Mise", value: `**${bet} 🪙** chacun — Le gagnant emporte **${bet * 2} 🪙** !`, inline: false })
    .setFooter({ text: "MAI•GESTION • Tu as 60s pour répondre" }).setTimestamp();

  if (jeux) {
    await jeux.send({ content: `<@${targetId}>`, embeds: [challengeEmbed], components: [row] });
  }

  await select.reply({ content: `✅ Défi envoyé à **${target.displayName}** pour **${bet} 🪙** !`, ephemeral: true });

  setTimeout(() => pendingDuels.delete(duelKey), 60_000);
}

async function handleDuelAccept(btn: ButtonInteraction, targetId: string, bet: number) {
  if (!btn.guild) return;
  if (btn.user.id !== targetId) {
    await btn.reply({ content: "❌ Ce défi n'est pas pour toi !", ephemeral: true });
    return;
  }

  const duelKey = `${btn.guild.id}:${targetId}`;
  const duel = pendingDuels.get(duelKey);
  if (!duel) {
    await btn.reply({ content: "❌ Ce défi a expiré.", ephemeral: true });
    return;
  }

  pendingDuels.delete(duelKey);

  const [challengerBal, targetBal] = await Promise.all([
    getCoins(btn.guild.id, duel.challengerId),
    getCoins(btn.guild.id, targetId),
  ]);

  if (challengerBal < bet || targetBal < bet) {
    await btn.reply({ content: "❌ L'un des joueurs n'a plus assez de pièces.", ephemeral: true });
    return;
  }

  const challengerWins = Math.random() < 0.5;
  const winnerId = challengerWins ? duel.challengerId : targetId;
  const loserId = challengerWins ? targetId : duel.challengerId;

  await addCoins(btn.guild.id, loserId, -bet);
  await addCoins(btn.guild.id, winnerId, bet);

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🎲 Duel terminé !")
    .setDescription(`🏆 **<@${winnerId}>** remporte **${bet * 2} 🪙** contre **<@${loserId}>** !`)
    .setFooter({ text: "MAI•GESTION" }).setTimestamp();

  await btn.update({ embeds: [embed], components: [] });
}

async function handleDuelRefuse(btn: ButtonInteraction, targetId: string) {
  if (btn.user.id !== targetId) {
    await btn.reply({ content: "❌ Ce défi n'est pas pour toi !", ephemeral: true });
    return;
  }
  pendingDuels.delete(`${btn.guild?.id}:${targetId}`);
  await btn.update({
    embeds: [new EmbedBuilder()
      .setColor(0x888888)
      .setDescription(`❌ **${btn.user.displayName}** a refusé le défi.`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
    components: [],
  });
}

// ── Gacha ─────────────────────────────────────────────────────────────────────
async function handleGacha(btn: ButtonInteraction) {
  if (!btn.guild) return;
  const balance = await getCoins(btn.guild.id, btn.user.id);
  if (balance < GACHA_PRICE) {
    await btn.reply({ content: `❌ Il te faut **${GACHA_PRICE} 🪙** pour le gacha. Solde: **${balance} 🪙**.`, ephemeral: true });
    return;
  }

  await btn.deferReply({ ephemeral: true });

  const picked = pickGachaRole();

  // Créer le rôle si nécessaire
  await btn.guild.roles.fetch();
  let role = btn.guild.roles.cache.find(r => r.name === picked.name);
  if (!role) {
    try {
      role = await btn.guild.roles.create({
        name: picked.name,
        color: picked.color,
        reason: "Rôle gacha MAI•GESTION",
        permissions: [],
      });
    } catch { /* ignore */ }
  }

  const member = await btn.guild.members.fetch(btn.user.id).catch(() => null) as GuildMember | null;
  const alreadyHas = role && member?.roles.cache.has(role.id);

  if (alreadyHas) {
    await addCoins(btn.guild.id, btn.user.id, -GACHA_PRICE);
    const newBal = await getCoins(btn.guild.id, btn.user.id);
    await btn.editReply({
      embeds: [new EmbedBuilder()
        .setColor(RARITY_COLORS[picked.rarity])
        .setTitle(`${picked.emoji} ${picked.rarity} !`)
        .setDescription(`Tu as tiré **${picked.name}**...\nMais tu as déjà ce rôle ! 😅\n\n*Consolation: 0 🪙 supplémentaire*\n\nSolde: **${newBal} 🪙**`)
        .setFooter({ text: "MAI•GESTION • Tente à nouveau !" }).setTimestamp()],
    });
    return;
  }

  await addCoins(btn.guild.id, btn.user.id, -GACHA_PRICE);
  if (role && member) await member.roles.add(role).catch(() => {});
  const newBal = await getCoins(btn.guild.id, btn.user.id);

  await btn.editReply({
    embeds: [new EmbedBuilder()
      .setColor(RARITY_COLORS[picked.rarity])
      .setTitle(`${picked.emoji} ${picked.rarity} !`)
      .setDescription(`🎉 Tu as obtenu le rôle **${picked.name}** !\n\nRareté : **${picked.rarity}**\nSolde : **${newBal} 🪙**`)
      .addFields({
        name: "📊 Chances",
        value: "🎀🍀 Commun: 60% | ⚡🌸 Peu commun: 25% | 💜🔥 Rare: 10% | 💎🌟 Épique: 4% | 👑🌌 Légendaire: 0.9% | ⚜️ Mythique: 0.1%",
      })
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
  });
}

// ── Handler principal ─────────────────────────────────────────────────────────
export async function handleGameButton(btn: ButtonInteraction) {
  const id = btn.customId;

  if (id.startsWith("game_coinflip_")) {
    const bet = parseInt(id.replace("game_coinflip_", ""));
    return handleCoinFlip(btn, bet);
  }

  if (id.startsWith("game_slots_")) {
    const bet = parseInt(id.replace("game_slots_", ""));
    return handleSlots(btn, bet);
  }

  if (id.startsWith("game_bj_")) {
    const bet = parseInt(id.replace("game_bj_", ""));
    return handleBlackjack(btn, bet);
  }

  if (id.startsWith("game_duel_") && !id.startsWith("game_duel_accept") && !id.startsWith("game_duel_refuse") && !id.startsWith("game_duel_pick")) {
    const bet = parseInt(id.replace("game_duel_", ""));
    return handleDuel(btn, bet);
  }

  if (id.startsWith("game_duel_accept:")) {
    const parts = id.split(":");
    const targetId = parts[1];
    const bet = parseInt(parts[2]);
    return handleDuelAccept(btn, targetId, bet);
  }

  if (id.startsWith("game_duel_refuse:")) {
    const targetId = id.split(":")[1];
    return handleDuelRefuse(btn, targetId);
  }

  if (id === "game_gacha") {
    return handleGacha(btn);
  }
}
