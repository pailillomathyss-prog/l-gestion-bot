import {
  Guild,
  TextChannel,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  UserSelectMenuInteraction,
  ModalSubmitInteraction,
  GuildMember,
} from "discord.js";
import { logger } from "../../lib/logger";
import { getCoins, addCoins } from "./db";

// ── State temporaire des donations en cours ───────────────────────────────────
interface PendingDonation {
  recipientId: string;
  recipientName: string;
  expiry: number;
}
const pending = new Map<string, PendingDonation>();
const PENDING_TTL = 5 * 60 * 1000; // 5 min

function pendingKey(guildId: string, donorId: string) {
  return `${guildId}:${donorId}`;
}

function setPending(guildId: string, donorId: string, data: Omit<PendingDonation, "expiry">) {
  pending.set(pendingKey(guildId, donorId), { ...data, expiry: Date.now() + PENDING_TTL });
}

function getPending(guildId: string, donorId: string): PendingDonation | null {
  const key = pendingKey(guildId, donorId);
  const d = pending.get(key);
  if (!d) return null;
  if (Date.now() > d.expiry) { pending.delete(key); return null; }
  return d;
}

function clearPending(guildId: string, donorId: string) {
  pending.delete(pendingKey(guildId, donorId));
}

// Nettoyage périodique
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pending) if (now > v.expiry) pending.delete(k);
}, 60_000);

// ── Helpers visuels ───────────────────────────────────────────────────────────

function buildPanelEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf0932b)
    .setTitle("💝 Système de don")
    .setDescription(
      "Partage tes pièces avec la communauté !\n\n" +
      "Clique sur **Faire un don** ci-dessous, choisis la personne et le montant."
    )
    .addFields(
      { name: "📌 Comment ça marche ?", value: "1️⃣ Clique sur **Faire un don**\n2️⃣ Sélectionne la personne\n3️⃣ Choisis le montant" },
      { name: "💡 Infos", value: "• Les pièces sont débitées immédiatement\n• Montant minimum : **1 🪙**\n• Tu dois avoir assez de pièces" },
    )
    .setFooter({ text: "MAI•GESTION • Sois généreux !" })
    .setTimestamp();
}

function buildPanelRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("donation_start")
      .setLabel("💝 Faire un don")
      .setStyle(ButtonStyle.Primary)
  );
}

function buildAmountButtons(recipientId: string): ActionRowBuilder<ButtonBuilder>[] {
  const amounts = [100, 250, 500, 1_000, 5_000];
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...amounts.map((a) =>
      new ButtonBuilder()
        .setCustomId(`donation_amount:${recipientId}:${a}`)
        .setLabel(`${a.toLocaleString("fr-FR")} 🪙`)
        .setStyle(ButtonStyle.Secondary)
    )
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`donation_custom:${recipientId}`)
      .setLabel("✏️ Montant personnalisé")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("donation_cancel")
      .setLabel("❌ Annuler")
      .setStyle(ButtonStyle.Danger)
  );
  return [row1, row2];
}

// ── Canal de dons ─────────────────────────────────────────────────────────────

function findDonationChannel(guild: Guild): TextChannel | null {
  return (guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      (c.name.toLowerCase().includes("don") || c.name.includes("🪙"))
  ) as TextChannel) ?? null;
}

export async function postDonationPanelIfNeeded(guild: Guild, botId: string): Promise<void> {
  const ch = findDonationChannel(guild);
  if (!ch) { logger.warn(`Salon dons introuvable sur ${guild.name}`); return; }

  try {
    const recent = await ch.messages.fetch({ limit: 20 });
    const already = recent.some(
      (m) => m.author.id === botId && m.embeds[0]?.title?.includes("don")
    );
    if (already) { logger.info(`Panneau dons déjà posté dans #${ch.name}`); return; }

    await ch.send({ embeds: [buildPanelEmbed()], components: [buildPanelRow()] });
    logger.info(`💝 Panneau dons posté dans #${ch.name}`);
  } catch (err) {
    logger.warn({ err }, `Impossible de poster le panneau dons dans #${ch.name}`);
  }
}

