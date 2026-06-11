import {
  Message, PermissionFlagsBits, GuildMember, TextChannel,
  ChannelType, EmbedBuilder, Client, Guild,
} from "discord.js";
import { getPunish, setPunish, delPunish, getAllPunishments } from "../db.js";

const MUTED_ROLE = "🔇 Muet";

async function ensureMuteRole(guild: Guild) {
  let role = guild.roles.cache.find(r => r.name === MUTED_ROLE);
  if (!role) {
    role = await guild.roles.create({ name: MUTED_ROLE, permissions: [], color: 0x666666, reason: "MAI•GESTION" });
    for (const [, ch] of guild.channels.cache) {
      if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildVoice)
        await ch.permissionOverwrites.edit(role, { SendMessages: false, Speak: false }).catch(() => {});
    }
  }
  return role;
}

const E = (color: number, desc: string) =>
  new EmbedBuilder().setColor(color).setDescription(desc).setFooter({ text: "MAI•GESTION" }).setTimestamp();

export async function handleModCommand(msg: Message, cmd: string, args: string[]) {
  if (!msg.guild || !msg.member) return;
  if (!(msg.member as GuildMember).permissions.has(PermissionFlagsBits.Administrator)) return;
  const guild = msg.guild;

  switch (cmd) {
    case "ban": {
      const target = msg.mentions.members?.first() || msg.mentions.users.first();
      if (!target) { await msg.reply("❌ Usage : `!ban @membre [raison]`"); return; }
      const uid = "id" in target ? target.id : (target as any).user?.id ?? target.id;
      const reason = args.slice(1).join(" ") || "Aucune raison";
      await guild.members.ban(uid, { reason }).catch(async () => { await msg.reply("❌ Impossible de bannir."); });
      await msg.reply({ embeds: [E(0xff4444, `🔨 <@${uid}> banni. Raison : ${reason}`)] });
      break;
    }
    case "unban": {
      const id = args[0]; if (!id) { await msg.reply("❌ Usage : `!unban [ID]`"); return; }
      await guild.members.unban(id).catch(async () => { await msg.reply("❌ Impossible de débannir."); });
      await msg.reply({ embeds: [E(0x00cc66, `✅ \`${id}\` débanni.`)] });
      break;
    }
    case "mute": {
      const member = msg.mentions.members?.first();
      if (!member) { await msg.reply("❌ Usage : `!mute @membre [minutes]`"); return; }
      const minutes = Math.max(1, parseInt(args[1] || "10") || 10);
      const role = await ensureMuteRole(guild);
      const saved = member.roles.cache.filter(r => r.id !== guild.roles.everyone.id).map(r => r.id);
      const expiresAt = Date.now() + minutes * 60_000;
      await setPunish(guild.id, member.id, { roles: saved, expiresAt, reason: "Mute" });
      await member.roles.set([role]);
      await msg.reply({ embeds: [E(0xff9900, `🔇 **${member.displayName}** muté ${minutes} min. Fin <t:${Math.floor(expiresAt / 1000)}:R>`)] });
      setTimeout(() => unmuteUser(msg.client, guild.id, member.id).catch(() => {}), minutes * 60_000);
      break;
    }
    case "demute":
    case "unmute": {
      const member = msg.mentions.members?.first();
      if (!member) { await msg.reply("❌ Usage : `!demute @membre`"); return; }
      await unmuteUser(msg.client, guild.id, member.id);
      await msg.reply({ embeds: [E(0x00cc66, `✅ **${member.displayName}** n'est plus muet.`)] });
      break;
    }
    case "lock": {
      const ch = (msg.mentions.channels.first() as TextChannel | undefined) ?? (msg.channel as TextChannel);
      // Bloquer @everyone
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false, SendMessagesInThreads: false }).catch(() => {});
      // Bloquer aussi chaque rôle qui a un overwrite explicite (ex: ✅ Membre)
      for (const [, ow] of ch.permissionOverwrites.cache) {
        if (ow.type === 0 && ow.id !== guild.roles.everyone.id) {
          const role = guild.roles.cache.get(ow.id);
          if (role) await ch.permissionOverwrites.edit(role, { SendMessages: false, SendMessagesInThreads: false }).catch(() => {});
        }
      }
      await msg.reply({ embeds: [E(0xff4444, `🔒 <#${ch.id}> verrouillé — aucun rôle ne peut écrire.`)] });
      break;
    }
    case "unlock": {
      const ch = (msg.mentions.channels.first() as TextChannel | undefined) ?? (msg.channel as TextChannel);
      // Restaurer @everyone
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null, SendMessagesInThreads: null }).catch(() => {});
      // Restaurer tous les overwrites de rôles
      for (const [, ow] of ch.permissionOverwrites.cache) {
        if (ow.type === 0 && ow.id !== guild.roles.everyone.id) {
          const role = guild.roles.cache.get(ow.id);
          if (role) await ch.permissionOverwrites.edit(role, { SendMessages: null, SendMessagesInThreads: null }).catch(() => {});
        }
      }
      await msg.reply({ embeds: [E(0x00cc66, `🔓 <#${ch.id}> déverrouillé.`)] });
      break;
    }
  }
}

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

export async function initMod(client: Client) {
  const all = await getAllPunishments();
  const now = Date.now();
  for (const p of all) {
    if (p.expiresAt && p.expiresAt <= now) await unmuteUser(client, p.guildId, p.userId).catch(() => {});
    else if (p.expiresAt > now) setTimeout(() => unmuteUser(client, p.guildId, p.userId).catch(() => {}), p.expiresAt - now);
  }
}
