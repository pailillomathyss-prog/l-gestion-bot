import { GuildMember, Guild, ChannelType, EmbedBuilder, TextChannel } from "discord.js";
import { logger } from "../../lib/logger";
import { getXP, upsertXP, addCoins, getAllXP } from "./db";

const XP_MSG_MIN = 10, XP_MSG_MAX = 20;
const XP_VOICE   = 15;
const C_MSG_MIN  = 8,  C_MSG_MAX  = 15;
const C_VOICE    = 12;
const MSG_CD     = 60_000;

export function xpToLevel(xp: number):  number { return Math.floor(Math.sqrt(xp / 100)); }
export function levelToXP(lvl: number): number { return lvl * lvl * 100; }

export const MILESTONES: { level: number; name: string; color: number }[] = [
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
];

export function topMilestone(level: number) {
  return [...MILESTONES].reverse().find(m => level >= m.level) ?? null;
}

// ── Gestion des rôles de niveau ────────────────────────────────────────────────
export async function applyLevelRole(member: GuildMember, level: number) {
  const guild = member.guild;
  const ms = topMilestone(level);
  if (!ms) return;

  let role = guild.roles.cache.find(r => r.name === ms.name);
  if (!role) {
    try {
      role = await guild.roles.create({ name: ms.name, color: ms.color, permissions: [], reason: "MAI•GESTION level up" });
    } catch { return; }
  }

  for (const m of MILESTONES) {
    if (m.level >= ms.level) continue;
    const old = guild.roles.cache.find(r => r.name === m.name);
    if (old && member.roles.cache.has(old.id)) await member.roles.remove(old).catch(() => {});
  }
  if (!member.roles.cache.has(role.id)) await member.roles.add(role).catch(() => {});
}

export async function announceLevel(member: GuildMember, level: number) {
  const ms = topMilestone(level);
  const guild = member.guild;
  const ch = guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText &&
    (c.name.toLowerCase().includes("général") || c.name.toLowerCase().includes("general") ||
     c.name.toLowerCase().includes("chat")    || c.name.toLowerCase().includes("cmds"))
  ) as TextChannel | undefined;
  if (!ch) return;

  await ch.send({ embeds: [new EmbedBuilder()
    .setColor(ms?.color ?? 0x9b59b6)
    .setTitle("🎉 Montée de niveau !")
    .setDescription(`Félicitations <@${member.id}> ! Tu atteins le **niveau ${level}** !${ms ? `\n🎁 Rôle obtenu : **${ms.name}**` : ""}`)
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: "MAI•GESTION" })
    .setTimestamp()
  ] }).catch(() => {});
}

// ── XP par message ─────────────────────────────────────────────────────────────
export async function handleMessageXP(member: GuildMember) {
  const now  = Date.now();
  const data = await getXP(member.guild.id, member.id);
  if (now - data.lastMessage < MSG_CD) return;

  const xpGain = Math.floor(Math.random() * (XP_MSG_MAX - XP_MSG_MIN + 1)) + XP_MSG_MIN;
  const cGain  = Math.floor(Math.random() * (C_MSG_MAX  - C_MSG_MIN  + 1)) + C_MSG_MIN;
  const newXP  = data.xp + xpGain;
  const newLvl = xpToLevel(newXP);
  const lvlUp  = newLvl > data.level;

  await upsertXP(member.guild.id, member.id, newXP, newLvl, now);
  await addCoins(member.guild.id, member.id, cGain).catch(() => {});

  if (lvlUp) {
    await applyLevelRole(member, newLvl).catch(() => {});
    await announceLevel(member, newLvl).catch(() => {});
  }
}

// ── XP en vocal (tick toutes les 5 min) ───────────────────────────────────────
export async function tickVoiceXP(guild: Guild) {
  for (const [, ch] of guild.channels.cache) {
    if (ch.type !== ChannelType.GuildVoice) continue;
    if (ch.name.toLowerCase().includes("afk") || ch.name.includes("🔕")) continue;
    for (const [, member] of (ch as import("discord.js").VoiceChannel).members) {
      if (member.user.bot) continue;
      const data   = await getXP(guild.id, member.id);
      const newXP  = data.xp + XP_VOICE;
      const newLvl = xpToLevel(newXP);
      const lvlUp  = newLvl > data.level;
      await upsertXP(guild.id, member.id, newXP, newLvl, data.lastMessage);
      await addCoins(guild.id, member.id, C_VOICE).catch(() => {});
      if (lvlUp) {
        await applyLevelRole(member, newLvl).catch(() => {});
        await announceLevel(member, newLvl).catch(() => {});
      }
    }
  }
}

