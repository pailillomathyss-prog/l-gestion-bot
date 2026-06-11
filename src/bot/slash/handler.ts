import {
  ChatInputCommandInteraction, EmbedBuilder, TextChannel, PermissionFlagsBits,
  ChannelType, GuildMember,
} from "discord.js";
import { logger } from "../../lib/logger";
import { getCoins, addCoins, getXP, getAllXP } from "../modules/db";
import { xpToLevel, topMilestone, levelToXP, MILESTONES } from "../modules/expSystem";
import { getJackpot, JACKPOT_CHAN } from "../modules/jackpot";
import { launchGiveaway } from "../modules/giveawaySystem";
import { logBan, logUnban, logMute, logDemute, logLock } from "../modules/modLogs";
import { upsertXP } from "../modules/db";

function parseDurationToMs(str: string): number {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return 0;
  const val = parseInt(match[1]!);
  const units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return val * (units[match[2]!.toLowerCase()] ?? 0);
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

export async function handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "❌ Commande disponible uniquement dans un serveur.", ephemeral: true });
    return;
  }

  const guildId = interaction.guild.id;
  const userId  = interaction.user.id;

  try {
    switch (interaction.commandName) {
      // ── /rank ────────────────────────────────────────────────────────────────
      case "rank": {
        const target = interaction.options.getMember("membre") as GuildMember ?? interaction.member as GuildMember;
        if (!target) { await interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true }); return; }

        await interaction.deferReply();
        const data  = await getXP(guildId, target.id);
        const top   = await getAllXP(guildId);
        const rank  = top.findIndex(u => u.userId === target.id) + 1 || "?";
        const nextXP = levelToXP(data.level + 1);
        const pct    = Math.min(100, Math.floor((data.xp / nextXP) * 100));
        const fill   = Math.floor(pct / 6.67);
        const bar    = "█".repeat(fill) + "░".repeat(15 - fill);
        const ms     = topMilestone(data.level);
        const bal    = await getCoins(guildId, target.id);

        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(ms?.color ?? 0x9b59b6)
          .setTitle(`📊 Profil de ${target.displayName}`)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: "🏆 Niveau",  value: `**${data.level}**`,                       inline: true },
            { name: "⭐ XP",      value: `**${data.xp.toLocaleString("fr-FR")}**`,  inline: true },
            { name: "📈 Rang",    value: `**#${rank}**`,                            inline: true },
            { name: "💰 Pièces",  value: `**${bal.toLocaleString("fr-FR")} 🪙**`,   inline: true },
            { name: `Progression → Niveau ${data.level + 1}`,
              value: `\`${bar}\` ${pct}%\n${data.xp.toLocaleString("fr-FR")} / ${nextXP.toLocaleString("fr-FR")} XP` },
          )
          .setFooter({ text: "MAI•GESTION" }).setTimestamp()] });
        break;
      }

      // ── /leaderboard ─────────────────────────────────────────────────────────
      case "leaderboard": {
        await interaction.deferReply();
        const top    = await getAllXP(guildId);
        const top10  = top.slice(0, 10);
        const medals = ["🥇", "🥈", "🥉"];

        if (!top10.length) {
          await interaction.editReply("❌ Aucune donnée disponible.");
          return;
        }

        const lines = await Promise.all(top10.map(async (u, i) => {
          const medal  = medals[i] ?? `**${i + 1}.**`;
          const member = await interaction.guild!.members.fetch(u.userId).catch(() => null);
          const name   = member?.displayName ?? `<@${u.userId}>`;
          const ms     = topMilestone(u.level);
          return `${medal} **${name}** — Nv. **${u.level}** | **${u.xp.toLocaleString("fr-FR")} XP**${ms ? ` *(${ms.name})*` : ""}`;
        }));

        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(0x9b59b6).setTitle("🏆 Classement XP — MAI•GESTION")
          .setDescription(lines.join("\n"))
          .setFooter({ text: `${top.length} joueur(s) au total` }).setTimestamp()] });
        break;
      }

      // ── /balance ─────────────────────────────────────────────────────────────
      case "balance": {
        const target = interaction.options.getMember("membre") as GuildMember ?? interaction.member as GuildMember;
        await interaction.deferReply({ ephemeral: true });
        const bal = await getCoins(guildId, target?.id ?? userId);
        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(0xffd700).setTitle("💰 Solde")
          .setDescription(`**${(target as GuildMember)?.displayName ?? "Toi"}** possède **${bal.toLocaleString("fr-FR")} 🪙**`)
          .setFooter({ text: "MAI•GESTION" }).setTimestamp()] });
        break;
      }

      // ── /jackpot ─────────────────────────────────────────────────────────────
      case "jackpot": {
        await interaction.deferReply({ ephemeral: true });
        const pot = await getJackpot(guildId);
        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(0xffd700).setTitle("🎁 Jackpot Communautaire")
          .addFields(
            { name: "💰 Cagnotte actuelle", value: `**${pot.toLocaleString("fr-FR")} 🪙**`, inline: true },
            { name: "📍 Salon", value: `#${JACKPOT_CHAN}`, inline: true },
            { name: "📈 Comment contribuer", value: "5% de chaque perte au casino (Flip, Slots, BJ, Duel, Gacha) alimente la cagnotte.\nTirage automatique chaque semaine !", inline: false },
          )
          .setFooter({ text: "MAI•GESTION" }).setTimestamp()] });
        break;
      }

      // ── /don ─────────────────────────────────────────────────────────────────
      case "don": {
        const recipient = interaction.options.getMember("membre") as GuildMember;
        const amount    = interaction.options.getInteger("montant", true);

        await interaction.deferReply({ ephemeral: true });

        if (!recipient) { await interaction.editReply("❌ Membre introuvable."); return; }
        if (recipient.id === userId) { await interaction.editReply("❌ Tu ne peux pas te donner à toi-même."); return; }
        if (recipient.user.bot) { await interaction.editReply("❌ Tu ne peux pas donner à un bot."); return; }

        const bal = await getCoins(guildId, userId);
        if (bal < amount) { await interaction.editReply(`❌ Pas assez de pièces ! Tu as **${bal.toLocaleString("fr-FR")} 🪙**, il te faut **${amount.toLocaleString("fr-FR")} 🪙**.`); return; }

        await addCoins(guildId, userId, -amount);
        const newRecipBal = await addCoins(guildId, recipient.id, amount);
        const newBal      = await getCoins(guildId, userId);

        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(0x57f287).setTitle("✅ Don effectué !")
          .setDescription(`Tu as donné **${amount.toLocaleString("fr-FR")} 🪙** à <@${recipient.id}> !`)
          .addFields(
            { name: "💰 Ton solde", value: `**${newBal.toLocaleString("fr-FR")} 🪙**`, inline: true },
            { name: "💰 Solde du receveur", value: `**${newRecipBal.toLocaleString("fr-FR")} 🪙**`, inline: true },
          )
          .setFooter({ text: "MAI•GESTION" }).setTimestamp()] });
        break;
      }

      // ── /giveaway ─────────────────────────────────────────────────────────────
      case "giveaway": {
        const durée = interaction.options.getString("durée", true);
        const prix  = interaction.options.getString("prix", true);
        await interaction.deferReply({ ephemeral: true });
        const err = await launchGiveaway(guildId, interaction.channelId, prix, durée, interaction.client);
        if (err) { await interaction.editReply(err); return; }
        await interaction.editReply(`✅ Giveaway pour **${prix}** lancé dans <#${interaction.channelId}> !`);
        break;
      }

      // ── /ban ─────────────────────────────────────────────────────────────────
      case "ban": {
        const target = interaction.options.getMember("membre") as GuildMember;
        const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";
        if (!target) { await interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true }); return; }
        if (!target.bannable) { await interaction.reply({ content: "❌ Je ne peux pas bannir ce membre.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        await target.ban({ reason: `${interaction.user.tag}: ${reason}` });
        await logBan(interaction.guild, target.user, interaction.user, reason);
        await interaction.editReply(`✅ **${target.user.tag}** a été banni. Raison : ${reason}`);
        break;
      }

      // ── /unban ───────────────────────────────────────────────────────────────
      case "unban": {
        const id     = interaction.options.getString("id", true);
        const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";
        await interaction.deferReply({ ephemeral: true });
        try {
          const bans   = await interaction.guild.bans.fetch();
          const banned = bans.get(id);
          if (!banned) { await interaction.editReply("❌ Cet utilisateur n'est pas banni."); return; }
          await interaction.guild.members.unban(id, `${interaction.user.tag}: ${reason}`);
          await logUnban(interaction.guild, banned.user, interaction.user, reason);
          await interaction.editReply(`✅ **${banned.user.tag}** a été débanni.`);
        } catch { await interaction.editReply("❌ Erreur lors du débannissement."); }
        break;
      }

      // ── /mute ────────────────────────────────────────────────────────────────
      case "mute": {
        const target = interaction.options.getMember("membre") as GuildMember;
        const durStr = interaction.options.getString("durée", true);
        const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";
        if (!target) { await interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true }); return; }
        const dur = parseDurationToMs(durStr);
        if (!dur) { await interaction.reply({ content: "❌ Durée invalide. Ex: `10m`, `2h`, `1d`", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        await target.timeout(dur, `${interaction.user.tag}: ${reason}`);
        await logMute(interaction.guild, target.user, interaction.user, formatMs(dur), reason);
        await interaction.editReply(`✅ **${target.user.tag}** muté pendant **${formatMs(dur)}**. Raison : ${reason}`);
        break;
      }

      // ── /demute ──────────────────────────────────────────────────────────────
      case "demute": {
        const target = interaction.options.getMember("membre") as GuildMember;
        const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";
        if (!target) { await interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        await target.timeout(null, `${interaction.user.tag}: ${reason}`);
        await logDemute(interaction.guild, target.user, interaction.user, reason);
        await interaction.editReply(`✅ **${target.user.tag}** démuté. Raison : ${reason}`);
        break;
      }

      // ── /lock ────────────────────────────────────────────────────────────────
      case "lock": {
        const ch     = (interaction.options.getChannel("salon") as TextChannel | null) ?? interaction.channel as TextChannel;
        const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";
        await interaction.deferReply({ ephemeral: true });
        try {
          const everyoneRole = interaction.guild.roles.cache.get(interaction.guild.id)
            ?? await interaction.guild.roles.fetch(interaction.guild.id).catch(() => null);
          if (!everyoneRole) { await interaction.editReply("❌ Rôle @everyone introuvable."); return; }
          await ch.permissionOverwrites.edit(everyoneRole, { SendMessages: false, AddReactions: false, CreatePublicThreads: false });
          await logLock(interaction.guild, ch, interaction.user, reason, true);
          await interaction.editReply(`✅ <#${ch.id}> verrouillé.`);
        } catch (err: any) { await interaction.editReply(`❌ Erreur : \`${err?.message ?? err}\``); }
        break;
      }

      // ── /unlock ──────────────────────────────────────────────────────────────
      case "unlock": {
        const ch     = (interaction.options.getChannel("salon") as TextChannel | null) ?? interaction.channel as TextChannel;
        const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";
        await interaction.deferReply({ ephemeral: true });
        try {
          const everyoneRole = interaction.guild.roles.cache.get(interaction.guild.id)
            ?? await interaction.guild.roles.fetch(interaction.guild.id).catch(() => null);
          if (!everyoneRole) { await interaction.editReply("❌ Rôle @everyone introuvable."); return; }
          await ch.permissionOverwrites.edit(everyoneRole, { SendMessages: null, AddReactions: null, CreatePublicThreads: null });
          await logLock(interaction.guild, ch, interaction.user, reason, false);
          await interaction.editReply(`✅ <#${ch.id}> déverrouillé.`);
        } catch (err: any) { await interaction.editReply(`❌ Erreur : \`${err?.message ?? err}\``); }
        break;
      }

      // ── /clear ───────────────────────────────────────────────────────────────
      case "clear": {
        const nombre = interaction.options.getInteger("nombre", true);
        await interaction.deferReply({ ephemeral: true });
        const ch      = interaction.channel as TextChannel;
        const deleted = await ch.bulkDelete(nombre, true).catch(() => null);
        await interaction.editReply(`✅ **${deleted?.size ?? 0}** message(s) supprimé(s).`);
        break;
      }

      // ── /restorexp ───────────────────────────────────────────────────────────
      case "restorexp": {
        const target = interaction.options.getMember("membre") as GuildMember;
        const xp     = interaction.options.getInteger("xp", true);
        if (!target) { await interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const data   = await getXP(guildId, target.id);
        const newXP  = data.xp + xp;
        const newLvl = xpToLevel(newXP);
        await upsertXP(guildId, target.id, newXP, newLvl, data.lastMessage);
        await interaction.editReply(`✅ **+${xp.toLocaleString("fr-FR")} XP** ajoutés à **${target.displayName}** (total : ${newXP.toLocaleString("fr-FR")} XP | Nv. ${newLvl})`);
        break;
      }

      // ── /addcoins ─────────────────────────────────────────────────────────────
      case "addcoins": {
        const target  = (interaction.options.getMember("membre") as GuildMember | null) ?? interaction.member as GuildMember;
        const montant = interaction.options.getInteger("montant", true);
        await interaction.deferReply({ ephemeral: true });
        const newBal = await addCoins(guildId, target.id, montant);
        const sign   = montant > 0 ? "+" : "";
        const color  = montant > 0 ? 0x57f287 : 0xff4444;
        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(color)
          .setTitle(montant > 0 ? "💰 Pièces ajoutées !" : "💸 Pièces retirées !")
          .addFields(
            { name: "👤 Membre",        value: `<@${target.id}>`,                                 inline: true },
            { name: "📈 Modification",  value: `**${sign}${montant.toLocaleString("fr-FR")} 🪙**`, inline: true },
            { name: "💰 Nouveau solde", value: `**${newBal.toLocaleString("fr-FR")} 🪙**`,         inline: true },
          )
          .setFooter({ text: `MAI•GESTION • Par ${interaction.user.tag}` })
          .setTimestamp()] });
        break;
      }

      default:
        await interaction.reply({ content: "❌ Commande inconnue.", ephemeral: true });
    }
  } catch (err) {
    logger.error({ err }, `Erreur commande /${interaction.commandName}`);
    if (!interaction.replied && !interaction.deferred)
      await interaction.reply({ content: "❌ Une erreur est survenue.", ephemeral: true }).catch(() => {});
    else
      await interaction.editReply("❌ Une erreur est survenue.").catch(() => {});
  }
}
