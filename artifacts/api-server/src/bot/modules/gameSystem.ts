import {
  ButtonInteraction,
  UserSelectMenuInteraction,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  PermissionFlagsBits,
  TextChannel,
  Guild,
  GuildMember,
  Message,
} from "discord.js";
import { getCoins, addCoins } from "./db";
import { logger } from "../../lib/logger";

const SLOT_SYMBOLS = ["🍒", "🍋", "🍊", "⭐", "💎", "7️⃣"];
const SLOT_MULT: Record<string, number> = {
  "🍒": 2, "🍋": 2.5, "🍊": 3, "⭐": 5, "💎": 10, "7️⃣": 20,
};

const activeDuels = new Map<string, { challengerId: string; bet: number }>();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function findGamesChannel(guild: Guild): TextChannel | null {
  return (guild.channels.cache.find(
    (ch) =>
      ch.type === ChannelType.GuildText &&
      (ch.name.toLowerCase().includes("jeux") || ch.name.toLowerCase().includes("games"))
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
      "**⚔️ Duel 1v1** — Défie un joueur de ton choix avec mise !"
    )
    .setFooter({ text: "MAI•GESTION • Les jeux utilisent tes 🪙 coins" })
    .setTimestamp();
}

export function buildGameMenuComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("game_select:casino").setLabel("🎰 Casino").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("game_select:coinflip").setLabel("🪙 Coin Flip").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("game_select:duel").setLabel("⚔️ Duel 1v1").setStyle(ButtonStyle.Danger),
    ),
  ];
}

export async function postGameMenuIfNeeded(guild: Guild, botId: string) {
  const ch = findGamesChannel(guild);
  if (!ch) { logger.warn(`Aucun salon "jeux" trouvé sur ${guild.name}`); return; }
  try {
    const recent = await ch.messages.fetch({ limit: 20 });
    const alreadyPosted = recent.some(
      (m) => m.author.id === botId && m.embeds[0]?.title?.includes("Salon des Jeux")
    );
    if (alreadyPosted) { logger.info(`Menu jeux déjà posté dans #${ch.name}`); return; }
    await ch.send({ embeds: [buildGameMenuEmbed()], components: buildGameMenuComponents() });
    logger.info(`✅ Menu jeux posté dans #${ch.name}`);
  } catch (err) {
    logger.warn({ err }, `Impossible de poster le menu jeux dans #${ch.name}`);
  }
}

async function createGameChannel(guild: Guild, member: GuildMember, gameName: string): Promise<TextChannel | null> {
  try {
    const gamesChannel = findGamesChannel(guild);
    const categoryId = gamesChannel?.parentId ?? null;
    const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "joueur";
    const channelName = `🎮・${safeName}-${gameName}`;

    const ch = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId ?? undefined,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: member.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        {
          id: guild.members.me!.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });
    return ch as TextChannel;
  } catch (err) {
    logger.error({ err }, "Impossible de créer le salon de jeu");
    return null;
  }
}

function buildBetComponents(game: string): ActionRowBuilder<ButtonBuilder>[] {
  const bets = [10, 50, 100, 500, 1000];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...bets.map((b) =>
        new ButtonBuilder()
          .setCustomId(`game_bet:${game}:${b}`)
          .setLabel(`${b} 🪙`)
          .setStyle(ButtonStyle.Secondary)
      )
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("game_quit").setLabel("❌ Quitter").setStyle(ButtonStyle.Danger)
    ),
  ];
}

function buildAfterGameComponents(game: string, bet: number): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`game_replay:${game}:${bet}`).setLabel("🔄 Rejouer").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`game_newbet:${game}`).setLabel("💰 Nouvelle mise").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("game_quit").setLabel("❌ Quitter").setStyle(ButtonStyle.Danger),
    ),
  ];
}

function buildDuelPickComponents(bet: number): ActionRowBuilder<UserSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`game_duel_pick:${bet}`)
        .setPlaceholder("👤 Choisis ton adversaire...")
        .setMinValues(1)
        .setMaxValues(1),
    ),
  ];
}

