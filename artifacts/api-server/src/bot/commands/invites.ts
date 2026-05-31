import { Message, EmbedBuilder } from "discord.js";

  export async function invitesCommand(message: Message, args: string[]) {
    if (!message.guild) return;

    const targetUser = message.mentions.users.first();
    const invites = await message.guild.invites.fetch();

    if (targetUser) {
      // ── Par utilisateur
      const userInvites = invites.filter((inv) => inv.inviter?.id === targetUser.id);
      const totalUses = userInvites.reduce((sum, inv) => sum + (inv.uses ?? 0), 0);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📨 Invitations de ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          { name: "Invitations utilisées", value: `**${totalUses}**`, inline: true },
          { name: "Liens actifs", value: `**${userInvites.size}**`, inline: true }
        )
        .setTimestamp();

      if (userInvites.size > 0) {
        const list = userInvites
          .map((inv) => `\`${inv.code}\` — **${inv.uses ?? 0}** utilisation(s)`)
          .slice(0, 10)
          .join("\n");
        embed.addFields({ name: "Liens d'invitation", value: list });
      } else {
        embed.setDescription("Cet utilisateur n'a aucune invitation active.");
      }

      return message.reply({ embeds: [embed] });
    }

    // ── Global serveur
    const byUser = new Map<string, { tag: string; uses: number; links: number }>();
    for (const inv of invites.values()) {
      if (!inv.inviter) continue;
      const e = byUser.get(inv.inviter.id) ?? { tag: inv.inviter.tag, uses: 0, links: 0 };
      e.uses += inv.uses ?? 0;
      e.links += 1;
      byUser.set(inv.inviter.id, e);
    }

    const sorted = [...byUser.entries()].sort((a, b) => b[1].uses - a[1].uses);
    const totalUses = invites.reduce((s, i) => s + (i.uses ?? 0), 0);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📊 Invitations — ${message.guild.name}`)
      .addFields(
        { name: "Liens actifs", value: `**${invites.size}**`, inline: true },
        { name: "Total utilisations", value: `**${totalUses}**`, inline: true }
      )
      .setTimestamp();

    if (sorted.length > 0) {
      const leaderboard = sorted
        .slice(0, 10)
        .map(([id, data], i) => `**${i + 1}.** <@${id}> — **${data.uses}** inv. (${data.links} lien(s))`)
        .join("\n");
      embed.addFields({ name: "🏆 Top inviteurs", value: leaderboard });
    } else {
      embed.setDescription("Aucune invitation active sur ce serveur.");
    }

    await message.reply({ embeds: [embed] });
  }

  /** Retourne le nombre d'invitations utilisées d'un utilisateur dans le serveur */
  export async function getUserInviteCount(guildId: string, userId: string): Promise<number> {
    const { client } = await import("../index");
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return 0;
    const invites = await guild.invites.fetch().catch(() => null);
    if (!invites) return 0;
    return invites
      .filter((inv) => inv.inviter?.id === userId)
      .reduce((sum, inv) => sum + (inv.uses ?? 0), 0);
  }
  