import {
  Guild, GuildMember, TextChannel, ChannelType,
  EmbedBuilder, PermissionFlagsBits, CategoryChannel,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
  UserSelectMenuBuilder, UserSelectMenuInteraction,
} from "discord.js";
import { getUser, saveUser } from "../db.js";

// ── Gacha roles ───────────────────────────────────────────────────────────────
const GACHA_ROLES = [
  { name:"🎀 Commun",    color:0x95a5a6, weight:300, rarity:"Commun",     emoji:"🎀" },
  { name:"🌿 Nature",    color:0x27ae60, weight:250, rarity:"Commun",     emoji:"🌿" },
  { name:"⚡ Éclair",    color:0x3498db, weight:140, rarity:"Peu Commun", emoji:"⚡" },
  { name:"🌸 Sakura",    color:0xff69b4, weight:110, rarity:"Peu Commun", emoji:"🌸" },
  { name:"💜 Mystère",   color:0x9b59b6, weight:70,  rarity:"Rare",       emoji:"💜" },
  { name:"🔥 Flamme",    color:0xe67e22, weight:50,  rarity:"Rare",       emoji:"🔥" },
  { name:"💎 Diamant",   color:0x00bcd4, weight:35,  rarity:"Épique",     emoji:"💎" },
  { name:"🌟 Étoile",    color:0xffd700, weight:25,  rarity:"Épique",     emoji:"🌟" },
  { name:"👑 Couronne",  color:0xdaa520, weight:12,  rarity:"Légendaire", emoji:"👑" },
  { name:"🌌 Galaxie",   color:0x7b2d8b, weight:6,   rarity:"Légendaire", emoji:"🌌" },
  { name:"⚜️ Mythique", color:0xe74c3c, weight:2,   rarity:"Mythique",   emoji:"⚜️" },
] as const;

const GACHA_TOTAL = GACHA_ROLES.reduce((s, r) => s + r.weight, 0);
const GACHA_PRICE = 150;
const RARITY_COLOR: Record<string,number> = {
  Commun:0x95a5a6,"Peu Commun":0x2ecc71,Rare:0x9b59b6,
  Épique:0x00bcd4,Légendaire:0xffd700,Mythique:0xe74c3c,
};
function pickGacha() {
  let r = Math.random() * GACHA_TOTAL;
  for (const x of GACHA_ROLES) { r -= x.weight; if (r <= 0) return x; }
  return GACHA_ROLES[0];
}

// ── Pending duels ─────────────────────────────────────────────────────────────
const duels = new Map<string, { challengerId:string; bet:number }>();

// ── Temp game channel (best-effort — bot must have Manage Channels) ────────────
const GAME_CAT = "🎮 Parties en Cours";

async function tryOpenGameChannel(guild:Guild, game:string, ...userIds:string[]): Promise<TextChannel|null> {
  try {
    let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === GAME_CAT) as CategoryChannel|undefined;
    if (!cat) {
      cat = await guild.channels.create({
        name: GAME_CAT, type: ChannelType.GuildCategory,
        permissionOverwrites: [{ id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] }],
        reason: "MAI•GESTION",
      }) as CategoryChannel;
    }
    const mem = guild.members.cache.get(userIds[0]!);
    const slug = `${game}-${mem?.user.username ?? userIds[0]!}`.toLowerCase().replace(/[^a-z0-9-]/g,"").slice(0,90);
    const ch = await guild.channels.create({
      name: slug, type: ChannelType.GuildText, parent: cat.id,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        ...userIds.map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
      ],
      reason: "MAI•GESTION partie",
    }) as TextChannel;
    return ch;
  } catch { return null; }
}

function closeAfter(ch:TextChannel, ms:number) {
  setTimeout(async () => {
    await ch.send({ embeds:[new EmbedBuilder().setColor(0x888888).setDescription("🔒 Salon fermé automatiquement.").setFooter({text:"MAI•GESTION"}).setTimestamp()] }).catch(()=>{});
    await new Promise(r => setTimeout(r, 3000));
    await ch.delete("MAI•GESTION — fin de partie").catch(()=>{});
  }, ms);
}

