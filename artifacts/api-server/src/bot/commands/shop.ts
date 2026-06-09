import { Message, EmbedBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { getCoins, addCoins } from "../modules/db";

export const SHOP_ROLES = [
  { name: "🌴・aventurier",    price: 500,   description: "Le rôle de départ de l'aventure" },
  { name: "⛰️・roi2lajungle",  price: 2500,  description: "Pour ceux qui dominent la jungle" },
  { name: "🎠・perturbateur",  price: 8000,  description: "Les perturbateurs de l'ordre établi" },
  { name: "💎・roi2monarch",   price: 20000, description: "Le sommet absolu du pouvoir" },
];

function isShopChannel(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("rôle") || n.includes("role") || n.includes("shop") || n.includes("boutique");
}

export async function shopCommand(message: Message) {
  if (!message.guild) return;
  if (message.channel.type === ChannelType.GuildText && !isShopChannel(message.channel.name)) {
    await message.reply("❌ La boutique est disponible uniquement dans le salon **rôles** !").catch(() => {});
    return;
  }

  const balance = await getCoins(message.guild.id, message.author.id);
  const member = message.member!;

  const lines = SHOP_ROLES.map(r => {
    const owned = member.roles.cache.some(role => role.name === r.name);
    const canAfford = balance >= r.price;
    const status = owned ? "✅ Possédé" : canAfford ? "💰 Achetable" : "🔒 Insuffisant";
    return `${r.name}\n${r.description}\n**Prix :** ${r.price.toLocaleString()} 🪙 — ${status}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🏪 Boutique de rôles")
    .setDescription(lines.join("\n\n"))
    .addFields({ name: "💰 Ton solde", value: `**${balance.toLocaleString()} 🪙**`, inline: false })
    .setFooter({ text: "MAI•GESTION • !buy [nom du rôle] pour acheter" })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}

export async function buyCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;
  if (message.channel.type === ChannelType.GuildText && !isShopChannel(message.channel.name)) {
    await message.reply("❌ Les achats se font uniquement dans le salon **rôles** !").catch(() => {});
    return;
  }

  if (!args.length) {
    await message.reply("❌ Utilisation : `!buy [nom du rôle]`\nExemple : `!buy aventurier`").catch(() => {});
    return;
  }

  const search = args.join(" ").toLowerCase();
  const shopRole = SHOP_ROLES.find(r => r.name.toLowerCase().includes(search) || search.includes(r.name.toLowerCase().replace(/[^a-z0-9]/gi, "")));

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
    await message.reply(`❌ Pas assez de pièces ! Il te faut **${shopRole.price.toLocaleString()} 🪙** (tu as **${balance.toLocaleString()} 🪙**)`).catch(() => {});
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
      { name: "💸 Prix payé", value: `**${shopRole.price.toLocaleString()} 🪙**`, inline: true },
      { name: "💰 Solde restant", value: `**${newBalance.toLocaleString()} 🪙**`, inline: true },
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
    .setDescription(`**${balance.toLocaleString()} 🪙**`)
    .setFooter({ text: "MAI•GESTION • Gagne des pièces en chattant, en vocal et en faisant des quêtes !" })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}