// ── Animation Casino ──────────────────────────────────────────────────────────
async function playCasino(channel: TextChannel, userId: string, guildId: string, bet: number) {
  const balance = await getCoins(guildId, userId);
  if (balance < bet) {
    await channel.send({
      embeds: [
        new EmbedBuilder().setColor(0xff4444).setTitle("❌ Solde insuffisant")
          .setDescription(`Tu as **${balance} 🪙** mais tu mises **${bet} 🪙**.`)
          .setFooter({ text: "MAI•GESTION" }),
      ],
      components: buildBetComponents("casino"),
    });
    return;
  }

  const spin = () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
  const s1 = spin(), s2 = spin(), s3 = spin();

  const spinFrame = (a: string, b: string, c: string) =>
    new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🎰 Machine à sous — en cours...")
      .setDescription(`## [ ${a} | ${b} | ${c} ]`)
      .setFooter({ text: "MAI•GESTION" });

  const spinSyms = ["🌀", "✨", "❓"];
  const rndSpin = () => spinSyms[Math.floor(Math.random() * spinSyms.length)] as string;

  const loadMsg: Message = await channel.send({
    embeds: [spinFrame(rndSpin(), rndSpin(), rndSpin())],
  });

  await sleep(600);
  await loadMsg.edit({ embeds: [spinFrame(s1, rndSpin(), rndSpin())] }).catch(() => {});
  await sleep(600);
  await loadMsg.edit({ embeds: [spinFrame(s1, s2, rndSpin())] }).catch(() => {});
  await sleep(700);

  let multiplier = 0;
  let result = "";

  if (s1 === s2 && s2 === s3) {
    multiplier = SLOT_MULT[s1] ?? 2;
    result = `🎉 **JACKPOT x${multiplier} !**`;
  } else if (s1 === s2 || s2 === s3 || s1 === s3) {
    multiplier = 1.5;
    result = "✨ **Deux identiques — x1.5 !**";
  } else {
    result = "😢 **Rien...**";
  }

  const gain = multiplier > 0 ? Math.floor(bet * multiplier) - bet : -bet;
  const newBalance = await addCoins(guildId, userId, gain);

  await loadMsg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(multiplier > 0 ? 0xffd700 : 0xff4444)
        .setTitle("🎰 Machine à sous")
        .setDescription(`## [ ${s1} | ${s2} | ${s3} ]\n\n${result}`)
        .addFields(
          { name: gain >= 0 ? "💰 Gain" : "💸 Perte", value: `**${gain >= 0 ? "+" : ""}${gain} 🪙**`, inline: true },
          { name: "💳 Solde", value: `**${newBalance} 🪙**`, inline: true },
        )
        .setFooter({ text: "MAI•GESTION" })
        .setTimestamp(),
    ],
    components: buildAfterGameComponents("casino", bet),
  }).catch(() => {});
}

// ── Animation Coin Flip ───────────────────────────────────────────────────────
async function playCoinflip(channel: TextChannel, userId: string, guildId: string, bet: number) {
  const balance = await getCoins(guildId, userId);
  if (balance < bet) {
    await channel.send({
      embeds: [
        new EmbedBuilder().setColor(0xff4444).setTitle("❌ Solde insuffisant")
          .setDescription(`Tu as **${balance} 🪙** mais tu mises **${bet} 🪙**.`)
          .setFooter({ text: "MAI•GESTION" }),
      ],
      components: buildBetComponents("coinflip"),
    });
    return;
  }

  const flipFrames = ["🟡", "⚫", "🟡", "⚫", "🟡", "⚫"];
  const loadMsg: Message = await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("🪙 La pièce tourne...")
        .setDescription(`# ${flipFrames[0]}\n*En l'air...*`)
        .setFooter({ text: "MAI•GESTION" }),
    ],
  });

  for (let i = 1; i < flipFrames.length; i++) {
    await sleep(350);
    await loadMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle("🪙 La pièce tourne...")
          .setDescription(`# ${flipFrames[i]}\n*En l'air...*`)
          .setFooter({ text: "MAI•GESTION" }),
      ],
    }).catch(() => {});
  }

  await sleep(500);

  const win = Math.random() < 0.5;
  const delta = win ? bet : -bet;
  const newBalance = await addCoins(guildId, userId, delta);

  await loadMsg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(win ? 0x00cc66 : 0xff4444)
        .setTitle(win ? "🟡 Face — Tu gagnes !" : "⚫ Pile — Tu perds !")
        .setDescription(win ? `# +${bet} 🪙` : `# -${bet} 🪙`)
        .addFields({ name: "💳 Solde", value: `**${newBalance} 🪙**`, inline: true })
        .setFooter({ text: "MAI•GESTION" })
        .setTimestamp(),
    ],
    components: buildAfterGameComponents("coinflip", bet),
  }).catch(() => {});
}