// ── Panel jeux ────────────────────────────────────────────────────────────────
export async function postGamePanelIfNeeded(guild:Guild, botId:string) {
  const ch = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText && (c.name.includes("jeux") || c.name.includes("👾"))
  ) as TextChannel|undefined;
  if (!ch) return;
  const recent = await ch.messages.fetch({ limit:15 }).catch(() => null);
  if (recent?.some(m => m.author.id === botId && m.embeds[0]?.title?.includes("Jeux"))) return;
  await ch.send({
    embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle("👾 Jeux — Casino & Fun")
      .setDescription("**Mise tes 🪙 et tente ta chance !**\nUtilise les boutons ci-dessous pour jouer.")
      .addFields(
        { name:"🪙 Coin Flip",   value:"Pile ou face — 50/50",                       inline:false },
        { name:"🎰 Slots",       value:"Machine à sous — jusqu'à **×20** !",         inline:false },
        { name:"🃏 Blackjack",   value:"21 contre le croupier → mise ×2",            inline:false },
        { name:"🎲 Duel 1v1",    value:"Défie un membre — le gagnant emporte tout !", inline:false },
        { name:`🎁 Gacha (${GACHA_PRICE}🪙)`, value:"Tire un rôle parmi 11, 6 raretés !", inline:false },
      )
      .setFooter({ text:"MAI•GESTION • Mise min. 10🪙" }).setTimestamp()],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("g_flip_10").setLabel("🪙 Flip 10").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("g_flip_50").setLabel("🪙 Flip 50").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("g_flip_100").setLabel("🪙 Flip 100").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("g_flip_500").setLabel("🪙 Flip 500").setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("g_slot_50").setLabel("🎰 Slot 50").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("g_slot_200").setLabel("🎰 Slot 200").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("g_bj_100").setLabel("🃏 BJ 100").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("g_bj_500").setLabel("🃏 BJ 500").setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("g_duel_50").setLabel("🎲 Duel 50").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("g_duel_200").setLabel("🎲 Duel 200").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("g_gacha").setLabel(`🎁 Gacha ${GACHA_PRICE}🪙`).setStyle(ButtonStyle.Primary),
      ),
    ],
  }).catch(() => {});
  console.log(`👾 Panel jeux → #${ch.name}`);
}

// ── Règles jeux dans 📩・regles ───────────────────────────────────────────────
export async function postGameRulesIfNeeded(guild:Guild, botId:string) {
  const ch = guild.channels.cache.find(c => {
    if (c.type !== ChannelType.GuildText) return false;
    const n = c.name.toLowerCase();
    if (c.name.includes("📩")) return true;
    if ((n.includes("regles") || n.includes("règles")) && !n.includes("lement") && !n.includes("serveur")) return true;
    return false;
  }) as TextChannel|undefined;
  if (!ch) return;
  const recent = await ch.messages.fetch({ limit:10 }).catch(() => null);
  if (recent?.some(m => m.author.id === botId && m.embeds.length > 0)) return;
  await ch.send({ embeds:[new EmbedBuilder().setColor(0x2f3136).setTitle("📜 Règles des Jeux — MAI•GESTION")
    .addFields(
      { name:"💰 Pièces",    value:"• Messages : 10–20🪙/min\n• Vocal : 15🪙/5min\n• `!daily` : 50–300🪙" },
      { name:"🎮 Jeux",      value:"🪙 Flip (50/50) | 🎰 Slots (×1.5→×20) | 🃏 Blackjack (×2) | 🎲 Duel 1v1 | 🎁 Gacha (150🪙)" },
      { name:"🎁 Raretés",   value:"🎀🌿 Commun 55% | ⚡🌸 Peu Commun 25% | 💜🔥 Rare 12% | 💎🌟 Épique 6% | 👑🌌 Légendaire 1.8% | ⚜️ Mythique 0.2%" },
      { name:"⚠️ Règles",   value:"• Mise min. 10🪙\n• Impossible de miser plus que son solde\n• Rôles gacha créés auto" },
    ).setFooter({ text:"MAI•GESTION • Jeux dans 👾・jeux" }).setTimestamp()
  ] }).catch(() => {});
  console.log(`📩 Règles jeux → #${ch.name}`);
}

