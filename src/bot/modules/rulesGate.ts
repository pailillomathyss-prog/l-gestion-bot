import { TextChannel, EmbedBuilder, GuildMember, Guild, ChannelType, Role, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../../lib/logger";
import { setState, getState } from "./db";
import { ensurePanel } from "./panelUtils";

const MEMBRE_ROLE = "✅ Membre";

function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isRulesChannel(name: string) {
  const n = normalize(name);
  return n.includes("reglement") || n.includes("rules") || n.includes("regles") || n.includes("regle");
}

async function ensureMemberRole(guild: Guild): Promise<Role | null> {
  await guild.roles.fetch();
  let role = guild.roles.cache.find(r => r.name === MEMBRE_ROLE);
  if (!role) {
    try {
      role = await guild.roles.create({ name: MEMBRE_ROLE, color: 0x57f287, permissions: [], reason: "Rôle membre MAI•GESTION" });
      logger.info(`Rôle "${MEMBRE_ROLE}" créé sur ${guild.name}`);
    } catch (err) {
      logger.error({ err }, `Impossible de créer le rôle "${MEMBRE_ROLE}"`);
      return null;
    }
  }
  return role;
}

// ── Builders règlement ─────────────────────────────────────────────────────────
function buildRulesEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📜 Règlement — MAI•GESTION")
    .setDescription(
      "Bienvenue sur le serveur ! Merci de respecter les règles suivantes :\n\n" +
      "**1.** Respectez tous les membres\n" +
      "**2.** Pas de spam ni de flood\n" +
      "**3.** Pas de liens non autorisés\n" +
      "**4.** Pas de contenu NSFW\n" +
      "**5.** Respectez les modérateurs\n\n" +
      "En cliquant sur **J'accepte**, vous confirmez avoir lu et accepté le règlement."
    )
    .setFooter({ text: "MAI•GESTION" })
    .setTimestamp();
}

function buildRulesComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("rules_accept").setLabel("✅ J'accepte").setStyle(ButtonStyle.Success),
  )];
}

// ── Post panel règlement ───────────────────────────────────────────────────────
export async function postRulesPanelIfNeeded(guild: Guild, botId: string): Promise<void> {
  const ch = guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText && isRulesChannel(c.name)
  ) as TextChannel | undefined;
  if (!ch) return;

  await ensurePanel(
    ch, botId,
    "Règlement",
    "rules_accept",
    buildRulesEmbed,
    buildRulesComponents,
    "📜 Règlement",
  );
}

// ── Acceptation du règlement ───────────────────────────────────────────────────
export async function handleRulesAccept(btn: import("discord.js").ButtonInteraction): Promise<void> {
  if (!btn.guild || !btn.member) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }

  const member = btn.member as GuildMember;
  const role   = await ensureMemberRole(btn.guild);

  if (!role) { await btn.reply({ content: "❌ Rôle introuvable.", ephemeral: true }); return; }

  if (member.roles.cache.has(role.id)) {
    await btn.reply({ content: "✅ Tu possèdes déjà le rôle Membre !", ephemeral: true });
    return;
  }

  await member.roles.add(role).catch(() => {});
  await btn.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x57f287).setTitle("✅ Règlement accepté !")
      .setDescription(`Bienvenue <@${member.id}> ! Tu as maintenant accès au serveur.`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
    ephemeral: true,
  });
}

// ── Sync perms ─────────────────────────────────────────────────────────────────
export async function syncChannelPermissions(guild: Guild): Promise<string> {
  await guild.channels.fetch();
  await guild.roles.fetch();
  let synced = 0;

  for (const [, ch] of guild.channels.cache) {
    if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildVoice) continue;
    try {
      await (ch as TextChannel).lockPermissions?.().catch(() => {});
      synced++;
    } catch { /* ignore */ }
  }
  return `✅ ${synced} salons synchronisés.`;
}
