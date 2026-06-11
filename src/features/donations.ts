import {
  Guild, TextChannel, ChannelType, EmbedBuilder, GuildMember,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
  ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction,
} from "discord.js";
import { getUser, saveUser } from "../db.js";

export const DON_BTN   = "don_open";
export const DON_MODAL = "don_modal";

// ── Panel ❤️・dons ────────────────────────────────────────────────────────────
export async function postDonPanelIfNeeded(guild: Guild, botId: string) {
  const ch = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText &&
    (c.name.includes("❤️") || c.name.toLowerCase().includes("don"))
  ) as TextChannel | undefined;
  if (!ch) return;

  const recent = await ch.messages.fetch({ limit: 10 }).catch(() => null);
  if (recent?.some(m => m.author.id === botId && m.embeds[0]?.title?.includes("Dons"))) return;

  await ch.send({
    embeds: [new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle("❤️ Système de Dons")
      .setDescription(
        "Offre des 🪙 pièces à un membre !\n\n" +
        "**Comment ça marche ?**\n" +
        "1. Clique sur **💝 Faire un don**\n" +
        "2. Entre l'**ID du destinataire** et le **montant**\n" +
        "3. Confirme — transfert immédiat !\n\n" +
        "💡 *Pour copier un ID : Paramètres → Avancé → Mode développeur ON,\npuis clic droit sur un membre → Copier l'identifiant.*"
      )
      .setFooter({ text: "MAI•GESTION • Minimum : 1🪙" })
      .setTimestamp()],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(DON_BTN)
          .setLabel("💝 Faire un don")
          .setStyle(ButtonStyle.Danger)
      ),
    ],
  }).catch(() => {});
  console.log(`❤️ Panel dons → #${ch.name}`);
}

// ── Bouton → ouvre le modal ──────────────────────────────────────────────────
export async function handleDonButton(btn: ButtonInteraction) {
  const modal = new ModalBuilder()
    .setCustomId(DON_MODAL)
    .setTitle("💝 Faire un don");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("don_recipient")
        .setLabel("ID du destinataire")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 123456789012345678")
        .setRequired(true)
        .setMinLength(15)
        .setMaxLength(25)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("don_amount")
        .setLabel("Montant (🪙 pièces)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 500")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
    ),
  );

  await btn.showModal(modal);
}

// ── Soumission du modal ───────────────────────────────────────────────────────
export async function handleDonModal(modal: ModalSubmitInteraction) {
  // Defer immédiatement — les fetches guild/DB peuvent prendre > 3s
  await modal.deferReply({ ephemeral: true });

  if (!modal.guild) {
    await modal.editReply({ content: "❌ Cette commande ne fonctionne qu'en serveur." });
    return;
  }

  // Validation de l'ID
  const raw = modal.fields.getTextInputValue("don_recipient").trim();
  const rid = raw.replace(/[<@!>]/g, "");
  if (!/^\d{15,20}$/.test(rid)) {
    await modal.editReply({ content: "❌ ID invalide. Active le **mode développeur** et fais un clic droit → *Copier l'identifiant*." });
    return;
  }

  // Validation du montant
  const amount = parseInt(modal.fields.getTextInputValue("don_amount").trim(), 10);
  if (isNaN(amount) || amount < 1) {
    await modal.editReply({ content: "❌ Montant invalide (minimum **1🪙**)." });
    return;
  }

  // Pas à soi-même
  if (rid === modal.user.id) {
    await modal.editReply({ content: "❌ Tu ne peux pas te faire un don à toi-même !" });
    return;
  }

  // Récupérer le destinataire
  const recipient = await modal.guild.members.fetch(rid).catch(() => null) as GuildMember | null;
  if (!recipient || recipient.user.bot) {
    await modal.editReply({ content: "❌ Membre introuvable ou invalide. Vérifie l'ID et assure-toi qu'il est bien sur ce serveur." });
    return;
  }

  // Vérifier le solde de l'expéditeur
  const sData = await getUser(modal.guild.id, modal.user.id);
  if (sData.coins < amount) {
    await modal.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle("❌ Solde insuffisant")
        .setDescription(`Il te faut **${amount.toLocaleString("fr-FR")}🪙** mais tu n'as que **${sData.coins.toLocaleString("fr-FR")}🪙**.`)
        .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
    });
    return;
  }

  // Effectuer le transfert
  const rData = await getUser(modal.guild.id, rid);
  await saveUser(modal.guild.id, modal.user.id, { ...sData, coins: sData.coins - amount });
  await saveUser(modal.guild.id, rid, { ...rData, coins: rData.coins + amount });

  // Réponse succès (éphémère)
  await modal.editReply({
    embeds: [new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle("❤️ Don effectué !")
      .setDescription(`Tu as offert **${amount.toLocaleString("fr-FR")}🪙** à **${recipient.displayName}** ! 💝`)
      .addFields(
        { name: "💰 Ton nouveau solde",   value: `**${(sData.coins - amount).toLocaleString("fr-FR")}🪙**`, inline: true },
        { name: "💰 Solde destinataire",  value: `**${(rData.coins + amount).toLocaleString("fr-FR")}🪙**`, inline: true },
      )
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
  });

  // Annonce publique dans ❤️・dons
  const donCh = modal.guild.channels.cache.find(
    c => c.type === ChannelType.GuildText &&
    (c.name.includes("❤️") || c.name.toLowerCase().includes("don"))
  ) as TextChannel | undefined;
  if (donCh) {
    await donCh.send({
      embeds: [new EmbedBuilder()
        .setColor(0xff6b6b)
        .setDescription(`❤️ **${modal.user.displayName}** vient d'offrir **${amount.toLocaleString("fr-FR")}🪙** à **${recipient.displayName}** ! 💝`)
        .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
    }).catch(() => {});
  }
}