// ── Coin Flip ─────────────────────────────────────────────────────────────────
async function doFlip(btn:ButtonInteraction, bet:number) {
  if (!btn.guild) { await btn.reply({ content:"❌ Erreur guild.", ephemeral:true }); return; }
  await btn.deferReply({ ephemeral:true });
  const data = await getUser(btn.guild.id, btn.user.id);
  if (data.coins < bet) {
    await btn.editReply({ content:`❌ Solde insuffisant — tu as **${data.coins}🪙**, mise **${bet}🪙**.` }); return;
  }
  const win   = Math.random() < 0.5;
  const delta = win ? bet : -bet;
  await saveUser(btn.guild.id, btn.user.id, { ...data, coins: data.coins + delta });

  const embed = new EmbedBuilder()
    .setColor(win ? 0x00cc66 : 0xff4444)
    .setTitle(`🪙 Coin Flip — ${win ? "🟡 Face · Victoire !" : "⚫ Pile · Défaite !"}`)
    .setDescription(`Mise : **${bet}🪙** ${win ? `→ **+${bet}🪙**` : `→ **-${bet}🪙**`}\n💰 Solde : **${(data.coins + delta).toLocaleString("fr-FR")}🪙**`)
    .setFooter({ text:"MAI•GESTION" }).setTimestamp();

  // Tente le salon temporaire (best-effort)
  const gameCh = await tryOpenGameChannel(btn.guild, "coinflip", btn.user.id);
  if (gameCh) {
    await gameCh.send({ content:`<@${btn.user.id}>`, embeds:[embed.setFooter({text:"MAI•GESTION • Salon fermé dans 45s"}).setTimestamp()] }).catch(()=>{});
    closeAfter(gameCh, 45_000);
    await btn.editReply({ content:`${win?"🟡 Victoire":"⚫ Défaite"} ! Résultat dans <#${gameCh.id}> (45s)` });
  } else {
    await btn.editReply({ embeds:[embed] });
  }
}

// ── Slots ─────────────────────────────────────────────────────────────────────
const SYMS  = ["🍒","🍋","🍊","⭐","💎","7️⃣"];
const MULTS: Record<string,number> = { "🍒":2,"🍋":2.5,"🍊":3,"⭐":5,"💎":10,"7️⃣":20 };

async function doSlots(btn:ButtonInteraction, bet:number) {
  if (!btn.guild) { await btn.reply({ content:"❌ Erreur guild.", ephemeral:true }); return; }
  await btn.deferReply({ ephemeral:true });
  const data = await getUser(btn.guild.id, btn.user.id);
  if (data.coins < bet) { await btn.editReply({ content:`❌ Solde insuffisant — tu as **${data.coins}🪙**.` }); return; }
  const r = [0,1,2].map(() => SYMS[Math.floor(Math.random() * SYMS.length)]) as string[];
  let delta = 0, txt = "";
  if (r[0]===r[1] && r[1]===r[2]) {
    const m = MULTS[r[0]!] ?? 2; delta = Math.floor(bet * m); txt = `🎉 **JACKPOT !** ×${m} → **+${delta}🪙**`;
  } else if (r[0]===r[1] || r[1]===r[2] || r[0]===r[2]) {
    delta = Math.floor(bet * 1.5); txt = `✨ **2 identiques !** ×1.5 → **+${delta}🪙**`;
  } else {
    delta = -bet; txt = `💸 **Rien…** → **-${bet}🪙**`;
  }
  await saveUser(btn.guild.id, btn.user.id, { ...data, coins: data.coins + delta });

  const embed = new EmbedBuilder().setColor(delta>0?0x00cc66:0xff4444).setTitle("🎰 Machine à sous")
    .setDescription(`**${r.join(" | ")}**\n\n${txt}\n💰 Solde : **${(data.coins+delta).toLocaleString("fr-FR")}🪙**`)
    .setFooter({ text:"MAI•GESTION" }).setTimestamp();

  const gameCh = await tryOpenGameChannel(btn.guild, "slots", btn.user.id);
  if (gameCh) {
    await gameCh.send({ content:`<@${btn.user.id}>`, embeds:[embed.setFooter({text:"MAI•GESTION • Fermé dans 45s"}).setTimestamp()] }).catch(()=>{});
    closeAfter(gameCh, 45_000);
    await btn.editReply({ content:`🎰 Résultat dans <#${gameCh.id}> (45s)` });
  } else {
    await btn.editReply({ embeds:[embed] });
  }
}

