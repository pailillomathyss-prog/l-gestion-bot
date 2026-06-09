import {
  Message,
  EmbedBuilder,
  ChannelType,
  GuildMember,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { getCoins, addCoins } from "../modules/db";

export const SHOP_ROLES = [
  { id: "aventurier",    name: "🌴・aventurier",   price: 500,   description: "Le rôle de départ de l'aventure" },
  { id: "roi2lajungle",  name: "⛰️・roi2lajungle", price: 2500,  description: "Pour ceux qui dominent la jungle" },
  { id: "perturbateur",  name: "🎠・perturbateur",  price: 8000,  description: "Les perturbateurs de l'ordre établi" },
  { id: "roi2monarch",   name: "💎・roi2monarch",   price: 20000, description: "Le sommet absolu du pouvoir" },
];

export function buildGenericShopEmbed(): EmbedBuilder {
  const NUMS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
  const lines = SHOP_ROLES.map((r, i) =>
    `${NUMS[i]} **${r.name}**\n┣ ${r.description}\n┗ **Prix :** ${r.price.toLocaleString("fr-FR")} 🪙`
  );

  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🏪 Boutique — MAI•GESTION")
    .setDescription(
      "Bienvenue dans la boutique ! Clique sur un bouton ci-dessous pour acheter un rôle.\n" +
      "Gagne des pièces en chattant 💬, en vocal 🎙️ et en faisant des quêtes 🎯\n\n" +
      lines.join("\n\n")
    )
    .addFields({ name: "ℹ️ Astuce", value: "Utilise `/balance` ou `!balance` pour voir ton solde.", inline: false })
    .setFooter({ text: "MAI•GESTION • Panneau de boutique" })
    .setTimestamp();
}

export function buildGenericShopComponents(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const r of SHOP_ROLES) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`shop_buy_${r.id}`)
        .setLabel(`${r.name} — ${r.price.toLocaleString("fr-FR")} 🪙`)
        .setStyle(ButtonStyle.Primary)
    );
  }

  const utilRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("shop_balance")
      .setLabel("💰 Voir mon solde")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("shop_myitems")
      .setLabel("🎒 Mes rôles")
      .setStyle(ButtonStyle.Secondary),
  );

  return [row, utilRow];
}

export function buildPersonalShopEmbed(member: GuildMember, balance: number): EmbedBuilder {
  const NUMS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
  const lines = SHOP_ROLES.map((r, i) => {
    const owned = member.roles.cache.some(role => role.name === r.name);
    const canAfford = balance >= r.price;
    const status = owned ? "✅ Possédé" : canAfford ? "💰 Achetable" : "🔒 Insuffisant";
    return `${NUMS[i]} **${r.name}**\n┣ ${r.description}\n┣ **Prix :** ${r.price.toLocaleString("fr-FR")} 🪙\n┗ ${status}`;
  });

  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🏪 Boutique personnalisée")
    .setDescription(lines.join("\n\n"))
    .addFields({ name: "💰 Ton solde", value: `**${balance.toLocaleString("fr-FR")} 🪙**`, inline: false })
    .setFooter({ text: "MAI•GESTION • Rends-toi dans 🧸・shop pour acheter" })
    .setTimestamp();
}

// ── Commandes legacy (prefix) ─────────────────────────────────────────────────

export async function shopCommand(message: Message) {
  if (!message.guild || !message.member) return;
  const balance = await getCoins(message.guild.id, message.author.id);
  const embed = buildPersonalShopEmbed(message.member as GuildMember, balance);
  await message.reply({ embeds: [embed] }).catch(() => {});
}

export async function buyCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;

  if (!args.length) {
    await message.reply("❌ Utilisation : `!buy [nom du rôle]`\nExemple : `!buy aventurier`").catch(() => {});
    return;
  }

  const search = args.join(" ").toLowerCase();
  const shopRole = SHOP_ROLES.find(r =>
    r.name.toLowerCase().includes(search) || r.id.includes(search)
  );

  if (!shopRole) {
    await message.reply("❌ Rôle introuvable. Tape `!shop` pour voir la liste.").catch(() => {});
    return;
  }

  const alreadyHas = message.member.roles.cache.some(r => r.name === shopRole.name);
  if (alreadyHas) {
    await message.reply("❌ Tu possèdes déjà ce rôle !").catch(() => {});
    return;
  }

  const balance = await getCoins(message.guild.id, message.author.id);
  if (balance < shopRole.price) {
    await message.reply(
      `❌ Pas assez de pièces ! Il te faut **${shopRole.price.toLocaleString("fr-FR")} 🪙** (tu as **${balance.toLocaleString("fr-FR")} 🪙**)`
    ).catch(() => {});
    return;
  }

  await message.guild.roles.fetch();
  let role = message.guild.roles.cache.find(r => r.name === shopRole.name);
  if (!role) {
    try {
      role = await message.guild.roles.create({ name: shopRole.name, reason: "Rôle boutique MAI•GESTION", permissions: [] });
    } catch {
      await message.reply("❌ Impossible de créer le rôle. Vérifie les permissions du bot.").catch(() => {});
      return;
    }
  }

  await addCoins(message.guild.id, message.author.id, -shopRole.price);
  await message.member.roles.add(role).catch(() => {});
  const newBalance = await getCoins(message.guild.id, message.author.id);

  const embed = new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle("✅ Achat réussi !")
    .setDescription(`Tu as obtenu le rôle **${shopRole.name}** !`)
    .addFields(
      { name: "💸 Prix payé", value: `**${shopRole.price.toLocaleString("fr-FR")} 🪙**`, inline: true },
      { name: "💰 Solde restant", value: `**${newBalance.toLocaleString("fr-FR")} 🪙**`, inline: true },
    )
    .setFooter({ text: "MAI•GESTION" })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}

export async function balanceCommand(message: Message) {
  if (!message.guild) return;
  const balance = await getCoins(message.guild.id, message.author.id);

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("💰 Ton solde")
    .setDescription(`**${balance.toLocaleString("fr-FR")} 🪙**`)
    .setFooter({ text: "MAI•GESTION • Gagne des pièces en chattant, en vocal et en faisant des quêtes !" })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}
