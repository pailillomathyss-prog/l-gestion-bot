import {
  Guild, TextChannel, ChannelType, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonInteraction, UserSelectMenuInteraction, ModalSubmitInteraction,
  GuildMember,
} from "discord.js";
import { logger } from "../../lib/logger";
import { getCoins, addCoins } from "./db";

interface PendingDonation { recipientId: string; recipientName: string; expiry: number; }
const pending  = new Map<string, PendingDonation>();
const PENDING_TTL = 5 * 60 * 1000;

function pendingKey(guildId: string, donorId: string) { return `${guildId}:${donorId}`; }

function setPending(guildId: string, donorId: string, data: Omit<PendingDonation, "expiry">) {
  pending.set(pendingKey(guildId, donorId), { ...data, expiry: Date.now() + PENDING_TTL });
}
function getPending(guildId: string, donorId: string): PendingDonation | null {
  const d = pending.get(pendingKey(guildId, donorId));
  if (!d) return null;
  if (Date.now() > d.expiry) { pending.delete(pendingKey(guildId, donorId)); return null; }
  return d;
}
function clearPending(guildId: string, donorId: string) { pending.delete(pendingKey(guildId, donorId)); }
setInterval(() => { const now = Date.now(); for (const [k, v] of pending) if (now > v.expiry) pending.delete(k); }, 60_000);

// ── Panel dons ─────────────────────────────────────────────────────────────────
export function buildDonationEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle("❤️ Système de Dons — MAI•GESTION")
    .setDescription("Transfère des pièces à un autre membre du serveur !\n\nClique sur **Faire un don** pour commencer.")
    .addFields({ name: "📋 Informations", value: "• Minimum : **1 🪙**\n• Le don est instantané\n• Tu ne peux pas te donner à toi-même", inline: false })
    .setFooter({ text: "MAI•GESTION • Sois généreux !" })
    .setTimestamp();
}

export function buildDonationComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("don_start").setLabel("❤️ Faire un don").setStyle(ButtonStyle.Danger),
  )];
}

export async function postDonationPanelIfNeeded(guild: Guild, botId: string): Promise<void> {
  const ch = guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText &&
    (c.name.toLowerCase().includes("don") || c.name.includes("❤️"))
  ) as TextChannel | undefined;
  if (!ch) return;

  try {
    const recent = await ch.messages.fetch({ limit: 20 });
    if (recent.some(m => m.author.id === botId && m.embeds[0]?.title?.includes("Dons"))) return;
    await ch.send({ embeds: [buildDonationEmbed()], components: buildDonationComponents() });
    logger.info(`❤️ Panel dons posté dans #${ch.name}`);
  } catch (err) {
    logger.warn({ err }, "Impossible de poster le panel dons");
  }
}

// ── Étape 1 : bouton "Faire un don" → menu sélection membre ───────────────────
export async function handleDonStart(btn: ButtonInteraction): Promise<void> {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }

  const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId("don_select_user")
      .setPlaceholder("Sélectionne un membre...")
      .setMinValues(1).setMaxValues(1)
  );
  await btn.reply({ content: "👤 **Sélectionne le destinataire du don :**", components: [row], ephemeral: true });
}

// ── Étape 2 : sélection du membre → modale montant ────────────────────────────
export async function handleDonSelectUser(interaction: UserSelectMenuInteraction): Promise<void> {
  if (!interaction.guild) { await interaction.reply({ content: "❌ Erreur.", ephemeral: true }); return; }

  const recipient = interaction.users.first();
  if (!recipient) { await interaction.reply({ content: "❌ Aucun utilisateur sélectionné.", ephemeral: true }); return; }
  if (recipient.id === interaction.user.id) { await interaction.reply({ content: "❌ Tu ne peux pas te donner à toi-même.", ephemeral: true }); return; }
  if (recipient.bot) { await interaction.reply({ content: "❌ Tu ne peux pas donner à un bot.", ephemeral: true }); return; }

  setPending(interaction.guild.id, interaction.user.id, { recipientId: recipient.id, recipientName: recipient.username });

  const modal = new ModalBuilder()
    .setCustomId("don_modal")
    .setTitle(`Don à ${recipient.username}`)
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("don_amount")
        .setLabel("Montant (🪙)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 100")
        .setRequired(true)
        .setMinLength(1).setMaxLength(10)
    ));
  await interaction.showModal(modal);
}

// ── Étape 3 : modale soumise → effectuer le don ───────────────────────────────
export async function handleDonModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guild) { await interaction.reply({ content: "❌ Erreur.", ephemeral: true }); return; }

  await interaction.deferReply({ ephemeral: true });

  const guildId  = interaction.guild.id;
  const donorId  = interaction.user.id;
  const pending_ = getPending(guildId, donorId);
  if (!pending_) { await interaction.editReply("❌ Session expirée. Recommence depuis le début."); return; }

  const raw    = interaction.fields.getTextInputValue("don_amount").trim();
  const amount = parseInt(raw);
  if (isNaN(amount) || amount <= 0) { await interaction.editReply("❌ Montant invalide."); return; }

  const balance = await getCoins(guildId, donorId);
  if (balance < amount) {
    await interaction.editReply(`❌ Pas assez de pièces ! Tu as **${balance.toLocaleString("fr-FR")} 🪙**, il te faut **${amount.toLocaleString("fr-FR")} 🪙**.`);
    return;
  }

  await addCoins(guildId, donorId, -amount);
  const recipientBalance = await addCoins(guildId, pending_.recipientId, amount);
  clearPending(guildId, donorId);

  const newBalance = await getCoins(guildId, donorId);

  await interaction.editReply({ embeds: [new EmbedBuilder()
    .setColor(0x57f287).setTitle("✅ Don effectué !")
    .setDescription(`Tu as donné **${amount.toLocaleString("fr-FR")} 🪙** à <@${pending_.recipientId}> !`)
    .addFields(
      { name: "💰 Ton solde restant",       value: `**${newBalance.toLocaleString("fr-FR")} 🪙**`,       inline: true },
      { name: "💰 Solde du destinataire",   value: `**${recipientBalance.toLocaleString("fr-FR")} 🪙**`, inline: true },
    )
    .setFooter({ text: "MAI•GESTION • Merci pour ta générosité !" })
    .setTimestamp()] });
}