// ── Blackjack ─────────────────────────────────────────────────────────────────
function card() { const c=[2,3,4,5,6,7,8,9,10,10,10,10,11]; return c[Math.floor(Math.random()*c.length)]!; }
function tot(cards:number[]) { let t=cards.reduce((a,b)=>a+b,0), ac=cards.filter(c=>c===11).length; while(t>21&&ac-->0)t-=10; return t; }

async function doBJ(btn:ButtonInteraction, bet:number) {
  if (!btn.guild) { await btn.reply({ content:"❌ Erreur guild.", ephemeral:true }); return; }
  await btn.deferReply({ ephemeral:true });
  const data = await getUser(btn.guild.id, btn.user.id);
  if (data.coins < bet) { await btn.editReply({ content:`❌ Solde insuffisant — tu as **${data.coins}🪙**.` }); return; }
  const p = [card(), card()], d = [card(), card()];
  const pT = tot(p);
  let delta = 0, result = "";
  if (pT === 21) {
    delta = Math.floor(bet * 1.5); result = `🎉 **Blackjack !** ×1.5 → **+${delta}🪙**`;
  } else {
    let dT = tot(d); while (dT < 17) d.push(card()), dT = tot(d);
    if      (pT > 21)      { delta = -bet;  result = `💥 Bust (${pT}) → **-${bet}🪙**`; }
    else if (dT > 21 || pT > dT) { delta = bet;   result = `✅ Victoire ! ${pT} vs ${dT} → **+${bet}🪙**`; }
    else if (pT === dT)    { delta = 0;    result = `🤝 Égalité ${pT} — Remboursé`; }
    else                   { delta = -bet;  result = `❌ Défaite ${pT} vs ${dT} → **-${bet}🪙**`; }
  }
  await saveUser(btn.guild.id, btn.user.id, { ...data, coins: data.coins + delta });

  const embed = new EmbedBuilder().setColor(delta>0?0x00cc66:delta===0?0xffd700:0xff4444).setTitle("🃏 Blackjack")
    .addFields(
      { name:"🧑 Toi",      value:`**${p.join(" + ")} = ${pT}**`, inline:true },
      { name:"🏦 Croupier", value:`**${d.join(" + ")} = ${tot(d)}**`, inline:true },
    )
    .setDescription(`${result}\n💰 Solde : **${(data.coins+delta).toLocaleString("fr-FR")}🪙**`)
    .setFooter({ text:"MAI•GESTION" }).setTimestamp();

  const gameCh = await tryOpenGameChannel(btn.guild, "blackjack", btn.user.id);
  if (gameCh) {
    await gameCh.send({ content:`<@${btn.user.id}>`, embeds:[embed.setFooter({text:"MAI•GESTION • Fermé dans 60s"}).setTimestamp()] }).catch(()=>{});
    closeAfter(gameCh, 60_000);
    await btn.editReply({ content:`🃏 Résultat dans <#${gameCh.id}> (60s)` });
  } else {
    await btn.editReply({ embeds:[embed] });
  }
}

// ── Duel ──────────────────────────────────────────────────────────────────────
async function doDuel(btn:ButtonInteraction, bet:number) {
  if (!btn.guild) { await btn.reply({ content:"❌ Erreur guild.", ephemeral:true }); return; }
  const data = await getUser(btn.guild.id, btn.user.id);
  if (data.coins < bet) { await btn.reply({ content:`❌ Solde insuffisant — tu as **${data.coins}🪙**.`, ephemeral:true }); return; }
  await btn.reply({
    embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("🎲 Duel 1v1").setDescription(`Tu mises **${bet}🪙**. Choisis ton adversaire !`).setFooter({text:"MAI•GESTION"}).setTimestamp()],
    components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder().setCustomId(`g_duel_pick:${bet}`).setPlaceholder("Choisis ton adversaire…").setMinValues(1).setMaxValues(1)
    )],
    ephemeral: true,
  });
}

