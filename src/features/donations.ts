import {
  Guild, TextChannel, ChannelType, EmbedBuilder, GuildMember,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
  ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction,
} from "discord.js";
import { getUser, saveUser } from "../db.js";

export const DON_BTN   = "don_open";
export const DON_MODAL = "don_modal";

// ── Panel ❤️・dons ────────────────────────────────────────────────────────────
export async function postDonPanelIfNeeded(guild:Guild, botId:string) {
  const ch = guild.channels.cache.find(
    c=>c.type===ChannelType.GuildText&&(c.name.includes("❤️")||c.name.toLowerCase().includes("don"))
  ) as TextChannel|undefined;
  if (!ch) return;
  const recent = await ch.messages.fetch({limit:10}).catch(()=>null);
  if (recent?.some(m=>m.author.id===botId&&m.embeds[0]?.title?.includes("Dons"))) return;
  await ch.send({
    embeds:[new EmbedBuilder().setColor(0xff6b6b).setTitle("❤️ Système de Dons")
      .setDescription(
        "Offre des 🪙 pièces à un autre membre !\n\n"+
        "**Comment faire ?**\n"+
        "1. Clique sur **💝 Faire un don**\n"+
        "2. Entre l'**ID** du destinataire et le **montant**\n"+
        "3. Le transfert est immédiat !\n\n"+
        "💡 *Mode développeur ON → clic droit sur un membre → Copier l'identifiant*"
      )
      .setFooter({text:"MAI•GESTION • Minimum 1🪙"}).setTimestamp()],
    components:[new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(DON_BTN).setLabel("💝 Faire un don").setStyle(ButtonStyle.Danger)
    )],
  }).catch(()=>{});
  console.log(`❤️ Panel dons → #${ch.name}`);
}

// ── Bouton → modal (showModal n'a pas de timeout) ─────────────────────────────
export async function handleDonButton(btn:ButtonInteraction) {
  const modal = new ModalBuilder().setCustomId(DON_MODAL).setTitle("💝 Faire un don");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("don_recipient").setLabel("ID Discord du destinataire")
        .setStyle(TextInputStyle.Short).setPlaceholder("Ex: 123456789012345678")
        .setRequired(true).setMinLength(15).setMaxLength(20)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("don_amount").setLabel("Montant (🪙 pièces)")
        .setStyle(TextInputStyle.Short).setPlaceholder("Ex: 500")
        .setRequired(true).setMinLength(1).setMaxLength(10)
    ),
  );
  // showModal est sa propre réponse — pas de deferReply, pas de timeout
  await btn.showModal(modal);
}

// ── Soumission du modal ───────────────────────────────────────────────────────
export async function handleDonModal(modal:ModalSubmitInteraction) {
  if (!modal.guild) {
    await modal.reply({content:"❌ Commande serveur uniquement.",ephemeral:true}); return;
  }

  // Valider les champs AVANT tout appel async
  const raw    = modal.fields.getTextInputValue("don_recipient").trim().replace(/[<@!>]/g,"");
  const amount = parseInt(modal.fields.getTextInputValue("don_amount").trim(),10);

  if (!/^\d{15,20}$/.test(raw)) {
    await modal.reply({content:"❌ ID invalide. Active le **mode développeur** et copie l'identifiant en faisant un clic droit sur le membre.",ephemeral:true}); return;
  }
  if (isNaN(amount)||amount<1) {
    await modal.reply({content:"❌ Montant invalide (minimum **1🪙**).",ephemeral:true}); return;
  }
  if (raw===modal.user.id) {
    await modal.reply({content:"❌ Tu ne peux pas te faire un don à toi-même !",ephemeral:true}); return;
  }

  // deferReply + fetch membre + getUser EN PARALLÈLE
  const [, recipient, sData] = await Promise.all([
    modal.deferReply({ephemeral:true}),
    modal.guild.members.fetch(raw).catch(()=>null) as Promise<GuildMember|null>,
    getUser(modal.guild.id, modal.user.id),
  ]);

  if (!recipient||recipient.user.bot) {
    await modal.editReply({content:"❌ Membre introuvable. Vérifie l'ID et assure-toi qu'il est sur ce serveur."}); return;
  }
  if (sData.coins<amount) {
    await modal.editReply({embeds:[new EmbedBuilder().setColor(0xff4444).setTitle("❌ Solde insuffisant")
      .setDescription(`Il te faut **${amount.toLocaleString("fr-FR")}🪙**\nTu as **${sData.coins.toLocaleString("fr-FR")}🪙**\nManque : **${(amount-sData.coins).toLocaleString("fr-FR")}🪙**`)
      .setFooter({text:"MAI•GESTION"}).setTimestamp()]}); return;
  }

  // Transfert
  const rData = await getUser(modal.guild.id, raw);
  await Promise.all([
    saveUser(modal.guild.id, modal.user.id, {...sData, coins:sData.coins-amount}),
    saveUser(modal.guild.id, raw,            {...rData, coins:rData.coins+amount}),
  ]);

  // Réponse éphémère de confirmation
  await modal.editReply({embeds:[new EmbedBuilder().setColor(0xff6b6b).setTitle("❤️ Don effectué !")
    .setDescription(`Tu as offert **${amount.toLocaleString("fr-FR")}🪙** à **${recipient.displayName}** ! 💝`)
    .addFields(
      {name:"💰 Ton solde",       value:`**${(sData.coins-amount).toLocaleString("fr-FR")}🪙**`,inline:true},
      {name:"💰 Solde destinataire",value:`**${(rData.coins+amount).toLocaleString("fr-FR")}🪙**`,inline:true},
    ).setFooter({text:"MAI•GESTION"}).setTimestamp()]});

  // Annonce publique dans le salon dons
  const donCh = modal.guild.channels.cache.find(
    c=>c.type===ChannelType.GuildText&&(c.name.includes("❤️")||c.name.toLowerCase().includes("don"))
  ) as TextChannel|undefined;
  if (donCh) await donCh.send({embeds:[new EmbedBuilder().setColor(0xff6b6b)
    .setDescription(`❤️ **${modal.user.displayName}** a offert **${amount.toLocaleString("fr-FR")}🪙** à **${recipient.displayName}** ! 💝`)
    .setFooter({text:"MAI•GESTION"}).setTimestamp()]}).catch(()=>{});
}
