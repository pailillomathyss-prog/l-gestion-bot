import {
  Guild, TextChannel, ChannelType, EmbedBuilder, GuildMember,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
  ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction,
} from "discord.js";
import { getUser, saveUser } from "../db.js";

export const DON_BTN   = "don_open";
export const DON_MODAL = "don_modal";

export async function postDonPanelIfNeeded(guild:Guild, botId:string) {
  const ch=guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&(c.name.includes("❤️")||c.name.toLowerCase().includes("don"))) as TextChannel|undefined;
  if(!ch) return;
  const recent=await ch.messages.fetch({limit:10}).catch(()=>null);
  if(recent?.some(m=>m.author.id===botId&&m.embeds[0]?.title?.includes("Dons"))) return;
  await ch.send({
    embeds:[new EmbedBuilder().setColor(0xff6b6b).setTitle("❤️ Système de Dons")
      .setDescription("Offre des pièces à un membre !\n\n1. Clique sur **Faire un don** 💝\n2. Entre l'**ID** du destinataire et le **montant**\n3. Confirme — transfert immédiat !\n\n💡 Mode développeur ON → clic droit sur un membre → **Copier l'identifiant**")
      .setFooter({text:"MAI•GESTION • Minimum : 1🪙"}).setTimestamp()],
    components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(DON_BTN).setLabel("💝 Faire un don").setStyle(ButtonStyle.Danger))],
  }).catch(()=>{});
  console.log(`❤️ Panel dons → #${ch.name}`);
}

export async function handleDonButton(btn:ButtonInteraction) {
  const modal=new ModalBuilder().setCustomId(DON_MODAL).setTitle("💝 Faire un don");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("don_recipient").setLabel("ID du destinataire").setStyle(TextInputStyle.Short).setPlaceholder("Ex: 123456789012345678").setRequired(true).setMinLength(15).setMaxLength(25)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("don_amount").setLabel("Montant (🪙 pièces)").setStyle(TextInputStyle.Short).setPlaceholder("Ex: 500").setRequired(true).setMinLength(1).setMaxLength(10)),
  );
  await btn.showModal(modal);
}

export async function handleDonModal(modal:ModalSubmitInteraction) {
  if(!modal.guild){await modal.reply({content:"❌ Erreur.",ephemeral:true});return;}
  const rid=modal.fields.getTextInputValue("don_recipient").trim().replace(/[<@>]/g,"");
  const amount=parseInt(modal.fields.getTextInputValue("don_amount").trim());
  if(isNaN(amount)||amount<1){await modal.reply({content:"❌ Montant invalide (minimum 1🪙).",ephemeral:true});return;}
  if(rid===modal.user.id){await modal.reply({content:"❌ Tu ne peux pas te donner des pièces à toi-même !",ephemeral:true});return;}
  const recipient=await modal.guild.members.fetch(rid).catch(()=>null) as GuildMember|null;
  if(!recipient||recipient.user.bot){await modal.reply({content:"❌ Membre introuvable. Vérifie l'ID.",ephemeral:true});return;}
  const sData=await getUser(modal.guild.id,modal.user.id);
  if(sData.coins<amount){await modal.reply({embeds:[new EmbedBuilder().setColor(0xff4444).setTitle("❌ Solde insuffisant").setDescription(`Tu as **${sData.coins}🪙** / besoin de **${amount}🪙**`).setFooter({text:"MAI•GESTION"}).setTimestamp()],ephemeral:true});return;}
  const rData=await getUser(modal.guild.id,rid);
  await saveUser(modal.guild.id,modal.user.id,{...sData,coins:sData.coins-amount});
  await saveUser(modal.guild.id,rid,{...rData,coins:rData.coins+amount});
  await modal.reply({embeds:[new EmbedBuilder().setColor(0xff6b6b).setTitle("❤️ Don effectué !").setDescription(`**${modal.user.displayName}** a offert **${amount}🪙** à **${recipient.displayName}** ! 💝`)
    .addFields({name:"💰 Ton solde",value:`**${(sData.coins-amount).toLocaleString("fr-FR")}🪙**`,inline:true},{name:"💰 Solde destinataire",value:`**${(rData.coins+amount).toLocaleString("fr-FR")}🪙**`,inline:true})
    .setFooter({text:"MAI•GESTION"}).setTimestamp()]});
}