export async function handleDuelSelect(sel:UserSelectMenuInteraction) {
  if (!sel.guild) return;
  const bet = parseInt(sel.customId.split(":")[1]!);
  const tid = sel.values[0]!;
  if (tid === sel.user.id) { await sel.reply({ content:"❌ Tu ne peux pas te défier toi-même !", ephemeral:true }); return; }
  const target = await sel.guild.members.fetch(tid).catch(() => null) as GuildMember|null;
  if (!target || target.user.bot) { await sel.reply({ content:"❌ Membre invalide.", ephemeral:true }); return; }
  const cData = await getUser(sel.guild.id, sel.user.id);
  if (cData.coins < bet) { await sel.reply({ content:`❌ Solde insuffisant.`, ephemeral:true }); return; }
  duels.set(`${sel.guild.id}:${tid}`, { challengerId: sel.user.id, bet });
  const jeux = sel.guild.channels.cache.find(c => c.type === ChannelType.GuildText && (c.name.includes("jeux")||c.name.includes("👾"))) as TextChannel|undefined;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`g_duel_accept:${tid}:${bet}`).setLabel("✅ Accepter").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`g_duel_refuse:${tid}`).setLabel("❌ Refuser").setStyle(ButtonStyle.Danger),
  );
  if (jeux) await jeux.send({ content:`<@${tid}>`, embeds:[new EmbedBuilder().setColor(0xff4444).setTitle("🎲 Défi Duel !").setDescription(`<@${sel.user.id}> te défie pour **${bet}🪙** !\nGagnant → **${bet*2}🪙** !`).setFooter({text:"MAI•GESTION • 60s pour répondre"}).setTimestamp()], components:[row] });
  setTimeout(() => duels.delete(`${sel.guild!.id}:${tid}`), 60_000);
  await sel.reply({ content:`✅ Défi envoyé à **${target.displayName}** !`, ephemeral:true });
}