// ── Step 1 : clic sur "Faire un don" ─────────────────────────────────────────

export async function handleDonationStart(btn: ButtonInteraction): Promise<void> {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur serveur.", ephemeral: true }); return; }

  const balance = await getCoins(btn.guild.id, btn.user.id);

  const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId("donation_pick_user")
      .setPlaceholder("👤 Choisir le destinataire")
      .setMinValues(1)
      .setMaxValues(1)
  );

  await btn.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf0932b)
        .setTitle("💝 Qui veux-tu gifter ?")
        .setDescription("Sélectionne un membre ci-dessous.")
        .addFields({ name: "💰 Ton solde", value: `**${balance.toLocaleString("fr-FR")} 🪙**`, inline: true })
        .setFooter({ text: "MAI•GESTION • Expire dans 5 minutes" })
        .setTimestamp(),
    ],
    components: [row],
    ephemeral: true,
  });
}

// ── Step 2 : sélection du destinataire ───────────────────────────────────────

export async function handleDonationPickUser(interaction: UserSelectMenuInteraction): Promise<void> {
  if (!interaction.guild) { await interaction.reply({ content: "❌ Erreur.", ephemeral: true }); return; }

  const recipientId = interaction.values[0];
  if (recipientId === interaction.user.id) {
    await interaction.update({
      embeds: [new EmbedBuilder().setColor(0xff4444).setDescription("❌ Tu ne peux pas te faire un don à toi-même !")],
      components: [],
    });
    return;
  }

  const recipient = await interaction.guild.members.fetch(recipientId).catch(() => null);
  if (!recipient || recipient.user.bot) {
    await interaction.update({
      embeds: [new EmbedBuilder().setColor(0xff4444).setDescription("❌ Membre invalide ou bot.")],
      components: [],
    });
    return;
  }

  setPending(interaction.guild.id, interaction.user.id, {
    recipientId,
    recipientName: recipient.displayName,
  });

  const balance = await getCoins(interaction.guild.id, interaction.user.id);

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf0932b)
        .setTitle(`💝 Don à ${recipient.displayName}`)
        .setDescription("Combien de pièces veux-tu lui envoyer ?")
        .addFields({ name: "💰 Ton solde", value: `**${balance.toLocaleString("fr-FR")} 🪙**`, inline: true })
        .setThumbnail(recipient.user.displayAvatarURL())
        .setFooter({ text: "MAI•GESTION" })
        .setTimestamp(),
    ],
    components: buildAmountButtons(recipientId),
  });
}

// ── Step 3a : montant prédéfini ───────────────────────────────────────────────

export async function handleDonationAmount(btn: ButtonInteraction, recipientId: string, amount: number): Promise<void> {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }
  await executeDonation(btn, btn.guild.id, btn.user.id, recipientId, amount, true);
}

// ── Step 3b : montant personnalisé (ouvre modal) ──────────────────────────────

export async function handleDonationCustom(btn: ButtonInteraction, recipientId: string): Promise<void> {
  if (!btn.guild) { await btn.reply({ content: "❌ Erreur.", ephemeral: true }); return; }

  const pending_ = getPending(btn.guild.id, btn.user.id);
  if (!pending_) {
    await btn.update({
      embeds: [new EmbedBuilder().setColor(0xff4444).setDescription("❌ Session expirée. Recommence depuis le bouton 💝.")],
      components: [],
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`donation_modal:${recipientId}`)
    .setTitle("💝 Montant du don");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("donation_amount_input")
        .setLabel(`Pièces à envoyer à ${pending_.recipientName}`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("ex : 1500")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
    )
  );

  await btn.showModal(modal);
}

// ── Step 3c : modal soumis ────────────────────────────────────────────────────

export async function handleDonationModal(interaction: ModalSubmitInteraction, recipientId: string): Promise<void> {
  if (!interaction.guild) { await interaction.reply({ content: "❌ Erreur.", ephemeral: true }); return; }

  const raw = interaction.fields.getTextInputValue("donation_amount_input").trim().replace(/\s/g, "");
  const amount = parseInt(raw, 10);

  if (isNaN(amount) || amount <= 0) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444).setDescription("❌ Montant invalide. Saisis un nombre entier positif.")],
      ephemeral: true,
    });
    return;
  }

  await executeDonation(interaction, interaction.guild.id, interaction.user.id, recipientId, amount, false);
}

