import {
  ButtonInteraction, UserSelectMenuInteraction, ChannelType, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder,
  TextChannel, Guild, GuildMember,
} from "discord.js";
import { getCoins, addCoins } from "./db";
import { contributeJackpot } from "./jackpot";
import { logger } from "../../lib/logger";
import { ensurePanel } from "./panelUtils";

const SLOT_SYMBOLS = ["🍒", "🍋", "🍊", "⭐", "💎", "7️⃣"];
const SLOT_MULT: Record<string, number> = {
  "🍒": 2, "🍋": 2.5, "🍊": 3, "⭐": 5, "💎": 10, "7️⃣": 20,
};

const activeDuels = new Map<string, { challengerId: string; bet: number }>();
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function findGamesChannel(guild: Guild): TextChannel | null {
  return (guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText &&
    (c.name.toLowerCase().includes("jeux") || c.name.toLowerCase().includes("games"))
  ) as TextChannel) ?? null;
}

export function buildGameMenuEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle("🎮 Salon des Jeux")
    .setDescription(
      "Bienvenue dans l'espace jeux ! Clique sur un jeu pour commencer.\n" +
      "Un salon privé sera créé rien que pour toi.\n\n" +
      "**🎰 Casino** — Machine à sous, tente ta chance !\n" +
      "**🪙 Coin Flip** — Face ou Pile, double ou rien !\n" +
      "**⚔️ Duel 1v1** — Défie un joueur de ton choix avec mise\n" +
      "**🃏 Blackjack** — Atteins 21 sans dépasser !\n" +
      "**🎁 Gacha** — Tente ta chance pour un rôle rare !\n\n" +
      "5% de chaque perte alimente le 🎁 Jackpot communautaire !"
    )
    .setFooter({ text: "MAI•GESTION • Bonne chance !" })
    .setTimestamp();
}

export function buildGameMenuComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("game_coinflip").setLabel("🪙 Coin Flip").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("game_slot").setLabel("🎰 Slots").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("game_blackjack").setLabel("🃏 Blackjack").setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("game_duel").setLabel("⚔️ Duel 1v1").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("game_gacha").setLabel("🎁 Gacha").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export async function postGameMenuIfNeeded(guild: Guild, botId: string): Promise<void> {
  const ch = findGamesChannel(guild);
  if (!ch) return;
  await ensurePanel(
    ch, botId,
    "Salon des Jeux",
    "game_coinflip",
    buildGameMenuEmbed,
    buildGameMenuComponents,
    "🎮 Jeux",
  );
}

// ── Coin Flip ──────────────────────────────────────────────────────────────────
async function handleCoinflip(btn: ButtonInteraction, bet: number) {
  const guildId = btn.guild!.id;
  const userId  = btn.user.id;
  const balance = await getCoins(guildId, userId);
  if (balance < bet) { await btn.editReply(`❌ Pas assez de pièces ! Tu as **${balance} 🪙**.`); return; }

  const win = Math.random() < 0.5;
  const face = Math.random() < 0.5 ? "🪙 Face" : "🪙 Pile";
  if (win) {
    await addCoins(guildId, userId, bet);
    await btn.editReply({ embeds: [new EmbedBuilder()
      .setColor(0x57f287).setTitle("🪙 Coin Flip — Victoire !")
      .setDescription(`**${face}** — Tu gagnes **+${bet} 🪙** !`)
      .addFields({ name: "💰 Nouveau solde", value: `**${balance + bet} 🪙**`, inline: true })
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()] });
  } else {
    await addCoins(guildId, userId, -bet);
    await contributeJackpot(guildId, bet);
    await btn.editReply({ embeds: [new EmbedBuilder()
      .setColor(0xff4444).setTitle("🪙 Coin Flip — Défaite !")
      .setDescription(`**${face}** — Tu perds **-${bet} 🪙** !`)
      .addFields({ name: "💰 Nouveau solde", value: `**${Math.max(0, balance - bet)} 🪙**`, inline: true })
      .setFooter({ text: "MAI•GESTION • 5% vont au jackpot !" }).setTimestamp()] });
  }
}

