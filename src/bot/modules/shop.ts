import {
  Guild, GuildMember, TextChannel, ChannelType, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
} from "discord.js";
import { logger } from "../../lib/logger";
import { getCoins, addCoins, upsertXP, getXP } from "./db";
import { xpToLevel, applyLevelRole, announceLevel } from "./expSystem";
import { ensurePanel } from "./panelUtils";

// ── Catalogue ──────────────────────────────────────────────────────────────────
export const SHOP_ROLES = [
  { id: "aventurier",   name: "🌴 Aventurier",   price: 500   },
  { id: "roi2lajungle", name: "🦅 Roi2laJungle",  price: 2500  },
  { id: "perturbateur", name: "🦁 Perturbateur",  price: 8000  },
  { id: "roi2monarch",  name: "💎 Roi2Monarch",   price: 20000 },
];

export const SHOP_XP = [
  { id: "xp250",  label: "+250 XP",  xp: 250,  price: 100  },
  { id: "xp1000", label: "+1000 XP", xp: 1000, price: 350  },
  { id: "xp5000", label: "+5000 XP", xp: 5000, price: 1500 },
];

// ── Embed principal ────────────────────────────────────────────────────────────
export function buildShopEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🧸 Boutique — MAI•GESTION")
    .addFields(
      {
        name: "🐾 Rôles",
        value: SHOP_ROLES.map(r => `${r.name} — **${r.price.toLocaleString("fr-FR")} 🪙**`).join("\n"),
        inline: false,
      },
      {
        name: "⭐ XP",
        value: SHOP_XP.map(x => `${x.label} — **${x.price.toLocaleString("fr-FR")} 🪙**`).join("\n"),
        inline: false,
      },
      {
        name: "💡 Gagner",
        value: "Messages : 10–20 🪙/min | Vocal : 15 🪙/5min | `!daily` : 50–300 🪙",
        inline: false,
      },
    )
    .setFooter({ text: "MAI•GESTION • Utilise les boutons !" })
    .setTimestamp();
}

// ── Boutons ────────────────────────────────────────────────────────────────────
export function buildShopComponents(): ActionRowBuilder<ButtonBuilder>[] {
  const rolesRows = SHOP_ROLES.map(r =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`shop_role_${r.id}`)
        .setLabel(`${r.name}  ${r.price.toLocaleString("fr-FR")} 🪙`)
        .setStyle(ButtonStyle.Primary)
    )
  );

  const xpRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...SHOP_XP.map(x =>
      new ButtonBuilder()
        .setCustomId(`shop_xp_${x.id}`)
        .setLabel(`${x.label} — ${x.price.toLocaleString("fr-FR")} 🪙`)
        .setStyle(ButtonStyle.Success)
    ),
    new ButtonBuilder()
      .setCustomId("shop_balance")
      .setLabel("💰 Mon solde")
      .setStyle(ButtonStyle.Secondary),
  );

  return [...rolesRows, xpRow];
}

// ── Post panel dans le salon shop ──────────────────────────────────────────────
export async function postShopPanelIfNeeded(guild: Guild, botId: string): Promise<void> {
  const ch = guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText &&
    (c.name.toLowerCase().includes("shop") || c.name.toLowerCase().includes("boutique") ||
     c.name.includes("🧸"))
  ) as TextChannel | undefined;
  if (!ch) return;

  await ensurePanel(
    ch, botId,
    "Boutique",
    "shop_role_aventurier",
    buildShopEmbed,
    buildShopComponents,
    "🧸 Shop",
  );
}

