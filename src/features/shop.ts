import {
  Guild, TextChannel, ChannelType, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, GuildMember,
} from "discord.js";
import { getUser, saveUser } from "../db.js";
import { xpToLevel } from "./xp.js";

const SHOP_ROLES = [
  { id: "aventurier",  name: "🌴 Aventurier",    price: 500,    color: 0x2ecc71, desc: "Le premier rôle exclusif du shop !" },
  { id: "jungler",     name: "⛰️ Roi2laJungle",  price: 2500,   color: 0x27ae60, desc: "Maître de la jungle !" },
  { id: "perturbateur",name: "🎠 Perturbateur",  price: 8000,   color: 0xe67e22, desc: "Tu mets l'ambiance !" },
  { id: "monarch",     name: "💎 Roi2Monarch",   price: 20000,  color: 0x3498db, desc: "Le rôle ultime du shop !" },
] as const;

const SHOP_XP = [
  { id: "xp_s", label: "+250 XP",  price: 100,  xp: 250  },
  { id: "xp_m", label: "+1000 XP", price: 350,  xp: 1000 },
  { id: "xp_l", label: "+5000 XP", price: 1500, xp: 5000 },
] as const;

function buildShopEmbed(coins?: number) {
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🧸 Boutique MAI•GESTION")
    .setDescription(`Échange tes 🪙 pièces contre des rôles exclusifs ou de l'XP !${coins !== undefined ? `\n\n💰 **Ton solde : ${coins.toLocaleString("fr-FR")} 🪙**` : ""}`)
    .addFields(
      { name: "🎭 Rôles exclusifs", value: SHOP_ROLES.map(r => `**${r.name}** — ${r.price.toLocaleString("fr-FR")} 🪙\n*${r.desc}*`).join("\n\n") },
      { name: "⭐ Boost XP", value: SHOP_XP.map(x => `**${x.label}** — ${x.price} 🪙`).join("\n") },
      { name: "💡 Comment gagner des pièces ?", value: "• Messages : 10–20 🪙/min\n• Vocal : 15 🪙/5 min\n• Daily : 50–300 🪙\n• Giveaways" },
    )
    .setFooter({ text: "MAI•GESTION • Utilise les boutons pour acheter !" }).setTimestamp();
}

function buildShopComponents(): ActionRowBuilder<ButtonBuilder>[] {
  const r1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...SHOP_ROLES.map(r => new ButtonBuilder().setCustomId(`shop_r_${r.id}`).setLabel(`${r.name} ${r.price}🪙`).setStyle(ButtonStyle.Primary))
  );
  const r2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...SHOP_XP.map(x => new ButtonBuilder().setCustomId(`shop_x_${x.id}`).setLabel(`${x.label} — ${x.price}🪙`).setStyle(ButtonStyle.Success)),
    new ButtonBuilder().setCustomId("shop_balance").setLabel("💰 Mon solde").setStyle(ButtonStyle.Secondary),
  );
  return [r1, r2];
}

export async function postShopIfNeeded(guild: Guild, botId: string) {
  const ch = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText && (c.name.includes("shop") || c.name.includes("boutique") || c.name.includes("🧸"))
  ) as TextChannel | undefined;
  if (!ch) return;
  const recent = await ch.messages.fetch({ limit: 10 }).catch(() => null);
  if (recent?.some(m => m.author.id === botId && m.embeds[0]?.title?.includes("Boutique"))) return;
  await ch.send({ embeds: [buildShopEmbed()], components: buildShopComponents() }).catch(() => {});
  console.log(`🧸 Shop posté dans #${ch.name}`);
}

export async function handleShopButton(btn: ButtonInteraction) {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }
  const data = await getUser(btn.guild.id, btn.user.id);

  if (btn.customId === "shop_balance") {
    await btn.reply({ embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("💰 Ton solde").setDescription(`**${data.coins.toLocaleString("fr-FR")} 🪙**`).setFooter({text:"MAI•GESTION"}).setTimestamp()], ephemeral: true });
    return;
  }

  if (btn.customId.startsWith("shop_r_")) {
    const roleId = btn.customId.replace("shop_r_", "");
    const shopRole = SHOP_ROLES.find(r => r.id === roleId);
    if (!shopRole) { await btn.reply({ content: "❌ Rôle introuvable.", ephemeral: true }); return; }
    const member = await btn.guild.members.fetch(btn.user.id).catch(() => null) as GuildMember | null;
    if (!member) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }
    if (member.roles.cache.some(r => r.name === shopRole.name)) {
      await btn.reply({ content: `❌ Tu possèdes déjà **${shopRole.name}** !`, ephemeral: true }); return;
    }
    if (data.coins < shopRole.price) {
      await btn.reply({ embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("❌ Solde insuffisant").setDescription(`Il te faut **${shopRole.price.toLocaleString("fr-FR")} 🪙**.\nTu as **${data.coins.toLocaleString("fr-FR")} 🪙**.`).setFooter({text:"MAI•GESTION"}).setTimestamp()], ephemeral: true }); return;
    }
    let role = btn.guild.roles.cache.find(r => r.name === shopRole.name);
    if (!role) role = await btn.guild.roles.create({ name: shopRole.name, color: shopRole.color, permissions: [], reason: "Achat boutique MAI•GESTION" }).catch(() => undefined);
    if (!role) { await btn.reply({ content: "❌ Impossible de créer le rôle.", ephemeral: true }); return; }
    await saveUser(btn.guild.id, btn.user.id, { ...data, coins: data.coins - shopRole.price });
    await member.roles.add(role).catch(() => {});
    await btn.reply({ embeds: [new EmbedBuilder().setColor(0x00cc66).setTitle("✅ Achat réussi !").setDescription(`Tu as obtenu **${shopRole.name}** !\n\nSolde restant : **${(data.coins - shopRole.price).toLocaleString("fr-FR")} 🪙**`).setFooter({text:"MAI•GESTION"}).setTimestamp()], ephemeral: true });
    return;
  }

  if (btn.customId.startsWith("shop_x_")) {
    const xId = btn.customId.replace("shop_x_", "");
    const xpItem = SHOP_XP.find(x => x.id === xId);
    if (!xpItem) { await btn.reply({ content: "❌ Article introuvable.", ephemeral: true }); return; }
    if (data.coins < xpItem.price) {
      await btn.reply({ content: `❌ Solde insuffisant. Tu as **${data.coins} 🪙** / besoin de **${xpItem.price} 🪙**.`, ephemeral: true }); return;
    }
    const newXP = data.xp + xpItem.xp;
    await saveUser(btn.guild.id, btn.user.id, { ...data, xp: newXP, level: xpToLevel(newXP), coins: data.coins - xpItem.price });
    await btn.reply({ embeds: [new EmbedBuilder().setColor(0x00cc66).setTitle("⭐ XP achetée !").setDescription(`**+${xpItem.xp} XP** pour **${xpItem.price} 🪙** !\n\nSolde restant : **${(data.coins - xpItem.price).toLocaleString("fr-FR")} 🪙**`).setFooter({text:"MAI•GESTION"}).setTimestamp()], ephemeral: true });
  }
}
