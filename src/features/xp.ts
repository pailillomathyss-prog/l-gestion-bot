import { GuildMember, Guild, ChannelType, EmbedBuilder, Message, TextChannel } from "discord.js";
import { getUser, saveUser, getTopUsers } from "../db.js";

const XP_MSG_MIN = 10, XP_MSG_MAX = 20;
const XP_VOICE_TICK = 15;
const COINS_MSG_MIN = 8, COINS_MSG_MAX = 15;
const COINS_VOICE_TICK = 12;
const MSG_COOLDOWN = 60_000;
const VOICE_TICK_MS = 5 * 60_000;

// level = floor(sqrt(xp/100))  →  xp for level N = N²×100
export function xpToLevel(xp: number) { return Math.floor(Math.sqrt(xp / 100)); }
export function levelToXP(lvl: number) { return lvl * lvl * 100; }

const MILESTONES = [
  { level: 1,    name: "🌱 Niveau 1",    color: 0x95a5a6 },
  { level: 5,    name: "⚡ Niveau 5",    color: 0x2ecc71 },
  { level: 10,   name: "🔥 Niveau 10",   color: 0x3498db },
  { level: 20,   name: "💫 Niveau 20",   color: 0x9b59b6 },
  { level: 30,   name: "✨ Niveau 30",   color: 0xe67e22 },
  { level: 50,   name: "🌟 Niveau 50",   color: 0xf39c12 },
  { level: 75,   name: "🏆 Niveau 75",   color: 0xe74c3c },
  { level: 100,  name: "👑 Niveau 100",  color: 0xffd700 },
  { level: 150,  name: "💎 Niveau 150",  color: 0x00bcd4 },
  { level: 200,  name: "🔮 Niveau 200",  color: 0xff69b4 },
  { level: 300,  name: "☄️ Niveau 300",  color: 0xff4500 },
  { level: 500,  name: "🌌 Niveau 500",  color: 0x7b2d8b },
  { level: 750,  name: "⚜️ Niveau 750",  color: 0xdaa520 },
  { level: 1000, name: "🎯 Niveau 1000", color: 0xff0000 },
] as const;

function topMilestone(level: number) {
  return [...MILESTONES].reverse().find(m => level >= m.level) ?? null;
}

async function ensureLevelRole(guild: Guild, level: number) {
  const ms = topMilestone(level);
  if (!ms) return null;
  let role = guild.roles.cache.find(r => r.name === ms.name);
  if (!role) role = await guild.roles.create({ name: ms.name, color: ms.color, permissions: [], reason: "Rôle niveau MAI•GESTION" }).catch(() => undefined);
  return role ?? null;
}

async function applyLevelRole(member: GuildMember, newLevel: number) {
  const guild = member.guild;
  const newRole = await ensureLevelRole(guild, newLevel);
  // Remove lower milestone roles
  for (const ms of MILESTONES) {
    if (ms.level >= newLevel) continue;
    const old = guild.roles.cache.find(r => r.name === ms.name);
    if (old && member.roles.cache.has(old.id)) await member.roles.remove(old).catch(() => {});
  }
  if (newRole && !member.roles.cache.has(newRole.id)) await member.roles.add(newRole).catch(() => {});
}

async function announceLevel(member: GuildMember, level: number) {
  const ms = topMilestone(level);
  const guild = member.guild;
  const ch = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText &&
    (c.name.toLowerCase().includes("général") || c.name.toLowerCase().includes("general") ||
     c.name.toLowerCase().includes("chat") || c.name.toLowerCase().includes("cmds"))
  ) as TextChannel | undefined;
  if (!ch) return;
  await ch.send({ embeds: [
    new EmbedBuilder()
      .setColor(ms?.color ?? 0x9b59b6)
      .setTitle("🎉 Montée de niveau !")
      .setDescription(`Félicitations <@${member.id}> ! Tu atteins le **niveau ${level}** !${ms ? `\n🎁 Rôle obtenu : **${ms.name}**` : ""}`)
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()
  ] }).catch(() => {});
}

