import {
  Guild, TextChannel, ChannelType, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, GuildMember,
} from "discord.js";
import { getState, setState } from "../db.js";

const MEMBER_ROLE = "✅ Membre";
const RULES_BTN_ID = "rules_accept";
export { RULES_BTN_ID };

// ── Ensure member role exists ─────────────────────────────────────────────────
async function ensureMemberRole(guild: Guild) {
  let role = guild.roles.cache.find(r => r.name === MEMBER_ROLE);
  if (!role) {
    role = await guild.roles.create({
      name: MEMBER_ROLE, color: 0x00cc66, permissions: [], reason: "Rôle membre MAI•GESTION"
    });
    console.log(`✅ Rôle "${MEMBER_ROLE}" créé sur ${guild.name}`);
  }
  return role;
}

// ── Lock all channels except règlement to require member role ─────────────────
export async function syncPermissions(guild: Guild) {
  const memberRole = await ensureMemberRole(guild);
  const everyone = guild.roles.everyone;

  for (const [, channel] of guild.channels.cache) {
    const name = channel.name.toLowerCase();
    const isText = channel.type === ChannelType.GuildText;
    const isVoice = channel.type === ChannelType.GuildVoice;
    if (!isText && !isVoice) continue;

    // AFK → personne ne peut parler/écouter
    if (name.includes("afk") || name.includes("🔕")) {
      if (isVoice) await channel.permissionOverwrites.edit(everyone, { Speak: false, Stream: false, Connect: false }).catch(() => {});
      continue;
    }

    // Règlement → tout le monde peut voir (pour lire et accepter)
    if (name.includes("règlement") || name.includes("reglement") || name.includes("règle") || name.includes("regles")) {
      await channel.permissionOverwrites.edit(everyone, { ViewChannel: true, SendMessages: false, AddReactions: false }).catch(() => {});
      await channel.permissionOverwrites.edit(memberRole, { ViewChannel: true, SendMessages: false }).catch(() => {});
      continue;
    }

    // Autres canaux : masqués pour tout le monde, visibles pour Membre
    await channel.permissionOverwrites.edit(everyone, { ViewChannel: false }).catch(() => {});
    await channel.permissionOverwrites.edit(memberRole, {
      ViewChannel: true,
      SendMessages: isText ? true : null,
      Connect: isVoice ? true : null,
      Speak: isVoice ? true : null,
    }).catch(() => {});
  }
  console.log(`✅ Permissions synchronisées sur ${guild.name}`);
}

// ── Post rules message ────────────────────────────────────────────────────────
export async function postRulesIfNeeded(guild: Guild, botId: string) {
  const ch = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText &&
      (c.name.includes("règlement") || c.name.includes("reglement") || c.name.includes("🎯"))
  ) as TextChannel | undefined;
  if (!ch) return;

  // Check if already posted
  const savedId = await getState(`rules_msg:${guild.id}`);
  if (savedId) {
    const existing = await ch.messages.fetch(savedId).catch(() => null);
    if (existing) return;
  }

  const recent = await ch.messages.fetch({ limit: 20 }).catch(() => null);
  const existing = recent?.find(m => m.author.id === botId && m.components.length > 0);
  if (existing) { await setState(`rules_msg:${guild.id}`, existing.id); return; }

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🎮 Veut-tu entrer dans le meilleur server du monde ?")
    .setDescription(
      "En acceptant le règlement, tu obtiendras accès à **tous les salons** du serveur.\n\n" +
      "**📜 Règles à respecter :**\n" +
      "• Respecte tous les membres sans exception\n" +
      "• Pas d'insultes, de discrimination ou de harcèlement\n" +
      "• Pas de spam, pub non autorisée ou lien suspect\n" +
      "• Suis les instructions des modérateurs\n" +
      "• Bonne ambiance obligatoire !\n\n" +
      "✅ **Clique sur le bouton ci-dessous pour accéder au serveur !**"
    )
    .setFooter({ text: "MAI•GESTION • En acceptant tu confirmes avoir lu le règlement" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(RULES_BTN_ID)
      .setLabel("✅ J'accepte le règlement !")
      .setStyle(ButtonStyle.Success)
  );

  const msg = await ch.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (msg) await setState(`rules_msg:${guild.id}`, msg.id);
  console.log(`📜 Règlement posté dans #${ch.name}`);
}

// ── Button handler ────────────────────────────────────────────────────────────
export async function handleRulesAccept(btn: ButtonInteraction) {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }
  const member = await btn.guild.members.fetch(btn.user.id).catch(() => null);
  if (!member) { await btn.reply({ content: "❌ Profil introuvable.", ephemeral: true }); return; }
  const role = await ensureMemberRole(btn.guild);
  if (member.roles.cache.has(role.id)) {
    await btn.reply({ content: "✅ Tu as déjà accès au serveur !", ephemeral: true }); return;
  }
  await member.roles.add(role).catch(() => {});
  await btn.reply({ embeds: [
    new EmbedBuilder()
      .setColor(0x00cc66)
      .setTitle("🎉 Bienvenue !")
      .setDescription(`Bienvenue **${member.displayName}** ! 🎊\nTu as maintenant accès à tous les salons du serveur.\n\nBonne visite ! 🚀`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()
  ], ephemeral: true });
}
