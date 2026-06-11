import {
  Guild, TextChannel, ChannelType, EmbedBuilder, GuildMember,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
} from "discord.js";
import { getUser, saveUser } from "../db.js";
import { xpToLevel } from "./xp.js";

const SHOP_ROLES = [
  {id:"aventurier",   name:"🌴 Aventurier",    price:500,   color:0x2ecc71, desc:"Rôle shop I"},
  {id:"jungler",      name:"⛰️ Roi2laJungle",  price:2500,  color:0x27ae60, desc:"Rôle shop II"},
  {id:"perturbateur", name:"🎠 Perturbateur",  price:8000,  color:0xe67e22, desc:"Rôle shop III"},
  {id:"monarch",      name:"💎 Roi2Monarch",   price:20000, color:0x3498db, desc:"Rôle shop IV"},
] as const;

const SHOP_XP = [
  {id:"xp_s",label:"+250 XP",  price:100,  xp:250  },
  {id:"xp_m",label:"+1000 XP", price:350,  xp:1000 },
  {id:"xp_l",label:"+5000 XP", price:1500, xp:5000 },
] as const;

export async function postShopIfNeeded(guild:Guild, botId:string) {
  const ch=guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&(c.name.includes("shop")||c.name.includes("boutique")||c.name.includes("🧸"))) as TextChannel|undefined;
  if(!ch) return;
  const recent=await ch.messages.fetch({limit:10}).catch(()=>null);
  if(recent?.some(m=>m.author.id===botId&&m.embeds[0]?.title?.includes("Boutique"))) return;
  await ch.send({
    embeds:[new EmbedBuilder().setColor(0x9b59b6).setTitle("🧸 Boutique MAI•GESTION")
      .setDescription("Échange tes 🪙 contre des rôles exclusifs ou de l'XP !")
      .addFields(
        {name:"🎭 Rôles",  value:SHOP_ROLES.map(r=>`**${r.name}** — ${r.price.toLocaleString("fr-FR")}🪙`).join("\n")},
        {name:"⭐ XP",    value:SHOP_XP.map(x=>`**${x.label}** — ${x.price}🪙`).join("\n")},
        {name:"💡 Gagner",value:"Messages : 10–20🪙/min | Vocal : 15🪙/5min | `!daily` : 50–300🪙"},
      )
      .setFooter({text:"MAI•GESTION • Utilise les boutons !"}).setTimestamp()],
    components:[
      new ActionRowBuilder<ButtonBuilder>().addComponents(SHOP_ROLES.map(r=>new ButtonBuilder().setCustomId(`shop_r_${r.id}`).setLabel(`${r.name} ${r.price}🪙`).setStyle(ButtonStyle.Primary))),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...SHOP_XP.map(x=>new ButtonBuilder().setCustomId(`shop_x_${x.id}`).setLabel(`${x.label} — ${x.price}🪙`).setStyle(ButtonStyle.Success)),
        new ButtonBuilder().setCustomId("shop_balance").setLabel("💰 Mon solde").setStyle(ButtonStyle.Secondary),
      ),
    ],
  }).catch(()=>{});
  console.log(`🧸 Shop → #${ch.name}`);
}

export async function handleShopButton(btn:ButtonInteraction) {
  if(!btn.guild){await btn.reply({content:"❌ Erreur.",ephemeral:true});return;}
  const data=await getUser(btn.guild.id,btn.user.id);

  if(btn.customId==="shop_balance"){
    await btn.reply({embeds:[new EmbedBuilder().setColor(0xffd700).setTitle("💰 Ton solde").setDescription(`**${data.coins.toLocaleString("fr-FR")}🪙**`).setFooter({text:"MAI•GESTION"}).setTimestamp()],ephemeral:true});return;
  }
  if(btn.customId.startsWith("shop_r_")){
    const rid=btn.customId.replace("shop_r_","");
    const sr=SHOP_ROLES.find(r=>r.id===rid);
    if(!sr){await btn.reply({content:"❌ Rôle introuvable.",ephemeral:true});return;}
    const member=await btn.guild.members.fetch(btn.user.id).catch(()=>null) as GuildMember|null;
    if(!member){await btn.reply({content:"❌ Erreur.",ephemeral:true});return;}
    if(member.roles.cache.some(r=>r.name===sr.name)){await btn.reply({content:`❌ Tu possèdes déjà **${sr.name}** !`,ephemeral:true});return;}
    if(data.coins<sr.price){await btn.reply({embeds:[new EmbedBuilder().setColor(0xff4444).setTitle("❌ Solde insuffisant").setDescription(`Besoin : **${sr.price.toLocaleString("fr-FR")}🪙** | Tu as : **${data.coins.toLocaleString("fr-FR")}🪙**`).setFooter({text:"MAI•GESTION"}).setTimestamp()],ephemeral:true});return;}
    let role=btn.guild.roles.cache.find(r=>r.name===sr.name);
    if(!role) role=await btn.guild.roles.create({name:sr.name,color:sr.color,permissions:[],reason:"MAI•GESTION shop"}).catch(()=>undefined);
    if(!role){await btn.reply({content:"❌ Impossible de créer le rôle.",ephemeral:true});return;}
    await saveUser(btn.guild.id,btn.user.id,{...data,coins:data.coins-sr.price});
    await member.roles.add(role).catch(()=>{});
    await btn.reply({embeds:[new EmbedBuilder().setColor(0x00cc66).setTitle("✅ Achat réussi !").setDescription(`Rôle **${sr.name}** obtenu !\nSolde : **${(data.coins-sr.price).toLocaleString("fr-FR")}🪙**`).setFooter({text:"MAI•GESTION"}).setTimestamp()],ephemeral:true});return;
  }
  if(btn.customId.startsWith("shop_x_")){
    const xid=btn.customId.replace("shop_x_","");
    const xi=SHOP_XP.find(x=>x.id===xid);
    if(!xi){await btn.reply({content:"❌ Article introuvable.",ephemeral:true});return;}
    if(data.coins<xi.price){await btn.reply({content:`❌ Solde insuffisant : **${data.coins}🪙** / **${xi.price}🪙** requis.`,ephemeral:true});return;}
    const newXP=data.xp+xi.xp;
    await saveUser(btn.guild.id,btn.user.id,{...data,xp:newXP,level:xpToLevel(newXP),coins:data.coins-xi.price});
    await btn.reply({embeds:[new EmbedBuilder().setColor(0x00cc66).setTitle("⭐ XP achetée !").setDescription(`**+${xi.xp} XP** pour **${xi.price}🪙**\nSolde : **${(data.coins-xi.price).toLocaleString("fr-FR")}🪙**`).setFooter({text:"MAI•GESTION"}).setTimestamp()],ephemeral:true});
  }
}