// ── Annuler ───────────────────────────────────────────────────────────────────

export async function handleDonationCancel(btn: ButtonInteraction): Promise<void> {
  if (btn.guild) clearPending(btn.guild.id, btn.user.id);
  await btn.update({
    embeds: [new EmbedBuilder().setColor(0x888888).setDescription("❌ Don annulé.")],
    components: [],
  });
}

// ── Exécution du don ──────────────────────────────────────────────────────────

async function executeDonation(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  guildId: string,
  donorId: string,
  recipientId: string,
  amount: number,
  isUpdate: boolean
): Promise<void> {
  clearPending(guildId, donorId);

  const guild = interaction.guild!;
  const balance = await getCoins(guildId, donorId);

  if (balance < amount) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Solde insuffisant")
      .setDescription(`Tu n'as que **${balance.toLocaleString("fr-FR")} 🪙** et tu veux en envoyer **${amount.toLocaleString("fr-FR")} 🪙**.`)
      .setFooter({ text: "MAI•GESTION" })
      .setTimestamp();

    if (isUpdate && interaction.isButton()) {
      await (interaction as ButtonInteraction).update({ embeds: [embed], components: [] });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    return;
  }

  const recipient = await guild.members.fetch(recipientId).catch(() => null) as GuildMember | null;
  if (!recipient) {
    const embed = new EmbedBuilder().setColor(0xff4444).setDescription("❌ Destinataire introuvable.");
    if (isUpdate && interaction.isButton()) {
      await (interaction as ButtonInteraction).update({ embeds: [embed], components: [] });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    return;
  }

  // Transfert
  await addCoins(guildId, donorId, -amount);
  await addCoins(guildId, recipientId, amount);

  const donorNewBalance = await getCoins(guildId, donorId);
  const recipientBalance = await getCoins(guildId, recipientId);

  const successEmbed = new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle("✅ Don envoyé !")
    .setDescription(`Tu as envoyé **${amount.toLocaleString("fr-FR")} 🪙** à **${recipient.displayName}** !`)
    .addFields(
      { name: "💸 Don effectué",    value: `**${amount.toLocaleString("fr-FR")} 🪙**`,         inline: true },
      { name: "💰 Ton nouveau solde", value: `**${donorNewBalance.toLocaleString("fr-FR")} 🪙**`, inline: true },
    )
    .setThumbnail(recipient.user.displayAvatarURL())
    .setFooter({ text: "MAI•GESTION" })
    .setTimestamp();

  if (isUpdate && interaction.isButton()) {
    await (interaction as ButtonInteraction).update({ embeds: [successEmbed], components: [] });
  } else {
    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
  }

  // Notification DM au destinataire
  const donor = await guild.members.fetch(donorId).catch(() => null);
  await recipient.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf0932b)
        .setTitle("💝 Tu as reçu un don !")
        .setDescription(`**${donor?.displayName ?? "Quelqu'un"}** t'a envoyé **${amount.toLocaleString("fr-FR")} 🪙** sur **${guild.name}** !`)
        .addFields({ name: "💰 Ton solde", value: `**${recipientBalance.toLocaleString("fr-FR")} 🪙**`, inline: true })
        .setFooter({ text: "MAI•GESTION" })
        .setTimestamp(),
    ],
  }).catch(() => {});

  // Annonce publique dans le canal dons
  const donCh = findDonationChannel(guild);
  if (donCh) {
    await donCh.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf0932b)
          .setDescription(`💝 <@${donorId}> vient de donner **${amount.toLocaleString("fr-FR")} 🪙** à <@${recipientId}> ! ❤️`)
          .setFooter({ text: "MAI•GESTION" })
          .setTimestamp(),
      ],
    }).catch(() => {});
  }

  logger.info(`💝 Don : ${donorId} → ${recipientId} (${amount} 🪙) sur ${guild.name}`);
}
