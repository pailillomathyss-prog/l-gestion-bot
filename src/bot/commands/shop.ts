import { Message, GuildMember, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getCoins, addCoins, getXP, upsertXP } from "../modules/db.js";
import { xpToLevel } from "../modules/expSystem.js";

export const SHOP_ROLES = [
  { id: "aventurier",  name: "🌴 Aventurier",   price: 500,    description: "Le premier rôle cosmétique du shop",   color: 0x2ecc71 },
  { id: "jungler",     name: "⛰️ Roi2laJungle",  price: 2500,   description: "Tu es le maître de la jungle !",       color: 0x27ae60 },
  { id: "perturbateur",name: "🎠 Perturbateur",  price: 8000,   description: "Tu adores mettre l'ambiance !",        color: 0xe67e22 },
  { id: "monarch",     name: "💎 Roi2Monarch",   price: 20000,  description: "Le rôle ultime — le sommet du shop !",  color: 0x3498db },
];

export const SHOP_XP = [
  { id: "xp_100",  label: "+100 XP",   price: 50,   xp: 100  },
  { id: "xp_500",  label: "+500 XP",   price: 200,  xp: 500  },
  { id: "xp_2000", label: "+2000 XP",  price: 700,  xp: 2000 },
];

export function buildGenericShopEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🧸 Boutique MAI•GESTION")
    .setDescription("Échange tes 🪙 pièces contre des rôles exclusifs ou de l'XP !")
    .addFields(
      {
        name: "🎭 Rôles exclusifs",
        value: SHOP_ROLES.map(r => `**${r.name}** — ${r.price.toLocaleString("fr-FR")} 🪙\n*${r.description}*`).join("\n\n"),
      },
      {
        name: "⭐ Boost XP",
        value: SHOP_XP.map(x => `**${x.label}** — ${x.price} 🪙`).join("\n"),
      },
      {
        name: "💡 Comment gagner des pièces ?",
        value: "• Messages : 8–15 🪙 (cooldown 1 min)\n• Vocal : 12 🪙 / 10 min\n• Quêtes : 150–700 🪙\n• Daily : 50–250 🪙",
      },
    )
    .setFooter({ text: "MAI•GESTION • Utilise les boutons pour acheter !" })
    .setTimestamp();
}

export function buildGenericShopComponents(): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...SHOP_ROLES.map(r =>
      new ButtonBuilder().setCustomId(`shop_buy_${r.id}`).setLabel(`${r.name} — ${r.price}🪙`).setStyle(ButtonStyle.Primary)
    ),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...SHOP_XP.map(x =>
      new ButtonBuilder().setCustomId(`shop_xp_${x.id}`).setLabel(`${x.label} — ${x.price}🪙`).setStyle(ButtonStyle.Success)
    ),
    new ButtonBuilder().setCustomId("shop_balance").setLabel("💰 Mon solde").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("shop_myitems").setLabel("🎒 Mes rôles").setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2];
}

export function buildPersonalShopEmbed(member: GuildMember, balance: number): EmbedBuilder {
  const owned = SHOP_ROLES.filter(r => member.roles.cache.some(role => role.name === r.name));
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🧸 Boutique — Ton profil")
    .addFields(
      { name: "💰 Solde", value: `**${balance.toLocaleString("fr-FR")} 🪙**`, inline: true },
      { name: "🎭 Rôles possédés", value: owned.length > 0 ? owned.map(r => r.name).join(", ") : "Aucun", inline: true },
    )
    .setFooter({ text: "MAI•GESTION" }).setTimestamp();
}

// ── Commandes prefix ──────────────────────────────────────────────────────────
export async function balanceCommand(message: Message) {
  if (!message.guild) return;
  const balance = await getCoins(message.guild.id, message.author.id);
  await message.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("💰 Ton solde")
      .setDescription(`**${balance.toLocaleString("fr-FR")} 🪙**`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
  }).catch(() => {});
}

export async function shopCommand(message: Message) {
  if (!message.guild) return;
  const balance = await getCoins(message.guild.id, message.author.id);
  const member = message.member as GuildMember;
  await message.reply({
    embeds: [buildPersonalShopEmbed(member, balance)],
  }).catch(() => {});
}

export async function buyCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;
  const query = args.join(" ").toLowerCase();
  const shopRole = SHOP_ROLES.find(r => r.name.toLowerCase().includes(query) || r.id.includes(query));
  if (!shopRole) {
    await message.reply(`❌ Rôle introuvable : \`${query}\`. Rôles disponibles : ${SHOP_ROLES.map(r => r.name).join(", ")}`).catch(() => {});
    return;
  }
  const balance = await getCoins(message.guild.id, message.author.id);
  if (balance < shopRole.price) {
    await message.reply(`❌ Solde insuffisant. Tu as **${balance} 🪙** mais il en faut **${shopRole.price} 🪙**.`).catch(() => {});
    return;
  }
  const alreadyHas = message.member.roles.cache.some(r => r.name === shopRole.name);
  if (alreadyHas) { await message.reply(`❌ Tu possèdes déjà **${shopRole.name}** !`).catch(() => {}); return; }
  let role = message.guild.roles.cache.find(r => r.name === shopRole.name);
  if (!role) role = await message.guild.roles.create({ name: shopRole.name, color: shopRole.color, permissions: [], reason: "Achat boutique" }).catch(() => undefined);
  if (!role) { await message.reply("❌ Impossible de créer le rôle.").catch(() => {}); return; }
  await addCoins(message.guild.id, message.author.id, -shopRole.price);
  await message.member.roles.add(role).catch(() => {});
  await message.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x00cc66)
      .setTitle("✅ Achat réussi !")
      .setDescription(`Tu as obtenu **${shopRole.name}** pour **${shopRole.price} 🪙** !`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
  }).catch(() => {});
}

// Handler bouton XP shop
export async function handleShopXpButton(
  btn: import("discord.js").ButtonInteraction,
  xpId: string
) {
  if (!btn.guild || !btn.member) return;
  const xpItem = SHOP_XP.find(x => x.id === xpId);
  if (!xpItem) { await btn.reply({ content: "❌ Article introuvable.", ephemeral: true }); return; }

  const balance = await getCoins(btn.guild.id, btn.user.id);
  if (balance < xpItem.price) {
    await btn.reply({ content: `❌ Solde insuffisant. Tu as **${balance} 🪙** mais il en faut **${xpItem.price} 🪙**.`, ephemeral: true });
    return;
  }

  await addCoins(btn.guild.id, btn.user.id, -xpItem.price);
  const data = await getXP(btn.guild.id, btn.user.id);
  const newXP = data.xp + xpItem.xp;
  await upsertXP(btn.guild.id, btn.user.id, newXP, xpToLevel(newXP), data.lastMessage);
  const newBal = await getCoins(btn.guild.id, btn.user.id);

  await btn.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x00cc66)
      .setTitle("⭐ XP achetée !")
      .setDescription(`**+${xpItem.xp} XP** pour **${xpItem.price} 🪙** !\n\nSolde restant : **${newBal} 🪙**`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
    ephemeral: true,
  });
}
