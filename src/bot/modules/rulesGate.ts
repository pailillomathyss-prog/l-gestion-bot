import {
  TextChannel, EmbedBuilder, GuildMember, Guild, ChannelType, Role,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
} from "discord.js";
import { logger } from "../../lib/logger.js";
import { saveRulesMessageId } from "../state.js";

export const RULES_ACCEPT_BTN = "rules_accept";
export let rulesMessageId: string | null = null;

export function setRulesMessageId(id: string) { rulesMessageId = id; }

// Keep for backward compat with index.ts
export const ENTER_REACTION = "✅";

const VIEWER_ROLE    = "✅・Membre";
const NOUVEAUX_ROLE  = "⏳・nouveaux";

const READ_ONLY_KEYWORDS = [
  "annonce","giveaway","evenement","event","boost","bienvenue",
  "reglement","rules","regles","regle","levels","level",
  "quetes","quete","jeux","shop","boutique","don","dons",
];

function normalize(s: string) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(); }
function isRulesChannel(name: string) { const n=normalize(name); return n.includes("reglement")||n.includes("rules")||n.includes("regles"); }
function isStaffChannel(name: string) { const n=normalize(name); return n.includes("staff")||n.includes("moderator")||n.includes("admin")||n.includes("log")||n==="mod"||n.startsWith("mod-")||n.endsWith("-mod"); }
function isReadOnlyChannel(name: string) { const n=normalize(name); return READ_ONLY_KEYWORDS.some(kw=>n.includes(kw)); }

export function isJugementChannel(name: string) {
  const n=normalize(name); const nNoSpace=n.replace(/\s+/g,"");
  return n.includes("jugement")||n.includes("jugment")||n.includes("prison")||n.includes("sanction")||nNoSpace.includes("jugement")||nNoSpace.includes("⚖");
}
export function isInJugementZone(channel: { name: string; parent?: { name: string } | null }): boolean {
  if (isJugementChannel(channel.name)) return true;
  if (channel.parent && isJugementChannel(channel.parent.name)) return true;
  return false;
}

async function ensureRole(guild: Guild, roleName: string, color?: number): Promise<Role | null> {
  await guild.roles.fetch();
  let role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    try {
      role = await guild.roles.create({ name: roleName, color: color ?? 0x000000, reason: "Rôle créé par MAI•GESTION", permissions: [] });
      logger.info(`Rôle "${roleName}" créé`);
    } catch (err) { logger.error({ err }, `Impossible de créer "${roleName}"`); return null; }
  }
  return role;
}

export async function syncChannelPermissions(guild: Guild): Promise<void> {
  const viewerRole = await ensureRole(guild, VIEWER_ROLE, 0x00cc66);
  const nouveauxRole = await ensureRole(guild, NOUVEAUX_ROLE, 0x95a5a6);
  if (!viewerRole || !nouveauxRole) return;

  await guild.roles.fetch();
  await guild.channels.fetch();
  const everyone = guild.roles.everyone;
  let synced = 0, skipped = 0;

  for (const [, channel] of guild.channels.cache) {
    const allowed = [ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildStageVoice] as number[];
    if (!allowed.includes(channel.type)) continue;
    if (isStaffChannel(channel.name)) { skipped++; continue; }

    const parentId: string | null = (channel as { parentId?: string }).parentId ?? null;
    const parentName = parentId ? (guild.channels.cache.get(parentId)?.name ?? "") : "";
    if (isJugementChannel(channel.name) || isJugementChannel(parentName)) { skipped++; continue; }

    // AFK channel — deny speech for everyone
    if (channel.name.toLowerCase().includes("afk") || channel.name.includes("🔕")) {
      if (channel.type === ChannelType.GuildVoice) {
        await channel.permissionOverwrites.edit(everyone, { Speak: false, Stream: false }).catch(() => {});
      }
      skipped++; continue;
    }

    const isRules = isRulesChannel(channel.name);
    const isReadOnly = isReadOnlyChannel(channel.name);
    const isTextLike = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(channel.type as number);
    const isVoiceLike = [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type as number);

    try {
      if (isRules) {
        // Le salon règlement : tout le monde peut le voir (pour lire et accepter)
        await channel.permissionOverwrites.edit(everyone, { ViewChannel: true, SendMessages: false, AddReactions: false });
        await channel.permissionOverwrites.edit(nouveauxRole, { ViewChannel: true, SendMessages: false });
        await channel.permissionOverwrites.edit(viewerRole, { ViewChannel: true, SendMessages: false });
      } else if (isReadOnly) {
        await channel.permissionOverwrites.edit(everyone, { ViewChannel: false });
        await channel.permissionOverwrites.edit(nouveauxRole, { ViewChannel: false });
        await channel.permissionOverwrites.edit(viewerRole, { ViewChannel: true, SendMessages: false });
      } else {
        await channel.permissionOverwrites.edit(everyone, { ViewChannel: false });
        await channel.permissionOverwrites.edit(nouveauxRole, { ViewChannel: false });
        await channel.permissionOverwrites.edit(viewerRole, {
          ViewChannel: true,
          SendMessages: isTextLike ? true : null,
          Connect: isVoiceLike ? true : null,
          AddReactions: true,
        });
      }
      synced++;
    } catch (err) { logger.warn({ err }, `Impossible de sync #${channel.name}`); }
  }

  logger.info(`✅ Permissions sync — ${synced} salons, ${skipped} ignorés`);
}

