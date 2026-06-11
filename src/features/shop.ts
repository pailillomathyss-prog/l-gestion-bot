import {
  Guild, TextChannel, ChannelType, EmbedBuilder, GuildMember,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
} from "discord.js";
import { getUser, saveUser, setState } from "../db.js";
import { xpToLevel } from "./xp.js";

// ── Catalogue ─────────────────────────────────────────────────────────────────
export const SHOP_ROLES = [
  { id:"explorer",    name:"🌴 Explorateur",   price:300,   color:0x2ecc71, desc:"Premier rôle — pour les curieux" },
  { id:"hunter",      name:"🗡️ Chasseur",     price:1000,  color:0xe67e22, desc:"Tu commences à être sérieux" },
  { id:"noble",       name:"🏰 Noble",         price:3500,  color:0x3498db, desc:"Un rang respecté" },
  { id:"shadow",      name:"🌑 Ombre",         price:8000,  color:0x2c3e50, desc:"Mystérieux et redouté" },
  { id:"champion",    name:"🏆 Champion",      price:18000, color:0xffd700, desc:"L'élite du serveur" },
  { id:"legend",      name:"🌌 Légende",       price:50000, color:0x9b59b6, desc:"Rang ultime — très rare" },
] as const;

export const SHOP_XP = [
  { id:"xp_s", label:"+500 XP",   price:80,   xp:500   },
  { id:"xp_m", label:"+2 000 XP", price:250,  xp:2000  },
  { id:"xp_l", label:"+7 500 XP", price:700,  xp:7500  },
  { id:"xp_xl",label:"+20 000 XP",price:1600, xp:20000 },
] as const;

export const SHOP_MISC = [
  { id:"coins_x2", label:"🔮 Double coins 1h",  price:500,  desc:"×2 sur les pièces gagnées pendant 1h" },
  { id:"xp_x2",   label:"⚡ Double XP 1h",      price:400,  desc:"×2 sur l'XP gagnée pendant 1h" },
] as const;

// ── Panel 🎠・shop ─────────────────────────────────────────────────────────────
export async function postShopIfNeeded(guild: Guild, botId: string) {
  const ch = guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText &&
    (c.name.includes("🎠") || c.name.includes("shop") || c.name.includes("boutique") || c.name.includes("🧸"))
  ) as TextChannel | undefined;
  if (!ch) return;

  const recent = await ch.messages.fetch({ limit: 10 }).catch(() => null);
  if (recent?.some(m => m.author.id === botId && m.embeds[0]?.title?.includes("Boutique"))) return;

  const rolesVal = SHOP_ROLES.map(r =>
    `**${r.name}** — \`${r.price.toLocaleString("fr-FR")}🪙\`\n*${r.desc}*`
  ).join("\n");

  const xpVal = SHOP_XP.map(x =>
    `**${x.label}** — \`${x.price}🪙\``
  ).join("\n");

  const miscVal = SHOP_MISC.map(m =>
    `**${m.label}** — \`${m.price}🪙\`\n*${m.desc}*`
  ).join("\n");

  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("🎠 Boutique MAI•GESTION")
        .setDescription("Échange tes **🪙 pièces** contre des rôles exclusifs, de l'XP ou des boosts !")
        .addFields(
          { name: "🎭 Rôles exclusifs",   value: rolesVal,  inline: false },
          { name: "⭐ Achats d'XP",       value: xpVal,     inline: true  },
          { name: "🔮 Boosts temporaires",value: miscVal,   inline: true  },
          { name: "💡 Comment gagner des 🪙", value: "• Messages : **10–20🪙**/min\n• Vocal : **15🪙**/5min\n• `!daily` : **50–300🪙**\n• Jeux dans 👾・jeux", inline: false },
        )
        .setFooter({ text: "MAI•GESTION • Clique sur un bouton pour acheter !" })
        .setTimestamp(),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        SHOP_ROLES.slice(0, 4).map(r =>
          new ButtonBuilder()
            .setCustomId(`shop_r_${r.id}`)
            .setLabel(`${r.name} · ${r.price.toLocaleString("fr-FR")}🪙`)
            .setStyle(ButtonStyle.Primary)
        )
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        SHOP_ROLES.slice(4).map(r =>
          new ButtonBuilder()
            .setCustomId(`shop_r_${r.id}`)
            .setLabel(`${r.name} · ${r.price.toLocaleString("fr-FR")}🪙`)
            .setStyle(ButtonStyle.Primary)
        ),
        new ButtonBuilder().setCustomId("shop_balance").setLabel("💰 Mon solde").setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        SHOP_XP.map(x =>
          new ButtonBuilder()
            .setCustomId(`shop_x_${x.id}`)
            .setLabel(`${x.label} · ${x.price}🪙`)
            .setStyle(ButtonStyle.Success)
        )
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        SHOP_MISC.map(m =>
          new ButtonBuilder()
            .setCustomId(`shop_m_${m.id}`)
            .setLabel(`${m.label} · ${m.price}🪙`)
            .setStyle(ButtonStyle.Secondary)
        )
      ),
    ],
  }).catch(() => {});
  console.log(`🎠 Shop → #${ch.name}`);
}

