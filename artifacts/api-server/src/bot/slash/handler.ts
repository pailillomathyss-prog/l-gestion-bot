import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  TextChannel,
} from "discord.js";
import { giveaways, GiveawayData } from "../index";
import { logBan, logMute, logUnmute, logClear, logUnban } from "../modules/modLogs";
import { endGiveaway } from "../commands/giveaway";
import { setupCommand } from "../commands/setup";
import { deleteSetupCommand } from "../commands/deleteSetup";

function parseDuration(str: string): number {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return 0;
  const val = parseInt(match[1]);
  const units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return val * (units[match[2].toLowerCase()] ?? 0);
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

export async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
  const { commandName, guild, member: rawMember } = interaction;
  if (!guild) return;

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;

  switch (commandName) {

    case "ban": {
      if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ content: "❌ Tu n'as pas la permission de bannir.", ephemeral: true });
      }
      const target = await guild.members.fetch(interaction.options.getUser("membre", true).id).catch(() => null);
      if (!target) return interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true });
      if (!target.bannable) return interaction.reply({ content: "❌ Je ne peux pas bannir ce membre.", ephemeral: true });
      const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";

      await interaction.deferReply();
      await target.send({
        embeds: [
          new EmbedBuilder().setColor(0xff0000).setTitle("🔨 Tu as été banni")
            .addFields(
              { name: "Serveur", value: guild.name },
              { name: "Raison", value: reason },
              { name: "Modérateur", value: interaction.user.tag }
            ).setTimestamp(),
        ],
      }).catch(() => {});
      await target.ban({ reason: `${interaction.user.tag}: ${reason}` });
      await logBan(guild, target.user, interaction.user, reason);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder().setColor(0xff0000).setTitle("🔨 Membre banni")
            .addFields(
              { name: "Utilisateur", value: `${target.user.tag} (${target.id})` },
              { name: "Raison", value: reason },
              { name: "Modérateur", value: interaction.user.tag }
            ).setThumbnail(target.user.displayAvatarURL()).setTimestamp(),
        ],
      });
      break;
    }

    case "mute": {
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ content: "❌ Tu n'as pas la permission de muter.", ephemeral: true });
      }
      const target = await guild.members.fetch(interaction.options.getUser("membre", true).id).catch(() => null);
      if (!target) return interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true });
      if (!target.moderatable) return interaction.reply({ content: "❌ Je ne peux pas muter ce membre.", ephemeral: true });
      const durationStr = interaction.options.getString("durée", true);
      const duration = parseDuration(durationStr);
      if (!duration) return interaction.reply({ content: "❌ Durée invalide. Ex: `10s`, `5m`, `2h`, `1d`", ephemeral: true });
      if (duration > 28 * 24 * 3600000) return interaction.reply({ content: "❌ Durée max : 28 jours.", ephemeral: true });
      const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";
      const formatted = formatDuration(duration);

      await interaction.deferReply();
      await target.timeout(duration, `${interaction.user.tag}: ${reason}`);
      await target.send({
        embeds: [
          new EmbedBuilder().setColor(0xffa500).setTitle("🔇 Tu as été muté")
            .addFields(
              { name: "Serveur", value: guild.name },
              { name: "Durée", value: formatted },
              { name: "Raison", value: reason },
              { name: "Modérateur", value: interaction.user.tag }
            ).setTimestamp(),
        ],
      }).catch(() => {});
      await logMute(guild, target.user, interaction.user, formatted, reason);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder().setColor(0xffa500).setTitle("🔇 Membre muté")
            .addFields(
              { name: "Utilisateur", value: `${target.user.tag} (${target.id})` },
              { name: "Durée", value: formatted },
              { name: "Expiration", value: `<t:${Math.floor((Date.now() + duration) / 1000)}:R>` },
              { name: "Raison", value: reason },
              { name: "Modérateur", value: interaction.user.tag }
            ).setThumbnail(target.user.displayAvatarURL()).setTimestamp(),
        ],
      });
      break;
    }

    case "unmute": {
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ content: "❌ Tu n'as pas la permission de démuter.", ephemeral: true });
      }
      const target = await guild.members.fetch(interaction.options.getUser("membre", true).id).catch(() => null);
      if (!target) return interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true });
      if (!target.isCommunicationDisabled()) return interaction.reply({ content: "ℹ️ Ce membre n'est pas muté.", ephemeral: true });
      const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";

      await interaction.deferReply();
      await target.timeout(null, `${interaction.user.tag}: ${reason}`);
      await logUnmute(guild, target.user, interaction.user, reason);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder().setColor(0x57f287).setTitle("🔊 Membre démuté")
            .addFields(
              { name: "Utilisateur", value: `${target.user.tag} (${target.id})` },
              { name: "Raison", value: reason },
              { name: "Modérateur", value: interaction.user.tag }
            ).setThumbnail(target.user.displayAvatarURL()).setTimestamp(),
        ],
      });
      break;
    }

    case "clear": {
      if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: "❌ Tu n'as pas la permission de supprimer des messages.", ephemeral: true });
      }
      const amount = interaction.options.getInteger("nombre", true);
      const channel = interaction.channel as TextChannel;

      await interaction.deferReply({ ephemeral: true });
      const deleted = await channel.bulkDelete(amount, true).catch(() => null);
      const count = deleted?.size ?? 0;
      await logClear(guild, channel, interaction.user, count);
      await interaction.editReply({ content: `🧹 **${count}** message(s) supprimé(s).` });
      break;
    }

    case "giveaway": {
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "❌ Tu n'as pas la permission de gérer les giveaways.", ephemeral: true });
      }
      const sub = interaction.options.getSubcommand();

      if (sub === "start") {
        const durationStr = interaction.options.getString("durée", true);
        const duration = parseDuration(durationStr);
        if (!duration) return interaction.reply({ content: "❌ Durée invalide.", ephemeral: true });
        const winners = interaction.options.getInteger("gagnants", true);
        const prize = interaction.options.getString("prix", true);
        const endsAt = Date.now() + duration;
      const invitesRequired = interaction.options.getInteger("invitations") ?? undefined;

        const embed = new EmbedBuilder()
          .setColor(0xffd700).setTitle("🎉 GIVEAWAY 🎉")
          .setDescription(
            `Réagis avec 🎉 pour participer !\n\n**Prix:** ${prize}\n**Gagnant(s):** ${winners}\n**Fin:** <t:${Math.floor(endsAt / 1000)}:R>\n**Organisé par:** ${interaction.user}`
          )
          .setFooter({ text: `Se termine dans ${formatDuration(duration)}` })
          .setTimestamp(endsAt);

        await interaction.reply({ content: "✅ Giveaway lancé !", ephemeral: true });
        const gwMsg = await interaction.channel!.send({ embeds: [embed] });
        await gwMsg.react("🎉");

        const gwData: GiveawayData = {
          messageId: gwMsg.id,
          channelId: gwMsg.channel.id,
          prize,
          winner: winners,
          endsAt,
          ended: false,
          participants: new Set(),
        };
        giveaways.set(gwMsg.id, gwData);
        setTimeout(() => endGiveaway(gwMsg.id), duration);

      } else if (sub === "end") {
        const msgId = interaction.options.getString("id", true);
        await interaction.reply({ content: "⏱️ Terminaison du giveaway...", ephemeral: true });
        await endGiveaway(msgId);

      } else if (sub === "reroll") {
        const msgId = interaction.options.getString("id", true);
        const gw = giveaways.get(msgId);
        if (!gw) return interaction.reply({ content: "❌ Giveaway introuvable.", ephemeral: true });
        const channel = interaction.client.channels.cache.get(gw.channelId) as TextChannel | null;
        if (!channel) return interaction.reply({ content: "❌ Salon introuvable.", ephemeral: true });
        const gwMsg = await channel.messages.fetch(msgId).catch(() => null);
        if (!gwMsg) return interaction.reply({ content: "❌ Message introuvable.", ephemeral: true });
        const reaction = gwMsg.reactions.cache.get("🎉");
        const users = await reaction?.users.fetch().catch(() => null);
        const eligible = users?.filter((u) => !u.bot).map((u) => u.id) ?? [];
        if (!eligible.length) return interaction.reply({ content: "❌ Aucun participant.", ephemeral: true });
        const newWinner = eligible[Math.floor(Math.random() * eligible.length)];
        await channel.send({ content: `🔁 Nouveau gagnant pour **${gw.prize}** : <@${newWinner}> ! Félicitations !` });
        await interaction.reply({ content: "✅ Nouveau gagnant tiré !", ephemeral: true });
      }
      break;
    }

    case "setup": {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Seuls les administrateurs peuvent utiliser /setup.", ephemeral: true });
      }
      await interaction.reply({ content: "⚙️ Configuration du serveur en cours...", ephemeral: true });
      const fakeMsg = buildFakeMessage(interaction);
      await setupCommand(fakeMsg, ["confirm"]);
      break;
    }

    case "delete": {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Seuls les administrateurs peuvent utiliser /delete.", ephemeral: true });
      }
      await interaction.reply({ content: "🗑️ Suppression en cours...", ephemeral: true });
      const fakeMsg = buildFakeMessage(interaction);
      await deleteSetupCommand(fakeMsg, ["confirm"]);
      break;
    }


  
      case "lock": {
        if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return interaction.reply({ content: "❌ Tu n'as pas la permission de verrouiller des salons.", ephemeral: true });
        }
        const target = (interaction.options.getChannel("salon") ?? interaction.channel) as TextChannel;
        const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";
        await interaction.deferReply();
        try {
          await target.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, { reason: `${interaction.user.tag}: ${reason}` });
          await interaction.editReply({ embeds: [
            new EmbedBuilder().setColor(0xff0000).setTitle("🔒 Salon verrouillé")
              .addFields(
                { name: "Salon", value: `<#${target.id}>` },
                { name: "Raison", value: reason },
                { name: "Modérateur", value: interaction.user.tag }
              ).setTimestamp()
          ]});
        } catch { await interaction.editReply({ content: "❌ Une erreur est survenue." }); }
        break;
      }

      case "unlock": {
        if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return interaction.reply({ content: "❌ Tu n'as pas la permission de déverrouiller des salons.", ephemeral: true });
        }
        const target = (interaction.options.getChannel("salon") ?? interaction.channel) as TextChannel;
        const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";
        await interaction.deferReply();
        try {
          await target.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason: `${interaction.user.tag}: ${reason}` });
          await interaction.editReply({ embeds: [
            new EmbedBuilder().setColor(0x57f287).setTitle("🔓 Salon déverrouillé")
              .addFields(
                { name: "Salon", value: `<#${target.id}>` },
                { name: "Raison", value: reason },
                { name: "Modérateur", value: interaction.user.tag }
              ).setTimestamp()
          ]});
        } catch { await interaction.editReply({ content: "❌ Une erreur est survenue." }); }
        break;
      }

      case "deban": {
        if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
          return interaction.reply({ content: "❌ Tu n'as pas la permission de débannir.", ephemeral: true });
        }
        const userId = interaction.options.getString("id", true);
        if (!/^\d{17,19}$/.test(userId)) {
          return interaction.reply({ content: "❌ ID invalide.", ephemeral: true });
        }
        const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";
        await interaction.deferReply();
        try {
          const bans = await guild.bans.fetch();
          const banned = bans.get(userId);
          if (!banned) return interaction.editReply({ content: "❌ Cet utilisateur n'est pas banni." });
          await guild.members.unban(userId, `${interaction.user.tag}: ${reason}`);
          await logUnban(guild, banned.user, interaction.user, reason);
          await interaction.editReply({
            embeds: [
              new EmbedBuilder().setColor(0x57f287).setTitle("✅ Membre débanni")
                .addFields(
                  { name: "Utilisateur", value: `${banned.user.tag} (${userId})` },
                  { name: "Raison", value: reason },
                  { name: "Modérateur", value: interaction.user.tag }
                ).setThumbnail(banned.user.displayAvatarURL()).setTimestamp(),
            ],
          });
        } catch {
          await interaction.editReply({ content: "❌ Une erreur est survenue lors du débannissement." });
        }
        break;
      }


        case "invites": {
          await interaction.deferReply();
          const targetUser = interaction.options.getUser("utilisateur");
          const invites = await guild.invites.fetch();
          const byUser = new Map<string, { uses: number; links: number }>();
          for (const inv of invites.values()) {
            if (!inv.inviter) continue;
            const e = byUser.get(inv.inviter.id) ?? { uses: 0, links: 0 };
            e.uses += inv.uses ?? 0; e.links += 1;
            byUser.set(inv.inviter.id, e);
          }
          if (targetUser) {
            const data = byUser.get(targetUser.id) ?? { uses: 0, links: 0 };
            const userInvites = invites.filter((inv) => inv.inviter?.id === targetUser.id);
            const embed = new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle("Invitations de " + targetUser.username)
              .setThumbnail(targetUser.displayAvatarURL())
              .addFields(
                { name: "Invitations utilisees", value: "**" + data.uses + "**", inline: true },
                { name: "Liens actifs", value: "**" + data.links + "**", inline: true }
              ).setTimestamp();
            if (userInvites.size > 0) {
              const list = userInvites
                .map((inv) => "`" + inv.code + "` — **" + (inv.uses ?? 0) + "** util.")
                .slice(0, 10).join("\n");
              embed.addFields({ name: "Liens", value: list });
            } else { embed.setDescription("Cet utilisateur n\'a aucune invitation active."); }
            return interaction.editReply({ embeds: [embed] });
          }
          const sorted = [...byUser.entries()].sort((a, b) => b[1].uses - a[1].uses);
          const totalUses = invites.reduce((s, i) => s + (i.uses ?? 0), 0);
          const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("Invitations — " + guild.name)
            .addFields(
              { name: "Liens actifs", value: "**" + invites.size + "**", inline: true },
              { name: "Total utilisations", value: "**" + totalUses + "**", inline: true }
            ).setTimestamp();
          if (sorted.length) {
            const lb = sorted.slice(0, 10)
              .map(([id, d], i) => "**" + (i + 1) + ".** <@" + id + "> — **" + d.uses + "** inv. (" + d.links + " lien(s))")
              .join("\n");
            embed.addFields({ name: "🏆 Top inviteurs", value: lb });
          } else { embed.setDescription("Aucune invitation active."); }
          return interaction.editReply({ embeds: [embed] });
        }

        case "help": {
      await interaction.reply({
        ephemeral: true,
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2).setTitle("📋 Liste des commandes slash")
            .addFields(
              { name: "🔨 Modération", value: "`/ban` `/mute` `/unmute` `/clear`" },
              { name: "🎉 Giveaway", value: "`/giveaway start` `/giveaway end` `/giveaway reroll`" },
              { name: "🏗️ Serveur", value: "`/setup` — crée tout le serveur\n`/delete` — supprime les salons du bot" },
            )
            .setFooter({ text: "Les commandes ! classiques fonctionnent aussi" })
            .setTimestamp(),
        ],
      });
      break;
    }
  }
}

function buildFakeMessage(interaction: ChatInputCommandInteraction): any {
  return {
    guild: interaction.guild,
    channel: interaction.channel,
    author: interaction.user,
    member: interaction.guild?.members.cache.get(interaction.user.id),
    reply: (content: any) => interaction.followUp({ ...( typeof content === "string" ? { content } : content), ephemeral: true }),
    delete: () => Promise.resolve(),
  };
}
