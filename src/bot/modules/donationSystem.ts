import {
  Guild, TextChannel, ChannelType, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle,
  ModalSubmitInteraction,
} from "discord.js";
import { logger } from "../../lib/logger.js";
import { getCoins, addCoins } from "./db.js";

export const DONATION_BTN = "donation_open";
export const DONATION_MODAL = "donation_modal";

function buildDonPanel(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle("❤️ Système de Dons")
    .setDescription(
      "Offre des pièces à quelqu'un que tu aimes !\n\n" +
      "Clique sur le bouton ci-dessous, indique l'ID du destinataire et le montant.\n\n" +
      "💡 Pour trouver l'ID d'un membre : clique droit sur son nom → Copier l'identifiant"
    )
    .setFooter({ text: "MAI•GESTION • Minimum : 1 🪙" })
    .setTimestamp();
}

function buildDonComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(DONATION_BTN)
      .setLabel("💝 Faire un don")
      .setStyle(ButtonStyle.Danger),
  )];
}

export async function postDonationPanelIfNeeded(guild: Guild, botId: string) {
  const donCh = guild.channels.cache.find(
    ch => ch.type === ChannelType.GuildText &&
      (ch.name.toLowerCase().includes("don") || ch.name.includes("❤️"))
  ) as TextChannel | undefined;

  if (!donCh) return;

  const recent = await donCh.messages.fetch({ limit: 10 }).catch(() => null);
  if (recent?.some(m => m.author.id === botId && m.embeds[0]?.title?.includes("Dons"))) return;

  await donCh.send({ embeds: [buildDonPanel()], components: buildDonComponents() }).catch(err =>
    logger.warn({ err }, "Impossible de poster le panel de dons")
  );
  logger.info(`❤️ Panel de dons posté dans #${donCh.name}`);
}

export async function handleDonationButton(btn: ButtonInteraction) {
  const modal = new ModalBuilder()
    .setCustomId(DONATION_MODAL)
    .setTitle("💝 Faire un don");

  const recipientInput = new TextInputBuilder()
    .setCustomId("donation_recipient")
    .setLabel("ID du destinataire")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: 123456789012345678")
    .setRequired(true)
    .setMinLength(15)
    .setMaxLength(25);

  const amountInput = new TextInputBuilder()
    .setCustomId("donation_amount")
    .setLabel("Montant (🪙 pièces)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: 500")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(10);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(recipientInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput),
  );

  await btn.showModal(modal);
}

export async function handleDonationModal(modal: ModalSubmitInteraction) {
  if (!modal.guild) { await modal.reply({ content: "❌ Erreur.", ephemeral: true }); return; }

  const recipientId = modal.fields.getTextInputValue("donation_recipient").trim().replace(/[<@>]/g, "");
  const amountStr = modal.fields.getTextInputValue("donation_amount").trim();
  const amount = parseInt(amountStr);

  if (isNaN(amount) || amount < 1) {
    await modal.reply({ content: "❌ Montant invalide. Minimum : **1 🪙**", ephemeral: true });
    return;
  }

  if (recipientId === modal.user.id) {
    await modal.reply({ content: "❌ Tu ne peux pas te faire un don à toi-même !", ephemeral: true });
    return;
  }

  const recipient = await modal.guild.members.fetch(recipientId).catch(() => null);
  if (!recipient || recipient.user.bot) {
    await modal.reply({ content: "❌ Membre introuvable. Vérifie l'ID saisi.", ephemeral: true });
    return;
  }

  const senderBalance = await getCoins(modal.guild.id, modal.user.id);
  if (senderBalance < amount) {
    await modal.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle("❌ Solde insuffisant")
          .setDescription(`Il te faut **${amount} 🪙** mais tu n'as que **${senderBalance} 🪙**.`)
          .setFooter({ text: "MAI•GESTION" }).setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  await addCoins(modal.guild.id, modal.user.id, -amount);
  const newRecipientBalance = await addCoins(modal.guild.id, recipientId, amount);
  const newSenderBalance = await getCoins(modal.guild.id, modal.user.id);

  const embed = new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle("❤️ Don effectué !")
    .setDescription(`**${modal.user.displayName}** a offert **${amount} 🪙** à **${recipient.displayName}** !`)
    .addFields(
      { name: "💰 Ton nouveau solde", value: `**${newSenderBalance} 🪙**`, inline: true },
      { name: "💰 Solde du destinataire", value: `**${newRecipientBalance} 🪙**`, inline: true },
    )
    .setFooter({ text: "MAI•GESTION" }).setTimestamp();

  await modal.reply({ embeds: [embed] });
  logger.info(`❤️ Don: ${modal.user.id} → ${recipientId} (${amount} 🪙)`);
}
