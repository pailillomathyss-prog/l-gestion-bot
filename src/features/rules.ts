import {
  Guild, TextChannel, ChannelType, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
} from "discord.js";
import { getState, setState } from "../db.js";

const MEMBER_ROLE = "✅ Membre";
export const RULES_BTN_ID = "rules_accept";

async function ensureMemberRole(guild: Guild) {
  let role = guild.roles.cache.find(r => r.name === MEMBER_ROLE);
  if (!role) role = await guild.roles.create({ name: MEMBER_ROLE, color: 0x00cc66, permissions: [], reason: "MAI•GESTION" });
  return role;
}

export async function syncPermissions(guild: Guild) {
  const memberRole = await ensureMemberRole(guild);
  const everyone   = guild.roles.everyone;
  for (const [, ch] of guild.channels.cache) {
    const n = ch.name.toLowerCase();
    const isText  = ch.type === ChannelType.GuildText;
    const isVoice = ch.type === ChannelType.GuildVoice;
    if (!isText && !isVoice) continue;
    // AFK → personne ne parle ni écoute
    if (n.includes("afk") || n.includes("🔕")) {
      if (isVoice) await ch.permissionOverwrites.edit(everyone, { Connect: false, Speak: false, Stream: false }).catch(() => {});
      continue;
    }
    // Règlement → tout le monde peut lire
    if (n.includes("règlement") || n.includes("reglement") || n.includes("🎯")) {
      await ch.permissionOverwrites.edit(everyone,    { ViewChannel: true,  SendMessages: false }).catch(() => {});
      await ch.permissionOverwrites.edit(memberRole,  { ViewChannel: true,  SendMessages: false }).catch(() => {});
      continue;
    }
    // Autres → masqués sans rôle Membre
    await ch.permissionOverwrites.edit(everyone,   { ViewChannel: false }).catch(() => {});
    await ch.permissionOverwrites.edit(memberRole, {
      ViewChannel: true,
      SendMessages: isText  ? true : null,
      Connect:      isVoice ? true : null,
      Speak:        isVoice ? true : null,
    }).catch(() => {});
  }
  console.log(`✅ Permissions sync : ${guild.name}`);
}

export async function postRulesIfNeeded(guild: Guild, botId: string) {
  const ch = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText && (c.name.includes("🎯") || c.name.includes("règlement") || c.name.includes("reglement"))
  ) as TextChannel | undefined;
  if (!ch) return;
  const savedId = await getState(`rules_msg:${guild.id}`);
  if (savedId && await ch.messages.fetch(savedId).catch(() => null)) return;
  const recent = await ch.messages.fetch({ limit: 20 }).catch(() => null);
  const existing = recent?.find(m => m.author.id === botId && m.components.length > 0);
  if (existing) { await setState(`rules_msg:${guild.id}`, existing.id); return; }
  const msg = await ch.send({
    embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle("🎮 Veut-tu entrer dans le meilleur server du monde ?")
      .setDescription("En acceptant le règlement tu obtiens accès à **tous les salons**.\n\n**📜 Règles :**\n• Respecte tout le monde\n• Pas d'insultes ni de harcèlement\n• Pas de spam, pub non autorisée ou lien suspect\n• Suis les instructions des modérateurs\n\n✅ **Clique sur le bouton pour accéder au serveur !**")
      .setFooter({ text: "MAI•GESTION • En acceptant tu confirmes avoir lu le règlement" }).setTimestamp()],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(RULES_BTN_ID).setLabel("✅ J'accepte le règlement !").setStyle(ButtonStyle.Success)
    )],
  }).catch(() => null);
  if (msg) await setState(`rules_msg:${guild.id}`, msg.id);
  console.log(`📜 Règlement posté dans #${ch.name}`);
}

export async function handleRulesAccept(btn: ButtonInteraction) {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }
  const member = await btn.guild.members.fetch(btn.user.id).catch(() => null);
  if (!member) { await btn.reply({ content: "❌ Profil introuvable.", ephemeral: true }); return; }
  const role = await ensureMemberRole(btn.guild);
  if (member.roles.cache.has(role.id)) { await btn.reply({ content: "✅ Tu as déjà accès au serveur !", ephemeral: true }); return; }
  await member.roles.add(role).catch(() => {});
  await btn.reply({ embeds: [new EmbedBuilder().setColor(0x00cc66).setTitle("🎉 Bienvenue !").setDescription(`**${member.displayName}** a rejoint le serveur ! 🎊\nTu as maintenant accès à tous les salons. Bonne visite ! 🚀`).setFooter({ text: "MAI•GESTION" }).setTimestamp()], ephemeral: true });
}
