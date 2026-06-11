import { Message, PermissionFlagsBits, EmbedBuilder, GuildMember } from "discord.js";
const LINK = /(?:https?:\/\/|www\.|discord\.gg\/)[^\s]+/gi;
function reset(){LINK.lastIndex=0;}
export async function checkAntiLink(msg:Message):Promise<boolean> {
  if(!msg.guild||!msg.member) return false;
  const m=msg.member as GuildMember;
  if(m.permissions.has(PermissionFlagsBits.Administrator)||m.permissions.has(PermissionFlagsBits.ManageMessages)) return false;
  reset(); if(!LINK.test(msg.content)) return false;
  await msg.delete().catch(()=>{});
  const w=await msg.channel.send({embeds:[new EmbedBuilder().setColor(0xff4444).setTitle("🔗 Lien non autorisé").setDescription(`${m}, les liens ne sont pas autorisés. Contacte un admin si nécessaire.`).setFooter({text:"MAI•GESTION"}).setTimestamp()]}).catch(()=>null);
  if(w) setTimeout(()=>w.delete().catch(()=>{}),8000);
  return true;
}
