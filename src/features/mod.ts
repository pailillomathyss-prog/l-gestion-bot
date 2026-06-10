import { Message, PermissionFlagsBits, GuildMember, TextChannel, ChannelType, EmbedBuilder, Client } from "discord.js";
import { getPunish, setPunish, delPunish, getAllPunishments } from "../db.js";

const MUTED_ROLE = "🔇 Muet";

// ── Helpers ───────────────────────────────────────────────────────────────────
async function ensureMuteRole(guild: import("discord.js").Guild) {
  let role = guild.roles.cache.find(r => r.name === MUTED_ROLE);
  if (!role) {
    role = await guild.roles.create({ name: MUTED_ROLE, permissions: [], color: 0x666666, reason: "Rôle mute MAI•GESTION" });
    for (const [, ch] of guild.channels.cache) {
      if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildVoice) {
        await ch.permissionOverwrites.edit(role, { SendMessages: false, Speak: false }).catch(() => {});
      }
    }
  }
  return role;
}

function replyEmbed(color: number, desc: string) {
  return new EmbedBuilder().setColor(color).setDescription(desc).setFooter({ text: "MAI•GESTION" }).setTimestamp();
}

function isAdmin(member: GuildMember) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

// ── Commands ──────────────────────────────────────────────────────────────────
export async function handleModCommand(message: Message, command: string, args: string[]) {
  if (!message.guild || !message.member || !isAdmin(message.member as GuildMember)) return;

  const guild = message.guild;
  const target = message.mentions.members?.first() || message.mentions.users.first();

  switch (command) {

    case "ban": {
      if (!target) { await message.reply("❌ Usage : `!ban @membre [raison]`"); return; }
      const reason = args.slice(1).join(" ") || "Aucune raison";
      const userId = "id" in target ? target.id : target.user.id;
      await guild.members.ban(userId, { reason }).catch(async () => { await message.reply("❌ Impossible de bannir."); return; });
      await message.reply({ embeds: [replyEmbed(0xff4444, `🔨 **<@${userId}>** a été banni.\nRaison : ${reason}`)] });
      break;
    }

    case "unban": {
      const id = args[0];
      if (!id) { await message.reply("❌ Usage : `!unban [ID]`"); return; }
      await guild.members.unban(id).catch(async () => { await message.reply("❌ Impossible de débannir."); return; });
      await message.reply({ embeds: [replyEmbed(0x00cc66, `✅ Membre \`${id}\` débanni.`)] });
      break;
    }

    case "mute": {
      if (!target || !("id" in target)) { await message.reply("❌ Usage : `!mute @membre [minutes]`"); return; }
      const member = target as GuildMember;
      const minutes = parseInt(args[1] || "10") || 10;
      const role = await ensureMuteRole(guild);
      const savedRoles = member.roles.cache.filter(r => r.id !== guild.roles.everyone.id).map(r => r.id);
      const expiresAt = Date.now() + minutes * 60000;
      await setPunish(guild.id, member.id, { roles: savedRoles, expiresAt, reason: "Mute" });
      await member.roles.set([role]);
      await message.reply({ embeds: [replyEmbed(0xff9900, `🔇 **${member.displayName}** muté ${minutes} min. Libération <t:${Math.floor(expiresAt / 1000)}:R>`)] });
      setTimeout(() => unmuteUser(message.client, guild.id, member.id).catch(() => {}), minutes * 60000);
      break;
    }

    case "demute":
    case "unmute": {
      if (!target || !("id" in target)) { await message.reply("❌ Usage : `!demute @membre`"); return; }
      await unmuteUser(message.client, guild.id, (target as GuildMember).id);
      await message.reply({ embeds: [replyEmbed(0x00cc66, `✅ **${(target as GuildMember).displayName}** n'est plus muet.`)] });
      break;
    }

    case "lock": {
      const ch = (message.mentions.channels.first() as TextChannel | undefined) ?? (message.channel as TextChannel);
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      await message.reply({ embeds: [replyEmbed(0xff4444, `🔒 <#${ch.id}> verrouillé.`)] });
      break;
    }

    case "unlock": {
      const ch = (message.mentions.channels.first() as TextChannel | undefined) ?? (message.channel as TextChannel);
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
      await message.reply({ embeds: [replyEmbed(0x00cc66, `🔓 <#${ch.id}> déverrouillé.`)] });
      break;
    }
  }
}

// ── Unmute helper (used by init too) ─────────────────────────────────────────
export async function unmuteUser(client: Client, guildId: string, userId: string) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const record = await getPunish(guildId, userId);
  if (!record) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) {
    const roles = record.roles.map(id => guild.roles.cache.get(id)).filter(Boolean) as import("discord.js").Role[];
    if (roles.length) await member.roles.set(roles).catch(() => {});
  }
  await delPunish(guildId, userId);
}

// ── Init: restore expired mutes ───────────────────────────────────────────────
export async function initMod(client: Client) {
  const all = await getAllPunishments();
  const now = Date.now();
  for (const p of all) {
    if (p.expiresAt && p.expiresAt <= now) {
      await unmuteUser(client, p.guildId, p.userId).catch(() => {});
    } else if (p.expiresAt > now) {
      setTimeout(() => unmuteUser(client, p.guildId, p.userId).catch(() => {}), p.expiresAt - now);
    }
  }
}