// ── Handler boutons ───────────────────────────────────────────────────────────
export async function handleShopButton(btn: ButtonInteraction) {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur guild.", ephemeral: true }); return; }

  await btn.deferReply({ ephemeral: true });

  const data = await getUser(btn.guild.id, btn.user.id);

  // ── Solde ─────────────────────────────────────────────────────────────────
  if (btn.customId === "shop_balance") {
    await btn.editReply({ embeds: [
      new EmbedBuilder().setColor(0xffd700).setTitle("💰 Ton solde")
        .setDescription(`**${data.coins.toLocaleString("fr-FR")} 🪙**`)
        .addFields(
          { name:"⭐ XP",    value: data.xp.toLocaleString("fr-FR"), inline:true },
          { name:"🏆 Niveau",value: String(data.level),              inline:true },
        )
        .setFooter({ text:"MAI•GESTION" }).setTimestamp(),
    ] });
    return;
  }

  // ── Rôle ──────────────────────────────────────────────────────────────────
  if (btn.customId.startsWith("shop_r_")) {
    const rid = btn.customId.replace("shop_r_", "");
    const sr  = SHOP_ROLES.find(r => r.id === rid);
    if (!sr) { await btn.editReply({ content: "❌ Article introuvable." }); return; }

    const member = await btn.guild.members.fetch(btn.user.id).catch(() => null) as GuildMember | null;
    if (!member) { await btn.editReply({ content: "❌ Erreur membre." }); return; }

    if (member.roles.cache.some(r => r.name === sr.name)) {
      await btn.editReply({ content: `❌ Tu possèdes déjà le rôle **${sr.name}** !` });
      return;
    }
    if (data.coins < sr.price) {
      await btn.editReply({ embeds: [
        new EmbedBuilder().setColor(0xff4444).setTitle("❌ Solde insuffisant")
          .setDescription(`Il te faut **${sr.price.toLocaleString("fr-FR")}🪙**\nTu as **${data.coins.toLocaleString("fr-FR")}🪙**\nManque : **${(sr.price - data.coins).toLocaleString("fr-FR")}🪙**`)
          .setFooter({ text:"MAI•GESTION" }).setTimestamp(),
      ] });
      return;
    }

    let role = btn.guild.roles.cache.find(r => r.name === sr.name);
    if (!role) role = await btn.guild.roles.create({ name: sr.name, color: sr.color, permissions: [], reason: "MAI•GESTION shop" }).catch(() => undefined);
    if (!role) { await btn.editReply({ content: "❌ Impossible de créer le rôle (permission manquante)." }); return; }

    await saveUser(btn.guild.id, btn.user.id, { ...data, coins: data.coins - sr.price });
    await member.roles.add(role).catch(() => {});
    await btn.editReply({ embeds: [
      new EmbedBuilder().setColor(0x00cc66).setTitle("✅ Achat réussi !")
        .setDescription(`Rôle **${sr.name}** obtenu ! 🎉\n💰 Solde restant : **${(data.coins - sr.price).toLocaleString("fr-FR")}🪙**`)
        .setFooter({ text:"MAI•GESTION" }).setTimestamp(),
    ] });
    return;
  }

  // ── XP ────────────────────────────────────────────────────────────────────
  if (btn.customId.startsWith("shop_x_")) {
    const xid = btn.customId.replace("shop_x_", "");
    const xi  = SHOP_XP.find(x => x.id === xid);
    if (!xi) { await btn.editReply({ content: "❌ Article introuvable." }); return; }
    if (data.coins < xi.price) {
      await btn.editReply({ content: `❌ Solde insuffisant : **${data.coins.toLocaleString("fr-FR")}🪙** / **${xi.price}🪙** requis.` });
      return;
    }
    const newXP  = data.xp + xi.xp;
    const newLvl = xpToLevel(newXP);
    await saveUser(btn.guild.id, btn.user.id, { ...data, xp: newXP, level: newLvl, coins: data.coins - xi.price });
    await btn.editReply({ embeds: [
      new EmbedBuilder().setColor(0x00cc66).setTitle("⭐ XP achetée !")
        .setDescription(`**+${xi.xp.toLocaleString("fr-FR")} XP** pour **${xi.price}🪙** !\n⭐ Total XP : **${newXP.toLocaleString("fr-FR")}** — Niveau **${newLvl}**\n💰 Solde restant : **${(data.coins - xi.price).toLocaleString("fr-FR")}🪙**`)
        .setFooter({ text:"MAI•GESTION" }).setTimestamp(),
    ] });
    return;
  }

  // ── Boosts temporaires ────────────────────────────────────────────────────
  if (btn.customId.startsWith("shop_m_")) {
    const mid = btn.customId.replace("shop_m_", "");
    const mi  = SHOP_MISC.find(m => m.id === mid);
    if (!mi) { await btn.editReply({ content: "❌ Article introuvable." }); return; }
    if (data.coins < mi.price) {
      await btn.editReply({ content: `❌ Solde insuffisant : **${data.coins.toLocaleString("fr-FR")}🪙** / **${mi.price}🪙** requis.` });
      return;
    }
    await saveUser(btn.guild.id, btn.user.id, { ...data, coins: data.coins - mi.price });
    const boostKey = `boost_${mid}:${btn.guild.id}:${btn.user.id}`;
    await setState(boostKey, String(Date.now() + 3_600_000));
    await btn.editReply({ embeds: [
      new EmbedBuilder().setColor(0xffd700).setTitle("🔮 Boost activé !")
        .setDescription(`**${mi.label}** actif pendant **1h** !\n💰 Solde restant : **${(data.coins - mi.price).toLocaleString("fr-FR")}🪙**`)
        .setFooter({ text:"MAI•GESTION • Boost expire dans 1h" }).setTimestamp(),
    ] });
    return;
  }
}
