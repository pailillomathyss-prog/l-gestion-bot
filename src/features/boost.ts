import { GuildMember, EmbedBuilder, ChannelType, TextChannel } from "discord.js";
function boostCh(guild:import("discord.js").Guild):TextChannel|null{
  return guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&(c.name.includes("💎")||c.name.toLowerCase().includes("boost"))) as TextChannel|null??null;
}
export async function handleBoost(o:GuildMember,n:GuildMember){
  if(!o.premiumSince&&n.premiumSince){
    const ch=boostCh(n.guild); if(!ch) return;
    await ch.send({embeds:[new EmbedBuilder().setColor(0xff73fa).setTitle("💎 Nouveau Boost !").setDescription(`**${n.displayName}** vient de booster le serveur ! 🚀\nMerci pour ton soutien ! 💜`).setThumbnail(n.user.displayAvatarURL()).addFields({name:"Total",value:`**${n.guild.premiumSubscriptionCount??0}💎**`,inline:true}).setFooter({text:"MAI•GESTION"}).setTimestamp()]}).catch(()=>{});
  } else if(o.premiumSince&&!n.premiumSince){
    const ch=boostCh(n.guild); if(!ch) return;
    await ch.send({embeds:[new EmbedBuilder().setColor(0x999999).setDescription(`💔 **${n.displayName}** n'est plus booster. Merci pour ton soutien ! 🙏`).setFooter({text:"MAI•GESTION"}).setTimestamp()]}).catch(()=>{});
  }
}
