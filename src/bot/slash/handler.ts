import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ChannelType,
  TextChannel,
  GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { getCoins, getAllXP, getDailyReward, setDailyReward, addCoins } from "../modules/db";
import { buildGenericShopEmbed, buildGenericShopComponents, buildPersonalShopEmbed, SHOP_ROLES } from "../commands/shop";
import { getUserData } from "../modules/expSystem";
import { getMyQuestProgress, claimQuest, launchCustomQuest } from "../modules/questSystem";
import { logger } from "../../lib/logger";
import { jackpotCommand, postJackpotPanelIfNeeded } from "../../features/jackpot.js";

export async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
  const { commandName, guild, member } = interaction;

  if (!guild || !member) {
    await interaction.reply({ content: "❌ Cette commande n'est disponible qu'en serveur.", ephemeral: true });
    return;
  }

  const guildMember = member as GuildMember;

  switch (commandName) {

    // ── help ──────────────────────────────────────────────────────────────────
    case "help": {
      const isAdmin = guildMember.permissions.has(PermissionFlagsBits.Administrator);
      const publicFields = [
        { name: "📊 `/rank [@membre]`",       value: "Profil XP d'un membre.", inline: false },
        { name: "🏆 `/leaderboard`",           value: "Top 10 membres.", inline: false },
        { name: "💰 `/balance`",               value: "Ton solde de pièces.", inline: false },
        { name: "🧸 `/shop`",                  value: "Boutique de rôles.", inline: false },
        { name: "🛒 `/buy [rôle]`",            value: "Acheter un rôle.", inline: false },
        { name: "🪙 `/coinflip [mise]`",       value: "Pile ou face.", inline: false },
        { name: "🎰 `/slot [mise]`",           value: "Machine à sous.", inline: false },
        { name: "🎁 `/daily`",                 value: "Récompense quotidienne avec streak.", inline: false },
        { name: "🎯 `/quest`",                 value: "Ta progression de quête.", inline: false },
        { name: "✅ `/claim`",                 value: "Réclamer la récompense de quête.", inline: false },
        { name: "⚠️ `/warn [@membre]`",        value: "Statut de sanction.", inline: false },
        { name: "❓ `/help`",                  value: "Cette aide.", inline: false },
      ];
      const adminFields = [
        { name: "🔨 `/ban @membre [raison]`",  value: "Bannir un membre.", inline: false },
        { name: "🔓 `/unban [ID]`",            value: "Débannir un membre.", inline: false },
        { name: "🔇 `/mute @membre`",          value: "Muter un membre.", inline: false },
        { name: "🔊 `/demute @membre`",        value: "Démuter un membre.", inline: false },
        { name: "🔒 `/lock`",                  value: "Verrouiller le salon.", inline: false },
        { name: "🔓 `/unlock`",                value: "Déverrouiller le salon.", inline: false },
        { name: "🗑️ `/clear [nombre]`",       value: "Supprimer des messages.", inline: false },
        { name: "✅ `/pardon @membre`",        value: "Lever une sanction.", inline: false },
        { name: "🎉 `/giveaway [prix] [durée]`", value: "Lancer un giveaway.", inline: false },
        { name: "🎯 `/event [type] [cible] [récompense] [durée]`", value: "Quête communautaire custom. Types : `messages`, `xp`, `vocal`", inline: false },
        { name: "🔄 `/syncperms`",             value: "Sync permissions des salons.", inline: false },
        { name: "🧸 `/postshop`",              value: "Poster le panneau boutique.", inline: false },
      ];
      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("📖 Aide — MAI•GESTION")
        .setDescription("Toutes les commandes disponibles en `/` et `!`")
        .addFields({ name: "━━━━━━ Commandes publiques ━━━━━━", value: "\u200B" }, ...publicFields);
      if (isAdmin) embed.addFields({ name: "━━━━━━ Commandes admin ━━━━━━", value: "\u200B" }, ...adminFields);
      embed.setFooter({ text: "MAI•GESTION" }).setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    // ── rank ──────────────────────────────────────────────────────────────────
    case "rank": {
      const target = interaction.options.getUser("membre");
      const targetMember = target ? await guild.members.fetch(target.id).catch(() => null) : guildMember;
      if (!targetMember) { await interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true }); return; }
      const data = await getUserData(guild.id, targetMember.id);
      const coins = await getCoins(guild.id, targetMember.id);
      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(`📊 Profil de ${targetMember.displayName}`)
        .addFields(
          { name: "⭐ XP",       value: `**${data.xp}**`,    inline: true },
          { name: "🏆 Niveau",   value: `**${data.level}**`, inline: true },
          { name: "💰 Pièces",   value: `**${coins} 🪙**`,   inline: true },
        )
        .setThumbnail(targetMember.user.displayAvatarURL())
        .setFooter({ text: "MAI•GESTION" }).setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    // ── leaderboard ───────────────────────────────────────────────────────────
    case "leaderboard": {
      await interaction.deferReply({ ephemeral: true });
      const all = await getAllXP(guild.id);
      const top = all.slice(0, 10);
      const lines = await Promise.all(top.map(async (u, i) => {
        const m = await guild.members.fetch(u.userId).catch(() => null);
        const name = m?.displayName ?? `<@${u.userId}>`;
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
        return `${medal} ${name} — **${u.xp} XP** (Nv. ${u.level})`;
      }));
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("🏆 Classement XP")
        .setDescription(lines.length > 0 ? lines.join("\n") : "*Aucune donnée.*")
        .setFooter({ text: "MAI•GESTION" }).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    // ── balance ───────────────────────────────────────────────────────────────
    case "balance": {
      const balance = await getCoins(guild.id, interaction.user.id);
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("💰 Ton solde")
          .setDescription(`**${balance.toLocaleString("fr-FR")} 🪙**`)
          .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
        ephemeral: true,
      });
      break;
    }

    // ── shop ──────────────────────────────────────────────────────────────────
    case "shop": {
      const balance = await getCoins(guild.id, interaction.user.id);
      await interaction.reply({ embeds: [buildPersonalShopEmbed(guildMember, balance)], ephemeral: true });
      break;
    }

    // ── buy ───────────────────────────────────────────────────────────────────
    case "buy": {
      const roleName = interaction.options.getString("role", true).toLowerCase();
      const shopRole = SHOP_ROLES.find(r => r.name.toLowerCase().includes(roleName));
      if (!shopRole) { await interaction.reply({ content: `❌ Rôle introuvable : \`${roleName}\`.`, ephemeral: true }); return; }
      const balance = await getCoins(guild.id, interaction.user.id);
      if (balance < shopRole.price) { await interaction.reply({ content: `❌ Pas assez de pièces. (${balance}/${shopRole.price} 🪙)`, ephemeral: true }); return; }
      if (guildMember.roles.cache.some(r => r.name === shopRole.name)) { await interaction.reply({ content: "❌ Tu as déjà ce rôle.", ephemeral: true }); return; }
      let role = guild.roles.cache.find(r => r.name === shopRole.name);
      if (!role) role = await guild.roles.create({ name: shopRole.name, reason: "Achat boutique", permissions: [] }).catch(() => undefined);
      if (!role) { await interaction.reply({ content: "❌ Impossible de créer le rôle.", ephemeral: true }); return; }
      await addCoins(guild.id, interaction.user.id, -shopRole.price);
      await guildMember.roles.add(role).catch(() => {});
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x00cc66).setDescription(`✅ Tu as acheté **${shopRole.name}** pour **${shopRole.price} 🪙** !`).setFooter({ text: "MAI•GESTION" })],
        ephemeral: true,
      });
      break;
    }

    // ── coinflip ──────────────────────────────────────────────────────────────
    case "coinflip": {
      const mise = interaction.options.getInteger("mise", true);
      const balance = await getCoins(guild.id, interaction.user.id);
      if (balance < mise) { await interaction.reply({ content: `❌ Pas assez de pièces. (${balance} 🪙)`, ephemeral: true }); return; }
      const win = Math.random() < 0.5;
      const newBal = await addCoins(guild.id, interaction.user.id, win ? mise : -mise);
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(win ? 0x00cc66 : 0xff4444)
          .setTitle(win ? "🟡 Face — Tu gagnes !" : "⚫ Pile — Tu perds !")
          .setDescription(win ? `**+${mise} 🪙** → Solde : **${newBal} 🪙**` : `**-${mise} 🪙** → Solde : **${newBal} 🪙**`)
          .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
        ephemeral: true,
      });
      break;
    }

    // ── slot ──────────────────────────────────────────────────────────────────
    case "slot": {
      const mise = interaction.options.getInteger("mise", true);
      const balance = await getCoins(guild.id, interaction.user.id);
      if (balance < mise) { await interaction.reply({ content: `❌ Pas assez de pièces. (${balance} 🪙)`, ephemeral: true }); return; }
      const SYMBOLS = ["🍒", "🍋", "🍊", "⭐", "💎", "7️⃣"];
      const MULT: Record<string, number> = { "🍒": 2, "🍋": 2.5, "🍊": 3, "⭐": 5, "💎": 10, "7️⃣": 20 };
      const reels = [0, 1, 2].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
      let gain = 0; let resultText = "";
      if (reels[0] === reels[1] && reels[1] === reels[2]) {
        gain = Math.floor(mise * MULT[reels[0]]);
        resultText = `🎉 **JACKPOT !** x${MULT[reels[0]]} → **+${gain} 🪙**`;
      } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
        gain = Math.floor(mise * 1.5);
        resultText = `✨ **2 identiques !** x1.5 → **+${gain} 🪙**`;
      } else {
        gain = -mise;
        resultText = `💸 **Rien...** → **-${mise} 🪙**`;
      }
      const newBal = await addCoins(guild.id, interaction.user.id, gain);
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(gain > 0 ? 0x00cc66 : 0xff4444)
          .setTitle("🎰 Machine à sous")
          .setDescription(`${reels.join(" | ")}\n\n${resultText}\n\nSolde : **${newBal} 🪙**`)
          .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
        ephemeral: true,
      });
      break;
    }

    // ── daily ─────────────────────────────────────────────────────────────────
    case "daily": {
      const guildId = guild.id;
      const userId = interaction.user.id;
      const now = Date.now();
      const COOLDOWN = 24 * 60 * 60 * 1000;
      const record = await getDailyReward(guildId, userId);
      if (record && now - record.lastClaim < COOLDOWN) {
        const next = record.lastClaim + COOLDOWN;
        await interaction.reply({ content: `⏳ Déjà réclamé ! Prochain dans <t:${Math.floor(next / 1000)}:R>.`, ephemeral: true });
        return;
      }
      const isConsecutive = record && now - record.lastClaim < COOLDOWN * 2;
      const newStreak = isConsecutive ? record.streak + 1 : 1;
      const mult = Math.min(1 + (newStreak - 1) * 0.1, 3);
      const isCoinsDay = Math.random() < 0.5;
      const baseCoins = Math.floor(Math.random() * 201) + 50;
      const baseXP    = Math.floor(Math.random() * 101) + 50;
      const coins = isCoinsDay ? Math.floor(baseCoins * mult) : 0;
      const xp    = !isCoinsDay ? Math.floor(baseXP * mult) : 0;
      if (coins > 0) await addCoins(guildId, userId, coins);
      if (xp > 0) {
        const { getXP, upsertXP } = await import("../modules/db");
        const userData = await getXP(guildId, userId);
        const newXP = userData.xp + xp;
        await upsertXP(guildId, userId, newXP, Math.floor(newXP / 100), userData.lastMessage);
      }
      await setDailyReward(guildId, userId, { lastClaim: now, streak: newStreak });
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("🎁 Récompense quotidienne !")
        .addFields(
          { name: isCoinsDay ? "🪙 Pièces gagnées" : "⭐ XP gagnée", value: `**+${isCoinsDay ? coins : xp}** ${isCoinsDay ? "🪙" : "XP"}`, inline: true },
          { name: "🔥 Streak", value: `**${newStreak} jour(s)**`, inline: true },
        )
        .setFooter({ text: "MAI•GESTION • Reviens demain pour continuer ton streak !" })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    // ── quest ─────────────────────────────────────────────────────────────────
    case "quest": {
      const embed = await getMyQuestProgress(guildMember);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    // ── claim ─────────────────────────────────────────────────────────────────
    case "claim": {
      const result = await claimQuest(guildMember);
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(result.success ? 0x00cc66 : 0xff4444)
          .setDescription(result.message)
          .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
        ephemeral: true,
      });
      break;
    }

    // ── warn ──────────────────────────────────────────────────────────────────
    case "warn": {
      const target = interaction.options.getUser("membre") ?? interaction.user;
      const targetMember = await guild.members.fetch(target.id).catch(() => null);
      if (!targetMember) { await interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true }); return; }
      const { getPunishmentStatus } = await import("../modules/punishSystem");
      const record = await getPunishmentStatus(guild.id, target.id);
      const embed = new EmbedBuilder()
        .setColor(record ? 0xff4444 : 0x00cc66)
        .setTitle(`⚠️ Statut de ${targetMember.displayName}`)
        .setDescription(record ? `🪫 **Sanctionné** — \`${record.reason ?? "Aucune raison"}\`\nLibération : <t:${Math.floor((record.expiresAt ?? 0) / 1000)}:R>` : "✅ Aucune sanction active")
        .setThumbnail(target.displayAvatarURL())
        .setFooter({ text: "MAI•GESTION" }).setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    // ── ban ───────────────────────────────────────────────────────────────────
    case "ban": {
      if (!guildMember.permissions.has(PermissionFlagsBits.BanMembers)) { await interaction.reply({ content: "❌ Permission insuffisante.", ephemeral: true }); return; }
      const target = interaction.options.getUser("membre", true);
      const raison = interaction.options.getString("raison") ?? "Aucune raison";
      await interaction.deferReply({ ephemeral: true });
      try {
        await guild.members.ban(target.id, { reason: raison });
        await interaction.editReply(`✅ **${target.tag}** a été banni. Raison : ${raison}`);
      } catch { await interaction.editReply("❌ Impossible de bannir ce membre."); }
      break;
    }

    // ── unban ─────────────────────────────────────────────────────────────────
    case "unban": {
      if (!guildMember.permissions.has(PermissionFlagsBits.BanMembers)) { await interaction.reply({ content: "❌ Permission insuffisante.", ephemeral: true }); return; }
      const id = interaction.options.getString("id", true);
      await interaction.deferReply({ ephemeral: true });
      try {
        await guild.members.unban(id);
        await interaction.editReply(`✅ Membre \`${id}\` débanni.`);
      } catch { await interaction.editReply("❌ Impossible de débannir (ID invalide ?)."); }
      break;
    }

    // ── mute ──────────────────────────────────────────────────────────────────
    case "mute": {
      if (!guildMember.permissions.has(PermissionFlagsBits.ModerateMembers)) { await interaction.reply({ content: "❌ Permission insuffisante.", ephemeral: true }); return; }
      const target = interaction.options.getUser("membre", true);
      const targetMember = await guild.members.fetch(target.id).catch(() => null);
      if (!targetMember) { await interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true }); return; }
      await interaction.deferReply({ ephemeral: true });
      const MUTE_ROLE = "🔇 Muet";
      let muteRole = guild.roles.cache.find(r => r.name === MUTE_ROLE);
      if (!muteRole) muteRole = await guild.roles.create({ name: MUTE_ROLE, permissions: [], reason: "Rôle mute MAI•GESTION" }).catch(() => undefined);
      if (!muteRole) { await interaction.editReply("❌ Impossible de créer le rôle mute."); return; }
      await targetMember.roles.add(muteRole).catch(() => {});
      await interaction.editReply(`✅ **${targetMember.displayName}** est maintenant muet.`);
      break;
    }

    // ── demute ────────────────────────────────────────────────────────────────
    case "demute": {
      if (!guildMember.permissions.has(PermissionFlagsBits.ModerateMembers)) { await interaction.reply({ content: "❌ Permission insuffisante.", ephemeral: true }); return; }
      const target = interaction.options.getUser("membre", true);
      const targetMember = await guild.members.fetch(target.id).catch(() => null);
      if (!targetMember) { await interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true }); return; }
      const MUTE_ROLE = "🔇 Muet";
      const muteRole = guild.roles.cache.find(r => r.name === MUTE_ROLE);
      if (muteRole) await targetMember.roles.remove(muteRole).catch(() => {});
      await interaction.reply({ content: `✅ **${targetMember.displayName}** n'est plus muet.`, ephemeral: true });
      break;
    }

    // ── clear ─────────────────────────────────────────────────────────────────
    case "clear": {
      if (!guildMember.permissions.has(PermissionFlagsBits.ManageMessages)) { await interaction.reply({ content: "❌ Permission insuffisante.", ephemeral: true }); return; }
      const nb = interaction.options.getInteger("nombre", true);
      if (interaction.channel?.type !== ChannelType.GuildText) { await interaction.reply({ content: "❌ Salon non compatible.", ephemeral: true }); return; }
      await interaction.deferReply({ ephemeral: true });
      const deleted = await (interaction.channel as TextChannel).bulkDelete(nb, true).catch(() => null);
      await interaction.editReply(`✅ **${deleted?.size ?? 0}** messages supprimés.`);
      break;
    }

    // ── lock ──────────────────────────────────────────────────────────────────
    case "lock": {
      if (!guildMember.permissions.has(PermissionFlagsBits.ManageChannels)) { await interaction.reply({ content: "❌ Permission insuffisante.", ephemeral: true }); return; }
      if (interaction.channel?.type !== ChannelType.GuildText) { await interaction.reply({ content: "❌ Salon non compatible.", ephemeral: true }); return; }
      await (interaction.channel as TextChannel).permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      await interaction.reply({ content: "🔒 Salon verrouillé.", ephemeral: true });
      break;
    }

    // ── unlock ────────────────────────────────────────────────────────────────
    case "unlock": {
      if (!guildMember.permissions.has(PermissionFlagsBits.ManageChannels)) { await interaction.reply({ content: "❌ Permission insuffisante.", ephemeral: true }); return; }
      if (interaction.channel?.type !== ChannelType.GuildText) { await interaction.reply({ content: "❌ Salon non compatible.", ephemeral: true }); return; }
      await (interaction.channel as TextChannel).permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
      await interaction.reply({ content: "🔓 Salon déverrouillé.", ephemeral: true });
      break;
    }

    // ── pardon ────────────────────────────────────────────────────────────────
    case "pardon": {
      if (!guildMember.permissions.has(PermissionFlagsBits.Administrator)) { await interaction.reply({ content: "❌ Permission insuffisante.", ephemeral: true }); return; }
      const target = interaction.options.getUser("membre", true);
      const targetMember = await guild.members.fetch(target.id).catch(() => null);
      if (!targetMember) { await interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true }); return; }
      await interaction.deferReply({ ephemeral: true });
      const { restoreMember } = await import("../modules/punishSystem");
      await restoreMember(interaction.client, guild.id, target.id);
      await interaction.editReply(`✅ Sanction levée pour **${targetMember.displayName}**.`);
      break;
    }

    // ── giveaway ──────────────────────────────────────────────────────────────
    case "giveaway": {
      if (!guildMember.permissions.has(PermissionFlagsBits.Administrator)) { await interaction.reply({ content: "❌ Permission insuffisante.", ephemeral: true }); return; }
      const prix = interaction.options.getString("prix", true);
      const durée = interaction.options.getString("durée", true);
      await interaction.deferReply({ ephemeral: true });
      try {
        const channelId = interaction.channelId;
        const { launchGiveaway } = await import("../modules/giveawaySystem");
        const result = await launchGiveaway(interaction.client, channelId, guild.id, prix, durée);
        await interaction.editReply(result.success ? `✅ Giveaway lancé pour **${prix}** !` : `❌ ${result.message}`);
      } catch (err) {
        await interaction.editReply(`❌ ${err instanceof Error ? err.message : String(err)}`);
      }
      break;
    }

    // ── event ─────────────────────────────────────────────────────────────────
    case "event": {
      if (!guildMember.permissions.has(PermissionFlagsBits.Administrator)) { await interaction.reply({ content: "❌ Permission insuffisante.", ephemeral: true }); return; }
      const typeKey = interaction.options.getString("type", true) as "messages" | "xp" | "vocal";
      const cible   = interaction.options.getInteger("cible", true);
      const reward  = interaction.options.getInteger("récompense", true);
      const days    = interaction.options.getInteger("durée") ?? 7;
      const typeMap: Record<string, "messages" | "xp" | "voice_minutes"> = {
        messages: "messages", xp: "xp", vocal: "voice_minutes",
      };
      const type = typeMap[typeKey];
      const labelMap: Record<string, string> = {
        messages: `Envoie **${cible} messages**`,
        xp: `Gagne **${cible} XP**`,
        voice_minutes: `Passe **${cible} minutes en vocal**`,
      };
      await interaction.deferReply({ ephemeral: true });
      try {
        await launchCustomQuest(guild, type, labelMap[type], cible, reward, days);
        await interaction.editReply(`✅ Événement lancé ! **${labelMap[type]}** — Récompense : **${reward} 🪙** — Durée : **${days} jour(s)**`);
      } catch (err) {
        await interaction.editReply(`❌ ${err instanceof Error ? err.message : String(err)}`);
      }
      break;
    }

    // ── syncperms ─────────────────────────────────────────────────────────────
    case "syncperms": {
      if (!guildMember.permissions.has(PermissionFlagsBits.Administrator)) { await interaction.reply({ content: "❌ Permission insuffisante.", ephemeral: true }); return; }
      await interaction.deferReply({ ephemeral: true });
      const { syncChannelPermissions } = await import("../modules/rulesGate");
      await syncChannelPermissions(guild);
      await interaction.editReply("✅ Permissions synchronisées !");
      break;
    }

    // ── postshop ──────────────────────────────────────────────────────────────
    case "postshop": {
      if (interaction.channel?.type !== ChannelType.GuildText) { await interaction.reply({ content: "❌ Utilise cette commande dans un salon texte.", ephemeral: true }); return; }
      await (interaction.channel as TextChannel).send({ embeds: [buildGenericShopEmbed()], components: buildGenericShopComponents() });
      await interaction.reply({ content: "✅ Panneau de boutique posté !", ephemeral: true });
      break;
    }


    // ── addcoins ──────────────────────────────────────────────────────────────
    case "addcoins": {
      if (!guildMember.permissions.has(PermissionFlagsBits.Administrator)) { await interaction.reply({ content: "❌ Permission insuffisante.", ephemeral: true }); return; }
      const target = interaction.options.getUser("membre", true);
      const montant = interaction.options.getInteger("montant", true);
      const targetMember = await guild.members.fetch(target.id).catch(() => null);
      if (!targetMember) { await interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true }); return; }
      const newBal = await addCoins(guild.id, target.id, montant);
      const signe = montant >= 0 ? `+${montant}` : `${montant}`;
      const couleur = montant >= 0 ? 0x00cc66 : 0xff4444;
      const action = montant >= 0 ? "💰 Pièces ajoutées !" : "💸 Pièces retirées !";
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(couleur)
          .setTitle(action)
          .setDescription(`**${signe} 🪙** → <@${target.id}>\n\n💰 Nouveau solde : **${newBal.toLocaleString("fr-FR")} 🪙**`)
          .setThumbnail(target.displayAvatarURL())
          .setFooter({ text: `Action par ${interaction.user.tag} • MAI•GESTION` }).setTimestamp()],
        ephemeral: false,
      });
      break;
    }

    // ── jackpot ────────────────────────────────────────────────────────────────
    case "jackpot": {
      const force = interaction.options.getBoolean("forcer") ?? false;
      if (force && !guildMember.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "❌ Seuls les admins peuvent forcer le tirage.", ephemeral: true }); return;
      }
      await interaction.deferReply({ ephemeral: !force });
      const embed = await jackpotCommand(guild, force);
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    default:
      await interaction.reply({ content: "❌ Commande inconnue.", ephemeral: true });
  }
}