// ── Gacha ─────────────────────────────────────────────────────────────────────
async function doGacha(btn:ButtonInteraction) {
  if (!btn.guild) { await btn.reply({ content:"❌ Erreur guild.", ephemeral:true }); return; }
  await btn.deferReply({ ephemeral:true });
  const data = await getUser(btn.guild.id, btn.user.id);
  if (data.coins < GACHA_PRICE) { await btn.editReply({ content:`❌ Il faut **${GACHA_PRICE}🪙** — tu as **${data.coins}🪙**.` }); return; }
  const picked = pickGacha();
  let role = btn.guild.roles.cache.find(r => r.name === picked.name);
  if (!role) role = await btn.guild.roles.create({ name:picked.name, color:picked.color, permissions:[], reason:"MAI•GESTION gacha" }).catch(() => undefined);
  const member = await btn.guild.members.fetch(btn.user.id).catch(() => null) as GuildMember|null;
  const has    = role && member?.roles.cache.has(role.id);
  await saveUser(btn.guild.id, btn.user.id, { ...data, coins: data.coins - GACHA_PRICE });
  if (role && member && !has) await member.roles.add(role).catch(() => {});

  const embed = new EmbedBuilder()
    .setColor(RARITY_COLOR[picked.rarity] ?? 0x9b59b6)
    .setTitle(`${picked.emoji} ${picked.rarity} !`)
    .setDescription(has
      ? `Tu as tiré **${picked.name}** — déjà obtenu ! 😅\n💰 Solde : **${(data.coins-GACHA_PRICE).toLocaleString("fr-FR")}🪙**`
      : `🎉 Rôle **${picked.name}** obtenu !\n💰 Solde : **${(data.coins-GACHA_PRICE).toLocaleString("fr-FR")}🪙**`)
    .addFields({ name:"📊 Chances", value:"🎀🌿 55% | ⚡🌸 25% | 💜🔥 12% | 💎🌟 6% | 👑🌌 1.8% | ⚜️ 0.2%" })
    .setFooter({ text:"MAI•GESTION" }).setTimestamp();

  const gameCh = await tryOpenGameChannel(btn.guild, "gacha", btn.user.id);
  if (gameCh) {
    await gameCh.send({ content:`<@${btn.user.id}>`, embeds:[embed.setFooter({text:"MAI•GESTION • Fermé dans 60s"}).setTimestamp()] }).catch(()=>{});
    closeAfter(gameCh, 60_000);
    await btn.editReply({ content:`🎁 Tirage dans <#${gameCh.id}> (60s)` });
  } else {
    await btn.editReply({ embeds:[embed] });
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function handleGameButton(btn:ButtonInteraction) {
  const id = btn.customId;

  if (id.startsWith("g_flip_")) return doFlip(btn, parseInt(id.split("_")[2]!));
  if (id.startsWith("g_slot_")) return doSlots(btn, parseInt(id.split("_")[2]!));
  if (id.startsWith("g_bj_"))   return doBJ(btn, parseInt(id.split("_")[2]!));
  if (id === "g_gacha")         return doGacha(btn);
  if (id.startsWith("g_duel_") && !id.includes("accept") && !id.includes("refuse") && !id.includes("pick"))
    return doDuel(btn, parseInt(id.split("_")[2]!));

  // ── Duel accept ──────────────────────────────────────────────────────────
  if (id.startsWith("g_duel_accept:")) {
    const parts = id.split(":");
    const tid   = parts[1]!;
    const bet   = parseInt(parts[2] ?? "0");
    if (btn.user.id !== tid) { await btn.reply({ content:"❌ Ce défi n'est pas pour toi !", ephemeral:true }); return; }
    if (!btn.guild) return;
    const duel = duels.get(`${btn.guild.id}:${tid}`);
    if (!duel) { await btn.reply({ content:"❌ Défi expiré.", ephemeral:true }); return; }
    duels.delete(`${btn.guild.id}:${tid}`);
    const [cData, tData] = await Promise.all([getUser(btn.guild.id, duel.challengerId), getUser(btn.guild.id, tid)]);
    if (cData.coins < bet || tData.coins < bet) { await btn.reply({ content:"❌ Solde insuffisant pour l'un des joueurs.", ephemeral:true }); return; }
    const cWins         = Math.random() < 0.5;
    const [wId, lId]    = cWins ? [duel.challengerId, tid] : [tid, duel.challengerId];
    const [wData, lData]= cWins ? [cData, tData]           : [tData, cData];
    await Promise.all([
      saveUser(btn.guild.id, wId, { ...wData, coins: wData.coins + bet }),
      saveUser(btn.guild.id, lId, { ...lData, coins: Math.max(0, lData.coins - bet) }),
    ]);
    const resultEmbed = new EmbedBuilder().setColor(0xffd700).setTitle("🎲 Duel terminé !")
      .setDescription(`🏆 <@${wId}> remporte **${bet*2}🪙** contre <@${lId}> !`)
      .setFooter({ text:"MAI•GESTION" }).setTimestamp();
    const gameCh = await tryOpenGameChannel(btn.guild, "duel", duel.challengerId, tid);
    if (gameCh) {
      await gameCh.send({ embeds:[resultEmbed.setFooter({text:"MAI•GESTION • Fermé dans 60s"}).setTimestamp()] }).catch(()=>{});
      closeAfter(gameCh, 60_000);
    }
    await btn.update({ embeds:[resultEmbed], components:[] });
    return;
  }

  // ── Duel refuse ──────────────────────────────────────────────────────────
  if (id.startsWith("g_duel_refuse:")) {
    const tid = id.split(":")[1]!;
    if (btn.user.id !== tid) { await btn.reply({ content:"❌ Ce défi n'est pas pour toi !", ephemeral:true }); return; }
    if (btn.guild) duels.delete(`${btn.guild.id}:${tid}`);
    await btn.update({
      embeds: [new EmbedBuilder().setColor(0x888888).setDescription(`❌ **${btn.user.displayName}** a refusé le défi.`).setFooter({text:"MAI•GESTION"}).setTimestamp()],
      components: [],
    });
  }
}