// ── Gestion des boutons ────────────────────────────────────────────────────────
export async function handleShopButton(btn: ButtonInteraction): Promise<void> {
  if (!btn.guild || !btn.member) {
    await btn.reply({ content: "❌ Erreur serveur.", ephemeral: true });
    return;
  }

  const customId = btn.customId;
  const guildId  = btn.guild.id;
  const userId   = btn.user.id;

  await btn.deferReply({ ephemeral: true });

  const member = await btn.guild.members.fetch(userId).catch(() => null) as GuildMember | null;
  if (!member) { await btn.editReply("❌ Profil introuvable."); return; }

  // ── Solde ──────────────────────────────────────────────────────────────────
  if (customId === "shop_balance") {
    const bal = await getCoins(guildId, userId);
    await btn.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("💰 Ton solde")
        .setDescription(`Tu possèdes **${bal.toLocaleString("fr-FR")} 🪙**`)
        .setFooter({ text: "MAI•GESTION" })
        .setTimestamp()],
    });
    return;
  }

  // ── Achat rôle ─────────────────────────────────────────────────────────────
  if (customId.startsWith("shop_role_")) {
    const roleId   = customId.replace("shop_role_", "");
    const shopRole = SHOP_ROLES.find(r => r.id === roleId);
    if (!shopRole) { await btn.editReply("❌ Article introuvable."); return; }

    const already = member.roles.cache.some(r => r.name === shopRole.name);
    if (already) { await btn.editReply(`❌ Tu possèdes déjà le rôle **${shopRole.name}** !`); return; }

    const bal = await getCoins(guildId, userId);
    if (bal < shopRole.price) {
      await btn.editReply(
        `❌ Pas assez de pièces ! Il te faut **${shopRole.price.toLocaleString("fr-FR")} 🪙** (tu as **${bal.toLocaleString("fr-FR")} 🪙**)`
      );
      return;
    }

    await btn.guild.roles.fetch();
    let role = btn.guild.roles.cache.find(r => r.name === shopRole.name);
    if (!role) {
      role = await btn.guild.roles.create({ name: shopRole.name, reason: "Achat boutique MAI•GESTION", permissions: [] }).catch(() => undefined);
    }
    if (!role) { await btn.editReply("❌ Impossible de créer le rôle."); return; }

    await addCoins(guildId, userId, -shopRole.price);
    await member.roles.add(role).catch(() => {});

    const newBal = await getCoins(guildId, userId);
    await btn.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Achat réussi !")
        .setDescription(`Tu as obtenu le rôle **${shopRole.name}** !`)
        .addFields({ name: "💰 Solde restant", value: `**${newBal.toLocaleString("fr-FR")} 🪙**`, inline: true })
        .setFooter({ text: "MAI•GESTION" })
        .setTimestamp()],
    });
    return;
  }

  // ── Achat XP ───────────────────────────────────────────────────────────────
  if (customId.startsWith("shop_xp_")) {
    const xpId   = customId.replace("shop_xp_", "");
    const shopXP = SHOP_XP.find(x => x.id === xpId);
    if (!shopXP) { await btn.editReply("❌ Article introuvable."); return; }

    const bal = await getCoins(guildId, userId);
    if (bal < shopXP.price) {
      await btn.editReply(
        `❌ Pas assez de pièces ! Il te faut **${shopXP.price.toLocaleString("fr-FR")} 🪙** (tu as **${bal.toLocaleString("fr-FR")} 🪙**)`
      );
      return;
    }

    await addCoins(guildId, userId, -shopXP.price);

    const data   = await getXP(guildId, userId);
    const oldLvl = data.level;
    const newXP  = data.xp + shopXP.xp;
    const newLvl = xpToLevel(newXP);
    const lvlUp  = newLvl > oldLvl;
    await upsertXP(guildId, userId, newXP, newLvl, data.lastMessage);

    // Attribuer le rôle de niveau et annoncer si palier atteint
    if (lvlUp) {
      await applyLevelRole(member, newLvl).catch(() => {});
      await announceLevel(member, newLvl).catch(() => {});
    }

    const newBal = await getCoins(guildId, userId);
    const lvlUpLine = lvlUp
      ? `\n🎉 **Niveau ${newLvl} atteint !** Ton rôle de palier a été mis à jour.`
      : "";

    await btn.editReply({
      embeds: [new EmbedBuilder()
        .setColor(lvlUp ? 0xffd700 : 0x57f287)
        .setTitle(lvlUp ? "⬆️ XP achetés — Montée de niveau !" : "✅ XP achetés !")
        .setDescription(`Tu as reçu **${shopXP.xp.toLocaleString("fr-FR")} XP** !${lvlUpLine}`)
        .addFields(
          { name: "⭐ XP total",      value: `**${newXP.toLocaleString("fr-FR")} XP**`, inline: true },
          { name: "🏆 Niveau",        value: `**${newLvl}**`,                            inline: true },
          { name: "💰 Solde restant", value: `**${newBal.toLocaleString("fr-FR")} 🪙**`, inline: true },
        )
        .setFooter({ text: "MAI•GESTION" })
        .setTimestamp()],
    });
    return;
  }

  await btn.editReply("❌ Action inconnue.");
}