// ── Message XP ────────────────────────────────────────────────────────────────
export async function handleMessageXP(member: GuildMember) {
  const now = Date.now();
  const data = await getUser(member.guild.id, member.id);
  if (now - data.lastMsgTs < MSG_COOLDOWN) return;
  const xpGain = Math.floor(Math.random() * (XP_MSG_MAX - XP_MSG_MIN + 1)) + XP_MSG_MIN;
  const coinsGain = Math.floor(Math.random() * (COINS_MSG_MAX - COINS_MSG_MIN + 1)) + COINS_MSG_MIN;
  const newXP = data.xp + xpGain;
  const newLevel = xpToLevel(newXP);
  const levelUp = newLevel > data.level;
  await saveUser(member.guild.id, member.id, { ...data, xp: newXP, level: newLevel, coins: data.coins + coinsGain, lastMsgTs: now });
  if (levelUp) {
    await applyLevelRole(member, newLevel).catch(() => {});
    await announceLevel(member, newLevel).catch(() => {});
  }
}

// ── Voice XP (called every 5 min) ────────────────────────────────────────────
export async function tickVoiceXP(guild: Guild) {
  for (const [, ch] of guild.channels.cache) {
    if (ch.type !== ChannelType.GuildVoice) continue;
    if (ch.name.toLowerCase().includes("afk") || ch.name.includes("🔕")) continue;
    for (const [, member] of (ch as import("discord.js").VoiceChannel).members) {
      if (member.user.bot) continue;
      const data = await getUser(guild.id, member.id);
      const newXP = data.xp + XP_VOICE_TICK;
      const newLevel = xpToLevel(newXP);
      const levelUp = newLevel > data.level;
      await saveUser(guild.id, member.id, { ...data, xp: newXP, level: newLevel, coins: data.coins + COINS_VOICE_TICK });
      if (levelUp) {
        await applyLevelRole(member, newLevel).catch(() => {});
        await announceLevel(member, newLevel).catch(() => {});
      }
    }
  }
}

// ── !rank command ─────────────────────────────────────────────────────────────
export async function rankCommand(message: Message) {
  if (!message.guild) return;
  // Only in 🌐・cmds
  const chName = (message.channel as { name?: string }).name?.toLowerCase() ?? "";
  if (!chName.includes("cmds") && !chName.includes("cmd") && !chName.includes("bot") && !chName.includes("🌐")) {
    const cmds = message.guild.channels.cache.find(c => c.type === ChannelType.GuildText && (c.name.includes("cmds") || c.name.includes("🌐")));
    const hint = cmds ? `<#${cmds.id}>` : "le salon `cmds`";
    const w = await message.reply(`❌ La commande !rank n'est disponible que dans ${hint}.`).catch(() => null);
    if (w) setTimeout(() => w.delete().catch(() => {}), 6000);
    return;
  }
  const targetMember = message.mentions.members?.first() ?? message.member as GuildMember;
  const data = await getUser(message.guild.id, targetMember.id);
  const top = await getTopUsers(message.guild.id, 100);
  const rank = top.findIndex(u => u.userId === targetMember.id) + 1 || "?";
  const nextXP = levelToXP(data.level + 1);
  const pct = Math.min(100, Math.floor((data.xp / nextXP) * 100));
  const barFill = Math.floor(pct / 6.67);
  const bar = "█".repeat(barFill) + "░".repeat(15 - barFill);
  const ms = topMilestone(data.level);
  await message.reply({ embeds: [
    new EmbedBuilder()
      .setColor(ms?.color ?? 0x9b59b6)
      .setTitle(`📊 Profil de ${targetMember.displayName}`)
      .setThumbnail(targetMember.user.displayAvatarURL())
      .addFields(
        { name: "🏆 Niveau", value: `**${data.level}**`, inline: true },
        { name: "⭐ XP",     value: `**${data.xp.toLocaleString("fr-FR")}**`, inline: true },
        { name: "📈 Rang",   value: `**#${rank}**`, inline: true },
        { name: "💰 Pièces", value: `**${data.coins.toLocaleString("fr-FR")} 🪙**`, inline: true },
        { name: `Progression → Niveau ${data.level + 1}`, value: `\`${bar}\` ${pct}%\n${data.xp.toLocaleString("fr-FR")} / ${nextXP.toLocaleString("fr-FR")} XP`, inline: false },
      )
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()
  ] }).catch(() => {});
}