// ── Slots ──────────────────────────────────────────────────────────────────────
async function handleSlot(btn: ButtonInteraction, bet: number) {
  const guildId = btn.guild!.id;
  const userId  = btn.user.id;
  const balance = await getCoins(guildId, userId);
  if (balance < bet) { await btn.editReply(`❌ Pas assez de pièces ! Tu as **${balance} 🪙**.`); return; }

  const s = () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]!;
  const r = [s(), s(), s()];
  const display = r.join(" | ");

  let mult = 0;
  if (r[0] === r[1] && r[1] === r[2]) mult = SLOT_MULT[r[0]!] ?? 2;
  else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) mult = 0.5;

  if (mult >= 1) {
    const gain = Math.floor(bet * mult);
    await addCoins(guildId, userId, gain);
    await btn.editReply({ embeds: [new EmbedBuilder()
      .setColor(0xffd700).setTitle("🎰 Slots — Victoire !")
      .setDescription(`**${display}**\n\n🎉 **×${mult}** — Tu gagnes **+${gain} 🪙** !`)
      .addFields({ name: "💰 Nouveau solde", value: `**${balance + gain} 🪙**`, inline: true })
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()] });
  } else if (mult === 0.5) {
    const loss = Math.floor(bet * 0.5);
    await addCoins(guildId, userId, -loss);
    await contributeJackpot(guildId, loss);
    await btn.editReply({ embeds: [new EmbedBuilder()
      .setColor(0xffa500).setTitle("🎰 Slots — Presque !")
      .setDescription(`**${display}**\n\n2 identiques — Tu perds **-${loss} 🪙** (×0.5)`)
      .addFields({ name: "💰 Nouveau solde", value: `**${Math.max(0, balance - loss)} 🪙**`, inline: true })
      .setFooter({ text: "MAI•GESTION • 5% vont au jackpot !" }).setTimestamp()] });
  } else {
    await addCoins(guildId, userId, -bet);
    await contributeJackpot(guildId, bet);
    await btn.editReply({ embeds: [new EmbedBuilder()
      .setColor(0xff4444).setTitle("🎰 Slots — Défaite !")
      .setDescription(`**${display}**\n\nAucune combinaison — Tu perds **-${bet} 🪙**`)
      .addFields({ name: "💰 Nouveau solde", value: `**${Math.max(0, balance - bet)} 🪙**`, inline: true })
      .setFooter({ text: "MAI•GESTION • 5% vont au jackpot !" }).setTimestamp()] });
  }
}

// ── Blackjack ──────────────────────────────────────────────────────────────────
function drawCard(): number {
  const cards = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11];
  return cards[Math.floor(Math.random() * cards.length)]!;
}
function handTotal(cards: number[]): number {
  let total = cards.reduce((a, b) => a + b, 0);
  let aces  = cards.filter(c => c === 11).length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

async function handleBlackjack(btn: ButtonInteraction, bet: number) {
  const guildId = btn.guild!.id;
  const userId  = btn.user.id;
  const balance = await getCoins(guildId, userId);
  if (balance < bet) { await btn.editReply(`❌ Pas assez de pièces ! Tu as **${balance} 🪙**.`); return; }

  const playerCards = [drawCard(), drawCard()];
  const dealerCards = [drawCard(), drawCard()];
  let playerTotal   = handTotal(playerCards);
  let dealerTotal   = handTotal(dealerCards);

  const hitRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("bj_hit").setLabel("🃏 Tirer").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("bj_stand").setLabel("✋ Rester").setStyle(ButtonStyle.Secondary),
  );

  const stateEmbed = () => new EmbedBuilder()
    .setColor(0x1a73e8).setTitle("🃏 Blackjack")
    .addFields(
      { name: `Tes cartes (${handTotal(playerCards)})`, value: playerCards.join(" + "), inline: true },
      { name: `Croupier (${dealerCards[0]}+?)`, value: `${dealerCards[0]} + ?`, inline: true },
    )
    .setFooter({ text: `Mise : ${bet} 🪙` }).setTimestamp();

  const gameMsg = await btn.editReply({ embeds: [stateEmbed()], components: [hitRow] });

  const collector = (gameMsg as any).createMessageComponentCollector
    ? (gameMsg as any).createMessageComponentCollector({ time: 60_000 })
    : null;
  if (!collector) return;

  collector.on("collect", async (i: ButtonInteraction) => {
    if (i.user.id !== userId) { await i.reply({ content: "❌ Ce n'est pas ton jeu.", ephemeral: true }); return; }
    await i.deferUpdate();

    if (i.customId === "bj_hit") {
      playerCards.push(drawCard());
      playerTotal = handTotal(playerCards);
      if (playerTotal > 21) {
        collector.stop("bust");
        await addCoins(guildId, userId, -bet);
        await contributeJackpot(guildId, bet);
        await btn.editReply({ embeds: [new EmbedBuilder()
          .setColor(0xff4444).setTitle("🃏 Blackjack — Bust !")
          .setDescription(`Tu dépasses 21 (${playerTotal}) — Tu perds **-${bet} 🪙**`)
          .setFooter({ text: "MAI•GESTION" }).setTimestamp()], components: [] });
      } else {
        await btn.editReply({ embeds: [stateEmbed()], components: [hitRow] });
      }
    } else {
      collector.stop("stand");
    }
  });

  collector.on("end", async (_: any, reason: string) => {
    if (reason !== "stand") return;
    while (dealerTotal < 17) { dealerCards.push(drawCard()); dealerTotal = handTotal(dealerCards); }

    const dealerEmbed = new EmbedBuilder()
      .setColor(0x1a73e8).setTitle("🃏 Blackjack — Résultat")
      .addFields(
        { name: `Tes cartes (${playerTotal})`, value: playerCards.join(" + "), inline: true },
        { name: `Croupier (${dealerTotal})`,   value: dealerCards.join(" + "), inline: true },
      ).setFooter({ text: `Mise : ${bet} 🪙` }).setTimestamp();

    if (dealerTotal > 21 || playerTotal > dealerTotal) {
      await addCoins(guildId, userId, bet);
      dealerEmbed.setColor(0x57f287).setTitle("🃏 Blackjack — Victoire !")
        .setDescription(`🎉 Tu gagnes **+${bet} 🪙** !`);
    } else if (playerTotal === dealerTotal) {
      dealerEmbed.setColor(0xffa500).setTitle("🃏 Blackjack — Égalité !")
        .setDescription("Égalité ! Ta mise te revient.");
    } else {
      await addCoins(guildId, userId, -bet);
      await contributeJackpot(guildId, bet);
      dealerEmbed.setColor(0xff4444).setTitle("🃏 Blackjack — Défaite !")
        .setDescription(`Tu perds **-${bet} 🪙**`);
    }
    await btn.editReply({ embeds: [dealerEmbed], components: [] });
  });
}