// ── Duel — Sélection de l'adversaire ─────────────────────────────────────────
async function startDuelPick(channel: TextChannel, challenger: GuildMember, guildId: string, bet: number) {
  const balance = await getCoins(guildId, challenger.id);
  if (balance < bet) {
    await channel.send({
      embeds: [
        new EmbedBuilder().setColor(0xff4444).setTitle("❌ Solde insuffisant")
          .setDescription(`Tu as **${balance} 🪙** mais tu mises **${bet} 🪙**.`)
          .setFooter({ text: "MAI•GESTION" }),
      ],
      components: buildBetComponents("duel"),
    });
    return;
  }

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff6600)
        .setTitle("⚔️ Duel 1v1 — Choisis ton adversaire")
        .setDescription(
          `Mise : **${bet} 🪙**\n\n` +
          `Utilise le menu ci-dessous pour sélectionner le joueur que tu veux défier.\n` +
          `⚠️ L'adversaire doit aussi avoir **${bet} 🪙** sur son compte.`
        )
        .setFooter({ text: "MAI•GESTION • Duel Coin Flip" })
        .setTimestamp(),
    ],
    components: [
      ...buildDuelPickComponents(bet),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("game_quit").setLabel("❌ Annuler").setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

// ── Duel — Envoi du défi après sélection ─────────────────────────────────────
async function sendDuelChallenge(channel: TextChannel, challenger: GuildMember, opponent: GuildMember, guildId: string, bet: number) {
  await channel.permissionOverwrites.edit(opponent.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
  }).catch(() => {});

  activeDuels.set(channel.id, { challengerId: challenger.id, bet });

  await channel.send({
    content: `${opponent}`,
    embeds: [
      new EmbedBuilder()
        .setColor(0xff6600)
        .setTitle("⚔️ Tu es défié !")
        .setDescription(
          `${challenger} te défie pour **${bet} 🪙** !\n\n` +
          `Accepte le duel ou refuse ci-dessous.\n` +
          `Tu dois avoir **${bet} 🪙** sur ton compte.`
        )
        .addFields(
          { name: "🥊 Challenger", value: `${challenger}`, inline: true },
          { name: "🎯 Adversaire", value: `${opponent}`, inline: true },
          { name: "💰 Mise", value: `**${bet} 🪙**`, inline: true },
        )
        .setFooter({ text: "MAI•GESTION • Duel Coin Flip" })
        .setTimestamp(),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_duel_join:${challenger.id}:${bet}`)
          .setLabel("⚔️ Accepter le duel")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("game_quit")
          .setLabel("❌ Refuser")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

// ── Duel — Résolution avec animation ─────────────────────────────────────────
async function resolveDuel(
  channel: TextChannel,
  challenger: GuildMember,
  opponent: GuildMember,
  guildId: string,
  bet: number
) {
  const challengerBal = await getCoins(guildId, challenger.id);
  const opponentBal = await getCoins(guildId, opponent.id);

  if (challengerBal < bet || opponentBal < bet) {
    await channel.send({
      embeds: [
        new EmbedBuilder().setColor(0xff4444).setTitle("❌ Solde insuffisant")
          .setDescription(
            challengerBal < bet
              ? `${challenger} n'a plus assez de pièces !`
              : `${opponent} n'a pas assez de pièces !`
          ),
      ],
    });
    activeDuels.delete(channel.id);
    return;
  }

  const flipFrames = ["🟡", "⚫", "🟡", "⚫", "🟡", "⚫"];
  const loadMsg: Message = await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("⚔️ Duel en cours...")
        .setDescription(`# ${flipFrames[0]}\n*La pièce est lancée...*`)
        .setFooter({ text: "MAI•GESTION" }),
    ],
  });

  for (let i = 1; i < flipFrames.length; i++) {
    await sleep(350);
    await loadMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle("⚔️ Duel en cours...")
          .setDescription(`# ${flipFrames[i]}\n*La pièce est lancée...*`)
          .setFooter({ text: "MAI•GESTION" }),
      ],
    }).catch(() => {});
  }

  await sleep(500);

  const challengerWins = Math.random() < 0.5;
  const winner = challengerWins ? challenger : opponent;
  const loser = challengerWins ? opponent : challenger;

  await addCoins(guildId, loser.id, -bet);
  const newWinnerBal = await addCoins(guildId, winner.id, bet);
  activeDuels.delete(channel.id);

  await loadMsg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("⚔️ Résultat du Duel !")
        .setDescription(
          `${challengerWins ? "🟡 **Face**" : "⚫ **Pile**"} !\n\n` +
          `🏆 **${winner.displayName}** remporte **${bet * 2} 🪙** !\n` +
          `💸 **${loser.displayName}** perd **${bet} 🪙**.`
        )
        .addFields({ name: `💳 Solde de ${winner.displayName}`, value: `**${newWinnerBal} 🪙**`, inline: true })
        .setFooter({ text: "MAI•GESTION" })
        .setTimestamp(),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_duel_rematch:${loser.id}:${bet}`)
          .setLabel("🔄 Revanche")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("game_quit").setLabel("❌ Quitter").setStyle(ButtonStyle.Danger),
      ),
    ],
  }).catch(() => {});
}

// ── Handler boutons ───────────────────────────────────────────────────────────
export async function handleGameButton(btn: ButtonInteraction): Promise<void> {
  if (!btn.guild || !btn.member) {
    await btn.reply({ content: "❌ Erreur serveur.", ephemeral: true });
    return;
  }

  const member = await btn.guild.members.fetch(btn.user.id).catch(() => null) as GuildMember | null;
  if (!member) {
    await btn.reply({ content: "❌ Impossible de récupérer ton profil.", ephemeral: true });
    return;
  }

  const id = btn.customId;

  // ── Sélection du jeu ──────────────────────────────────────────────────────
  if (id.startsWith("game_select:")) {
    const gameType = id.split(":")[1] as string;
    await btn.deferReply({ ephemeral: true });

    const ch = await createGameChannel(btn.guild, member, gameType);
    if (!ch) {
      await btn.editReply({ content: "❌ Impossible de créer le salon. Vérifie les permissions du bot." });
      return;
    }

    const gameLabels: Record<string, string> = { casino: "🎰 Casino", coinflip: "🪙 Coin Flip", duel: "⚔️ Duel 1v1" };
    const label = gameLabels[gameType] ?? gameType;

    await ch.send({
      content: `${member}`,
      embeds: [
        new EmbedBuilder()
          .setColor(0x7c3aed)
          .setTitle(`${label} — Choisis ta mise`)
          .setDescription(`Sélectionne le montant que tu veux miser.\n\nSolde actuel : **${await getCoins(btn.guild.id, member.id)} 🪙**`)
          .setFooter({ text: "MAI•GESTION" })
          .setTimestamp(),
      ],
      components: buildBetComponents(gameType),
    });

    await btn.editReply({ content: `✅ Ton salon de jeu a été créé : ${ch}` });
    return;
  }

  // ── Mise choisie ──────────────────────────────────────────────────────────
  if (id.startsWith("game_bet:")) {
    const parts = id.split(":");
    const gameType = parts[1] as string;
    const bet = parseInt(parts[2] as string);
    await btn.deferUpdate();
    const ch = btn.channel as TextChannel;
    if (gameType === "casino") await playCasino(ch, member.id, btn.guild.id, bet);
    else if (gameType === "coinflip") await playCoinflip(ch, member.id, btn.guild.id, bet);
    else if (gameType === "duel") await startDuelPick(ch, member, btn.guild.id, bet);
    return;
  }

  // ── Rejouer ───────────────────────────────────────────────────────────────
  if (id.startsWith("game_replay:")) {
    const parts = id.split(":");
    const gameType = parts[1] as string;
    const bet = parseInt(parts[2] as string);
    await btn.deferUpdate();
    const ch = btn.channel as TextChannel;
    if (gameType === "casino") await playCasino(ch, member.id, btn.guild.id, bet);
    else if (gameType === "coinflip") await playCoinflip(ch, member.id, btn.guild.id, bet);
    return;
  }

  // ── Nouvelle mise ─────────────────────────────────────────────────────────
  if (id.startsWith("game_newbet:")) {
    const gameType = id.split(":")[1] as string;
    await btn.deferUpdate();
    const ch = btn.channel as TextChannel;
    await ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x7c3aed)
          .setTitle("💰 Choisis ta nouvelle mise")
          .setDescription(`Solde actuel : **${await getCoins(btn.guild.id, member.id)} 🪙**`)
          .setFooter({ text: "MAI•GESTION" }),
      ],
      components: buildBetComponents(gameType),
    });
    return;
  }

  // ── Rejoindre un duel ─────────────────────────────────────────────────────
  if (id.startsWith("game_duel_join:")) {
    const parts = id.split(":");
    const challengerId = parts[1] as string;
    const bet = parseInt(parts[2] as string);

    if (member.id === challengerId) {
      await btn.reply({ content: "❌ Tu ne peux pas te défier toi-même !", ephemeral: true });
      return;
    }

    await btn.deferUpdate();

    const challenger = await btn.guild.members.fetch(challengerId).catch(() => null) as GuildMember | null;
    if (!challenger) {
      await btn.followUp({ content: "❌ Le challenger a quitté le serveur.", ephemeral: true });
      return;
    }

    await resolveDuel(btn.channel as TextChannel, challenger, member, btn.guild.id, bet);
    return;
  }

  // ── Revanche duel ─────────────────────────────────────────────────────────
  if (id.startsWith("game_duel_rematch:")) {
    const parts = id.split(":");
    const targetId = parts[1] as string;
    const bet = parseInt(parts[2] as string);
    await btn.deferUpdate();

    const target = await btn.guild.members.fetch(targetId).catch(() => null) as GuildMember | null;
    if (!target) {
      await btn.followUp({ content: "❌ Joueur introuvable.", ephemeral: true });
      return;
    }

    await startDuelPick(btn.channel as TextChannel, member, btn.guild.id, bet);
    return;
  }

  // ── Quitter ───────────────────────────────────────────────────────────────
  if (id === "game_quit") {
    await btn.deferUpdate();
    const ch = btn.channel as TextChannel;
    await ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x888888)
          .setTitle("👋 Partie terminée")
          .setDescription("Ce salon sera supprimé dans **5 secondes**...")
          .setFooter({ text: "MAI•GESTION" }),
      ],
    });
    setTimeout(() => ch.delete().catch(() => {}), 5000);
    return;
  }
}

// ── Handler menu de sélection d'adversaire ────────────────────────────────────
export async function handleGameSelect(interaction: UserSelectMenuInteraction): Promise<void> {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({ content: "❌ Erreur serveur.", ephemeral: true });
    return;
  }

  const id = interaction.customId;

  if (id.startsWith("game_duel_pick:")) {
    const bet = parseInt(id.split(":")[1] as string);
    const challenger = await interaction.guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
    const opponentId = interaction.values[0];

    if (!challenger || !opponentId) {
      await interaction.reply({ content: "❌ Impossible de récupérer les joueurs.", ephemeral: true });
      return;
    }

    if (opponentId === interaction.user.id) {
      await interaction.reply({ content: "❌ Tu ne peux pas te défier toi-même !", ephemeral: true });
      return;
    }

    const opponent = await interaction.guild.members.fetch(opponentId).catch(() => null) as GuildMember | null;
    if (!opponent || opponent.user.bot) {
      await interaction.reply({ content: "❌ Ce joueur est introuvable ou c'est un bot.", ephemeral: true });
      return;
    }

    await interaction.deferUpdate();
    await sendDuelChallenge(interaction.channel as TextChannel, challenger, opponent, interaction.guild.id, bet);
    return;
  }
}