export async function findOrSendEnterMessage(channel: TextChannel, savedId: string | null, guildId: string): Promise<string | null> {
  if (savedId) {
    const existing = await channel.messages.fetch(savedId).catch(() => null);
    if (existing) { rulesMessageId = savedId; logger.info(`📌 Message règlement retrouvé`); return savedId; }
  }

  try {
    const recent = await channel.messages.fetch({ limit: 50 });
    const botMsg = recent.find(m => m.author.id === channel.client.user?.id && m.embeds.length > 0 && m.components.length > 0);
    if (botMsg) {
      rulesMessageId = botMsg.id;
      await saveRulesMessageId(guildId, botMsg.id);
      return botMsg.id;
    }
  } catch (err) { logger.warn({ err }, "Erreur scan salon règlement"); }

  return sendEnterMessage(channel, guildId);
}

async function sendEnterMessage(channel: TextChannel, guildId: string): Promise<string | null> {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("✦ Bienvenue sur le meilleur serveur du monde ! ✦")
    .setDescription(
      [
        "**Veut-tu entrer dans le meilleur server du monde ?**",
        "",
        "En cliquant sur le bouton ci-dessous, tu acceptes le règlement du serveur et tu obtiendras accès à tous les salons.",
        "",
        "📜 **Règles principales :**",
        "• Respect de tous les membres",
        "• Pas d'insultes, discriminations ou harcèlement",
        "• Pas de spam ou de publicité non autorisée",
        "• Suivre les instructions des modérateurs",
        "",
        `✅ Clique sur le bouton **J'accepte le règlement** pour accéder au serveur !`,
      ].join("\n")
    )
    .setFooter({ text: "MAI•GESTION • En acceptant tu confirmes avoir lu le règlement" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(RULES_ACCEPT_BTN)
      .setLabel("✅ J'accepte le règlement !")
      .setStyle(ButtonStyle.Success),
  );

  try {
    const msg = await channel.send({ embeds: [embed], components: [row] });
    rulesMessageId = msg.id;
    await saveRulesMessageId(guildId, msg.id);
    logger.info(`📨 Message règlement envoyé dans #${channel.name} (id: ${msg.id})`);
    return msg.id;
  } catch (err) {
    logger.error({ err }, "Impossible d'envoyer le message d'entrée");
    return null;
  }
}

export async function handleRulesAccept(btn: ButtonInteraction) {
  if (!btn.guild || !btn.member) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }
  const member = await btn.guild.members.fetch(btn.user.id).catch(() => null) as GuildMember | null;
  if (!member) { await btn.reply({ content: "❌ Impossible de récupérer ton profil.", ephemeral: true }); return; }

  const role = await ensureRole(btn.guild, VIEWER_ROLE, 0x00cc66);
  if (!role) { await btn.reply({ content: "❌ Impossible de créer le rôle.", ephemeral: true }); return; }

  if (member.roles.cache.has(role.id)) {
    await btn.reply({ content: "✅ Tu as déjà accès au serveur !", ephemeral: true });
    return;
  }

  await member.roles.add(role).catch(() => {});

  // Retirer le rôle "nouveaux" si présent
  const nouveauxRole = btn.guild.roles.cache.find(r => r.name === NOUVEAUX_ROLE);
  if (nouveauxRole && member.roles.cache.has(nouveauxRole.id)) {
    await member.roles.remove(nouveauxRole).catch(() => {});
  }

  await btn.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x00cc66)
      .setTitle("🎉 Bienvenue !")
      .setDescription(`Bienvenue <@${member.id}> ! Tu as maintenant accès à tous les salons du serveur.\n\nBonne visite ! 🚀`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
    ephemeral: true,
  });
  logger.info(`✅ ${member.user.tag} a accepté le règlement`);
}

// Kept for legacy reaction support
export async function handleEnterReaction(member: GuildMember, messageId: string, action: "add" | "remove") {
  const role = await ensureRole(member.guild, VIEWER_ROLE, 0x00cc66);
  if (!role) return;
  try {
    if (action === "add") await member.roles.add(role);
    else await member.roles.remove(role);
  } catch (err) { logger.warn({ err }, `Impossible de modifier le rôle pour ${member.user.tag}`); }
}