// ── Gacha ──────────────────────────────────────────────────────────────────────
const GACHA_ROLES = [
  { name: "🌟 Étoile Mystique",  rarity: "Légendaire", chance: 0.01, color: 0xffd700 },
  { name: "💎 Cristal Céleste",  rarity: "Épique",     chance: 0.05, color: 0x9b59b6 },
  { name: "🔥 Flamme Ardente",   rarity: "Rare",       chance: 0.10, color: 0xe74c3c },
  { name: "🌊 Vague Bleue",      rarity: "Peu commun", chance: 0.20, color: 0x3498db },
  { name: "🍀 Trèfle Chanceux",  rarity: "Commun",     chance: 0.30, color: 0x2ecc71 },
  { name: "🌸 Pétale Rose",      rarity: "Commun",     chance: 0.34, color: 0xff69b4 },
];
const GACHA_COST = 200;

async function handleGacha(btn: ButtonInteraction) {
  const guildId = btn.guild!.id;
  const userId  = btn.user.id;
  const balance = await getCoins(guildId, userId);
  if (balance < GACHA_COST) { await btn.editReply(`❌ Le gacha coûte **${GACHA_COST} 🪙**. Tu as **${balance} 🪙**.`); return; }

  await addCoins(guildId, userId, -GACHA_COST);
  await contributeJackpot(guildId, GACHA_COST);

  const roll = Math.random();
  let cumul = 0;
  let result = GACHA_ROLES[GACHA_ROLES.length - 1]!;
  for (const r of GACHA_ROLES) {
    cumul += r.chance;
    if (roll <= cumul) { result = r; break; }
  }

  // Créer/attribuer le rôle
  await btn.guild!.roles.fetch();
  let role = btn.guild!.roles.cache.find(r => r.name === result.name);
  if (!role) {
    role = await btn.guild!.roles.create({ name: result.name, color: result.color, permissions: [], reason: "Gacha MAI•GESTION" }).catch(() => undefined);
  }
  if (role) {
    const member = await btn.guild!.members.fetch(userId).catch(() => null);
    if (member) await member.roles.add(role).catch(() => {});
  }

  await btn.editReply({ embeds: [new EmbedBuilder()
    .setColor(result.color).setTitle("🎁 Gacha — Résultat !")
    .setDescription(`Tu obtiens : **${result.name}**\n✨ Rareté : **${result.rarity}**`)
    .addFields({ name: "💰 Coût", value: `**${GACHA_COST} 🪙**`, inline: true })
    .setFooter({ text: "MAI•GESTION • 5% vont au jackpot !" }).setTimestamp()] });
}