// ── Leaderboard ────────────────────────────────────────────────────────────────
export async function getLeaderboard(guildId: string, limit = 10) {
  const all = await getAllXP(guildId);
  return all.slice(0, limit);
}

// ── Commande !rank ─────────────────────────────────────────────────────────────
export async function rankCommand(message: import("discord.js").Message) {
  if (!message.guild || !message.member) return;

  const n = (message.channel as { name?: string }).name?.toLowerCase() ?? "";
  if (!n.includes("cmds") && !n.includes("cmd") && !n.includes("🌐")) {
    const cmds = message.guild.channels.cache.find(c =>
      c.type === ChannelType.GuildText && (c.name.includes("cmds") || c.name.includes("🌐"))
    );
    const hint = cmds ? `<#${cmds.id}>` : "le salon `cmds`";
    const w = await message.reply(`❌ Utilise \`!rank\` uniquement dans ${hint}.`).catch(() => null);
    if (w) setTimeout(() => w.delete().catch(() => {}), 6000);
    return;
  }

  const target = message.mentions.members?.first() ?? (message.member as GuildMember);
  const data   = await getXP(message.guild.id, target.id);
  const top    = await getAllXP(message.guild.id);
  const rank   = top.findIndex(u => u.userId === target.id) + 1 || "?";
  const nextXP = levelToXP(data.level + 1);
  const pct    = Math.min(100, Math.floor((data.xp / nextXP) * 100));
  const fill   = Math.floor(pct / 6.67);
  const bar    = "█".repeat(fill) + "░".repeat(15 - fill);
  const ms     = topMilestone(data.level);

  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(ms?.color ?? 0x9b59b6)
    .setTitle(`📊 Profil de ${target.displayName}`)
    .setThumbnail(target.user.displayAvatarURL())
    .addFields(
      { name: "🏆 Niveau", value: `**${data.level}**`,                        inline: true },
      { name: "⭐ XP",     value: `**${data.xp.toLocaleString("fr-FR")}**`,   inline: true },
      { name: "📈 Rang",   value: `**#${rank}**`,                             inline: true },
      { name: `Progression → Niveau ${data.level + 1}`,
        value: `\`${bar}\` ${pct}%\n${data.xp.toLocaleString("fr-FR")} / ${nextXP.toLocaleString("fr-FR")} XP` },
    )
    .setFooter({ text: "MAI•GESTION" })
    .setTimestamp()
  ] }).catch(() => {});
}

// ── Panel ⚖️・levels ───────────────────────────────────────────────────────────
export async function postLevelsPanelIfNeeded(guild: Guild, botId: string) {
  const ch = guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText &&
    (c.name.includes("⚖️") || c.name.toLowerCase().includes("levels") || c.name.toLowerCase().includes("niveau"))
  ) as TextChannel | undefined;
  if (!ch) return;

  const recent = await ch.messages.fetch({ limit: 10 }).catch(() => null);
  if (recent?.some(m => m.author.id === botId && m.embeds[0]?.title?.includes("Système de Niveaux"))) return;

  const rows = MILESTONES.map(m => {
    const xpNeeded = levelToXP(m.level).toLocaleString("fr-FR");
    return `• **${m.name}** — Niveau ${m.level} *(${xpNeeded} XP)*`;
  });

  await ch.send({ embeds: [new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("⚖️ Système de Niveaux — MAI•GESTION")
    .setDescription("Progresse en étant actif sur le serveur ! Les rôles de niveau sont créés **automatiquement** dès qu'un membre les atteint.")
    .addFields(
      { name: "💬 Gagner de l'XP", value: "• **Message** : 10–20 XP *(cooldown 1 min)*\n• **Vocal** : 15 XP toutes les 5 min", inline: false },
      { name: "📐 Formule de niveau", value: "```\nNiveau  = floor( √(XP ÷ 100) )\nXP requis = Niveau² × 100\n```Exemple : Niveau 10 = **1 000 XP** | Niveau 100 = **1 000 000 XP**", inline: false },
      { name: "🏅 Paliers & Rôles (1-7)", value: rows.slice(0, 7).join("\n"), inline: true },
      { name: "🏅 Paliers & Rôles (8-14)", value: rows.slice(7).join("\n"), inline: true },
      { name: "📊 Voir son niveau", value: "Utilise `!rank` ou `!rank @membre` dans 🌐・cmds", inline: false },
    )
    .setFooter({ text: "MAI•GESTION • Les rôles de niveau remplacent le précédent à chaque palier" })
    .setTimestamp()
  ] }).catch(() => {});
  logger.info(`⚖️ Panel niveaux → #${ch.name}`);
}