// ── Duel ───────────────────────────────────────────────────────────────────────
async function handleDuel(btn: ButtonInteraction, bet: number) {
  const guildId = btn.guild!.id;
  const userId  = btn.user.id;
  const balance = await getCoins(guildId, userId);
  if (balance < bet) { await btn.editReply(`❌ Pas assez de pièces ! Tu as **${balance} 🪙**.`); return; }

  const selectRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder().setCustomId(`duel_select_${userId}_${bet}`).setPlaceholder("Sélectionne ton adversaire...").setMinValues(1).setMaxValues(1)
  );
  await btn.editReply({ content: "⚔️ **Sélectionne ton adversaire :**", components: [selectRow] });
}

export async function handleDuelAccept(interaction: UserSelectMenuInteraction) {
  if (!interaction.guild) { await interaction.reply({ content: "❌ Erreur.", ephemeral: true }); return; }

  const parts = interaction.customId.split("_");
  const challengerId = parts[2]!;
  const bet = parseInt(parts[3]!);
  const challenged = interaction.users.first();

  if (!challenged) { await interaction.reply({ content: "❌ Aucun adversaire.", ephemeral: true }); return; }
  if (challenged.id === challengerId) { await interaction.reply({ content: "❌ Tu ne peux pas te défier toi-même.", ephemeral: true }); return; }
  if (challenged.bot) { await interaction.reply({ content: "❌ Tu ne peux pas défier un bot.", ephemeral: true }); return; }

  const guildId = interaction.guild.id;
  const challengerBal = await getCoins(guildId, challengerId);
  const challengedBal = await getCoins(guildId, challenged.id);

  if (challengedBal < bet) {
    await interaction.reply({ content: `❌ <@${challenged.id}> n'a pas assez de pièces (**${challengedBal} 🪙** vs mise **${bet} 🪙**).`, ephemeral: true });
    return;
  }

  // Simuler le duel
  const challengerRoll = Math.floor(Math.random() * 100) + 1;
  const challengedRoll = Math.floor(Math.random() * 100) + 1;
  const winner = challengerRoll >= challengedRoll ? challengerId : challenged.id;
  const loser  = winner === challengerId ? challenged.id : challengerId;

  await addCoins(guildId, winner, bet);
  await addCoins(guildId, loser, -bet);
  await contributeJackpot(guildId, Math.floor(bet * 0.05));

  await interaction.update({ content: null, embeds: [new EmbedBuilder()
    .setColor(0xe74c3c).setTitle("⚔️ Résultat du Duel !")
    .setDescription(`**<@${challengerId}>** vs **<@${challenged.id}>**`)
    .addFields(
      { name: `🎲 <@${challengerId}>`,  value: `Score : **${challengerRoll}**`, inline: true },
      { name: `🎲 <@${challenged.id}>`, value: `Score : **${challengedRoll}**`, inline: true },
      { name: "🏆 Vainqueur",           value: `<@${winner}> remporte **${bet} 🪙** !`, inline: false },
    )
    .setFooter({ text: "MAI•GESTION • 5% vont au jackpot !" }).setTimestamp()], components: [] });
}

// ── Routeur principal des boutons de jeux ─────────────────────────────────────
const BET_AMOUNTS: Record<string, number> = {
  game_coinflip:  50,
  game_slot:      100,
  game_blackjack: 100,
  game_duel:      200,
};

export async function handleGameButton(btn: ButtonInteraction): Promise<void> {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }
  await btn.deferReply({ ephemeral: true });

  const customId = btn.customId;
  const bet = BET_AMOUNTS[customId] ?? 50;

  switch (customId) {
    case "game_coinflip":  await handleCoinflip(btn, bet); break;
    case "game_slot":      await handleSlot(btn, bet); break;
    case "game_blackjack": await handleBlackjack(btn, bet); break;
    case "game_gacha":     await handleGacha(btn); break;
    case "game_duel":      await handleDuel(btn, bet); break;
    default: await btn.editReply("❌ Jeu inconnu."); break;
  }
}
