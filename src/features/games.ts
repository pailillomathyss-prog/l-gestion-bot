import {
  Guild, TextChannel, ChannelType, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
  UserSelectMenuBuilder, UserSelectMenuInteraction, GuildMember,
} from "discord.js";
import { getUser, saveUser } from "../db.js";

// ── Gacha roles (11 rôles, 6 raretés) ────────────────────────────────────────
export const GACHA_ROLES = [
  { name: "🎀 Commun",      color: 0x95a5a6, weight: 300, rarity: "Commun",     emoji: "🎀" },
  { name: "🌿 Nature",      color: 0x27ae60, weight: 250, rarity: "Commun",     emoji: "🌿" },
  { name: "⚡ Éclair",      color: 0x3498db, weight: 140, rarity: "Peu Commun", emoji: "⚡" },
  { name: "🌸 Sakura",      color: 0xff69b4, weight: 110, rarity: "Peu Commun", emoji: "🌸" },
  { name: "💜 Mystère",     color: 0x9b59b6, weight: 70,  rarity: "Rare",       emoji: "💜" },
  { name: "🔥 Flamme",      color: 0xe67e22, weight: 50,  rarity: "Rare",       emoji: "🔥" },
  { name: "💎 Diamant",     color: 0x00bcd4, weight: 35,  rarity: "Épique",     emoji: "💎" },
  { name: "🌟 Étoile",      color: 0xffd700, weight: 25,  rarity: "Épique",     emoji: "🌟" },
  { name: "👑 Couronne",    color: 0xdaa520, weight: 12,  rarity: "Légendaire", emoji: "👑" },
  { name: "🌌 Galaxie",     color: 0x7b2d8b, weight: 6,   rarity: "Légendaire", emoji: "🌌" },
  { name: "⚜️ Mythique",   color: 0xe74c3c, weight: 2,   rarity: "Mythique",   emoji: "⚜️" },
] as const;

const GACHA_TOTAL = GACHA_ROLES.reduce((s, r) => s + r.weight, 0);
const GACHA_PRICE = 150;

const RARITY_COLORS: Record<string, number> = {
  Commun: 0x95a5a6, "Peu Commun": 0x2ecc71, Rare: 0x9b59b6,
  Épique: 0x00bcd4, Légendaire: 0xffd700, Mythique: 0xe74c3c,
};

function pickGacha() {
  let r = Math.random() * GACHA_TOTAL;
  for (const role of GACHA_ROLES) { r -= role.weight; if (r <= 0) return role; }
  return GACHA_ROLES[0];
}

// ── Pending duels ─────────────────────────────────────────────────────────────
const duels = new Map<string, { challengerId: string; bet: number }>();

// ── Game panel ────────────────────────────────────────────────────────────────
function buildGamePanel() {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("👾 Jeux — Casino & Fun")
    .setDescription("**Mise tes 🪙 pièces et tente ta chance !**\n\nChoisis un jeu ci-dessous via les boutons.")
    .addFields(
      { name: "🪙 Coin Flip",    value: "Pile ou face — 50/50. Gagne ou perds ta mise.", inline: false },
      { name: "🎰 Slots",        value: "Machine à sous — jusqu'à **×20** sur 3 identiques !", inline: false },
      { name: "🃏 Blackjack",    value: "21 contre le croupier. Bats-le pour doubler ta mise.", inline: false },
      { name: "🎲 Duel 1v1",     value: "Défie un membre — le gagnant emporte tout !", inline: false },
      { name: `🎁 Gacha (${GACHA_PRICE}🪙)`, value: "Tire un rôle aléatoire parmi 11 rôles, 6 raretés !", inline: false },
    )
    .setFooter({ text: "MAI•GESTION • Mise min. 10🪙" }).setTimestamp();

  const r1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("g_flip_10").setLabel("🪙 Flip 10").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("g_flip_50").setLabel("🪙 Flip 50").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("g_flip_100").setLabel("🪙 Flip 100").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("g_flip_500").setLabel("🪙 Flip 500").setStyle(ButtonStyle.Primary),
  );
  const r2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("g_slot_50").setLabel("🎰 Slot 50").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("g_slot_200").setLabel("🎰 Slot 200").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("g_bj_100").setLabel("🃏 BJ 100").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("g_bj_500").setLabel("🃏 BJ 500").setStyle(ButtonStyle.Success),
  );
  const r3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("g_duel_50").setLabel("🎲 Duel 50").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("g_duel_200").setLabel("🎲 Duel 200").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("g_gacha").setLabel(`🎁 Gacha ${GACHA_PRICE}🪙`).setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [r1, r2, r3] };
}

export async function postGamePanelIfNeeded(guild: Guild, botId: string) {
  const ch = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText && (c.name.includes("jeux") || c.name.includes("👾") || c.name.toLowerCase().includes("game"))
  ) as TextChannel | undefined;
  if (!ch) return;
  const recent = await ch.messages.fetch({ limit: 15 }).catch(() => null);
  if (recent?.some(m => m.author.id === botId && m.embeds[0]?.title?.includes("Jeux"))) return;
  await ch.send(buildGamePanel()).catch(() => {});
  console.log(`👾 Panel jeux posté dans #${ch.name}`);
}

// ── Rules message in 📩・regles ────────────────────────────────────────────────
export async function postGameRulesIfNeeded(guild: Guild, botId: string) {
  const ch = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText && (c.name.includes("📩") || c.name.toLowerCase().includes("regles") || c.name.toLowerCase().includes("règles"))
  ) as TextChannel | undefined;
  if (!ch) return;
  const recent = await ch.messages.fetch({ limit: 10 }).catch(() => null);
  if (recent?.some(m => m.author.id === botId && m.embeds.length > 0)) return;
  await ch.send({ embeds: [
    new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle("📜 Règles des Jeux — MAI•GESTION")
      .setDescription("Bienvenue dans le casino ! Voici les règles à connaître.")
      .addFields(
        { name: "💰 Gagner des pièces", value: "• Messages : **10–20 🪙** (cooldown 1 min)\n• Vocal : **15 🪙** / 5 min\n• Daily : **50–300 🪙**\n• Giveaways : varie" },
        { name: "🎮 Jeux disponibles", value: "🪙 **Coin Flip** — Pile ou face (50/50)\n🎰 **Slots** — 2 identiques ×1.5 — 3 identiques ×2 à ×20\n🃏 **Blackjack** — Bats le croupier pour ×2\n🎲 **Duel 1v1** — Le gagnant emporte tout !\n🎁 **Gacha** — Tire un rôle rare pour 150 🪙" },
        { name: "🎁 Rarités Gacha", value: "🎀🌿 Commun (55%) | ⚡🌸 Peu Commun (25%) | 💜🔥 Rare (12%) | 💎🌟 Épique (6%) | 👑🌌 Légendaire (1.8%) | ⚜️ Mythique (0.2%)" },
        { name: "⚠️ Règles importantes", value: "• Mise minimum : **10 🪙**\n• Impossible de miser plus que son solde\n• Les rôles gacha sont créés automatiquement\n• Joue responsablement !" },
      )
      .setFooter({ text: "MAI•GESTION • Les jeux sont dans 👾・jeux" }).setTimestamp()
  ] }).catch(() => {});
  console.log(`📩 Règles jeux postées dans #${ch.name}`);
}

// ── Coin Flip ─────────────────────────────────────────────────────────────────
async function doFlip(btn: ButtonInteraction, bet: number) {
  if (!btn.guild) return;
  const data = await getUser(btn.guild.id, btn.user.id);
  if (data.coins < bet) { await btn.reply({ content: `❌ Solde insuffisant. Tu as **${data.coins} 🪙** mais tu mises **${bet} 🪙**.`, ephemeral: true }); return; }
  const win = Math.random() < 0.5;
  const delta = win ? bet : -bet;
  await saveUser(btn.guild.id, btn.user.id, { ...data, coins: data.coins + delta });
  await btn.reply({ embeds: [
    new EmbedBuilder()
      .setColor(win ? 0x00cc66 : 0xff4444)
      .setTitle(win ? "🟡 Face — Victoire !" : "⚫ Pile — Défaite !")
      .setDescription(win ? `**+${bet} 🪙** → Solde : **${data.coins + delta} 🪙**` : `**-${bet} 🪙** → Solde : **${data.coins + delta} 🪙**`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()
  ], ephemeral: true });
}

// ── Slots ─────────────────────────────────────────────────────────────────────
const SYMS = ["🍒","🍋","🍊","⭐","💎","7️⃣"];
const MULTS: Record<string, number> = { "🍒":2,"🍋":2.5,"🍊":3,"⭐":5,"💎":10,"7️⃣":20 };

async function doSlots(btn: ButtonInteraction, bet: number) {
  if (!btn.guild) return;
  const data = await getUser(btn.guild.id, btn.user.id);
  if (data.coins < bet) { await btn.reply({ content: `❌ Solde insuffisant. Tu as **${data.coins} 🪙**.`, ephemeral: true }); return; }
  const reels = [0,1,2].map(() => SYMS[Math.floor(Math.random() * SYMS.length)]) as string[];
  let delta = 0, txt = "";
  if (reels[0]===reels[1] && reels[1]===reels[2]) {
    const m = MULTS[reels[0]!] ?? 2;
    delta = Math.floor(bet * m); txt = `🎉 **JACKPOT !** ×${m} → **+${delta} 🪙**`;
  } else if (reels[0]===reels[1] || reels[1]===reels[2] || reels[0]===reels[2]) {
    delta = Math.floor(bet * 1.5); txt = `✨ **2 identiques !** ×1.5 → **+${delta} 🪙**`;
  } else {
    delta = -bet; txt = `💸 **Rien...** → **-${bet} 🪙**`;
  }
  await saveUser(btn.guild.id, btn.user.id, { ...data, coins: data.coins + delta });
  await btn.reply({ embeds: [
    new EmbedBuilder()
      .setColor(delta > 0 ? 0x00cc66 : 0xff4444)
      .setTitle("🎰 Machine à sous")
      .setDescription(`**${reels.join(" | ")}**\n\n${txt}\n\nSolde : **${data.coins + delta} 🪙**`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()
  ], ephemeral: true });
}

// ── Blackjack ─────────────────────────────────────────────────────────────────
function card() { const c=[2,3,4,5,6,7,8,9,10,10,10,10,11]; return c[Math.floor(Math.random()*c.length)]!; }
function total(cards: number[]) {
  let t = cards.reduce((a,b)=>a+b,0), aces = cards.filter(c=>c===11).length;
  while (t>21 && aces-->0) t-=10; return t;
}

async function doBJ(btn: ButtonInteraction, bet: number) {
  if (!btn.guild) return;
  const data = await getUser(btn.guild.id, btn.user.id);
  if (data.coins < bet) { await btn.reply({ content: `❌ Solde insuffisant. Tu as **${data.coins} 🪙**.`, ephemeral: true }); return; }
  await btn.deferReply({ ephemeral: true });
  const p = [card(), card()], d = [card(), card()];
  const pT = total(p);
  if (pT === 21) {
    const gain = Math.floor(bet*1.5);
    await saveUser(btn.guild.id, btn.user.id, { ...data, coins: data.coins + gain });
    await btn.editReply({ embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("🃏 Blackjack Naturel !").setDescription(`🎉 **21 !** Gain ×1.5 : **+${gain} 🪙**\n\nSolde : **${data.coins+gain} 🪙**`).setFooter({text:"MAI•GESTION"}).setTimestamp()] }); return;
  }
  let dT = total(d);
  while (dT < 17) d.push(card()), dT = total(d);
  let delta = 0, result = "";
  if (pT>21) { delta=-bet; result=`💥 Bust (${pT}) → **-${bet} 🪙**`; }
  else if (dT>21||pT>dT) { delta=bet; result=`✅ Victoire ! ${pT} vs ${dT} → **+${bet} 🪙**`; }
  else if (pT===dT) { delta=0; result=`🤝 Égalité ! ${pT} vs ${dT} → Remboursé`; }
  else { delta=-bet; result=`❌ Défaite ! ${pT} vs ${dT} → **-${bet} 🪙**`; }
  await saveUser(btn.guild.id, btn.user.id, { ...data, coins: data.coins + delta });
  await btn.editReply({ embeds: [
    new EmbedBuilder().setColor(delta>0?0x00cc66:delta===0?0xffd700:0xff4444).setTitle("🃏 Blackjack")
      .addFields({name:"🧑 Toi",value:`**${p.join("+")} = ${pT}**`,inline:true},{name:"🏦 Croupier",value:`**${d.join("+")} = ${dT}**`,inline:true})
      .setDescription(`${result}\n\nSolde : **${data.coins+delta} 🪙**`).setFooter({text:"MAI•GESTION"}).setTimestamp()
  ] });
}

// ── Duel ──────────────────────────────────────────────────────────────────────
async function doDuel(btn: ButtonInteraction, bet: number) {
  if (!btn.guild) return;
  const data = await getUser(btn.guild.id, btn.user.id);
  if (data.coins < bet) { await btn.reply({ content: `❌ Solde insuffisant. Tu as **${data.coins} 🪙**.`, ephemeral: true }); return; }
  const select = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder().setCustomId(`g_duel_pick:${bet}`).setPlaceholder("Choisis ton adversaire...").setMinValues(1).setMaxValues(1)
  );
  await btn.reply({ embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("🎲 Duel 1v1").setDescription(`Tu mises **${bet} 🪙**. Choisis ton adversaire !`).setFooter({text:"MAI•GESTION"}).setTimestamp()], components:[select], ephemeral:true });
}

export async function handleDuelSelect(sel: UserSelectMenuInteraction) {
  if (!sel.guild) return;
  const bet = parseInt(sel.customId.split(":")[1]!);
  const targetId = sel.values[0]!;
  if (targetId === sel.user.id) { await sel.reply({ content: "❌ Tu ne peux pas te défier toi-même !", ephemeral: true }); return; }
  const target = await sel.guild.members.fetch(targetId).catch(() => null) as GuildMember | null;
  if (!target || target.user.bot) { await sel.reply({ content: "❌ Membre invalide.", ephemeral: true }); return; }
  const challenger = await getUser(sel.guild.id, sel.user.id);
  if (challenger.coins < bet) { await sel.reply({ content: `❌ Solde insuffisant.`, ephemeral: true }); return; }
  duels.set(`${sel.guild.id}:${targetId}`, { challengerId: sel.user.id, bet });
  const jeux = sel.guild.channels.cache.find(c => c.type === ChannelType.GuildText && (c.name.includes("jeux")||c.name.includes("👾"))) as TextChannel | undefined;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`g_duel_accept:${targetId}:${bet}`).setLabel("✅ Accepter").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`g_duel_refuse:${targetId}`).setLabel("❌ Refuser").setStyle(ButtonStyle.Danger),
  );
  if (jeux) await jeux.send({ content:`<@${targetId}>`, embeds:[new EmbedBuilder().setColor(0xff4444).setTitle("🎲 Défi Duel !").setDescription(`<@${sel.user.id}> te défie pour **${bet} 🪙** !\nLe gagnant emporte **${bet*2} 🪙** !`).setFooter({text:"MAI•GESTION • 60 secondes pour répondre"}).setTimestamp()], components:[row] });
  setTimeout(()=>duels.delete(`${sel.guild!.id}:${targetId}`), 60_000);
  await sel.reply({ content: `✅ Défi envoyé à **${target.displayName}** !`, ephemeral: true });
}

// ── Gacha ─────────────────────────────────────────────────────────────────────
async function doGacha(btn: ButtonInteraction) {
  if (!btn.guild) return;
  const data = await getUser(btn.guild.id, btn.user.id);
  if (data.coins < GACHA_PRICE) { await btn.reply({ content: `❌ Il faut **${GACHA_PRICE} 🪙** pour le gacha. Tu as **${data.coins} 🪙**.`, ephemeral: true }); return; }
  await btn.deferReply({ ephemeral: true });
  const picked = pickGacha();
  let role = btn.guild.roles.cache.find(r => r.name === picked.name);
  if (!role) role = await btn.guild.roles.create({ name: picked.name, color: picked.color, permissions: [], reason: "Rôle gacha MAI•GESTION" }).catch(() => undefined);
  const member = await btn.guild.members.fetch(btn.user.id).catch(() => null) as GuildMember | null;
  const alreadyHas = role && member?.roles.cache.has(role.id);
  await saveUser(btn.guild.id, btn.user.id, { ...data, coins: data.coins - GACHA_PRICE });
  if (role && member && !alreadyHas) await member.roles.add(role).catch(() => {});
  await btn.editReply({ embeds: [
    new EmbedBuilder()
      .setColor(RARITY_COLORS[picked.rarity] ?? 0x9b59b6)
      .setTitle(`${picked.emoji} ${picked.rarity} !`)
      .setDescription(alreadyHas
        ? `Tu as tiré **${picked.name}**... mais tu le possèdes déjà ! 😅\n\nSolde : **${data.coins - GACHA_PRICE} 🪙**`
        : `🎉 Tu obtiens le rôle **${picked.name}** !\nRareté : **${picked.rarity}**\n\nSolde : **${data.coins - GACHA_PRICE} 🪙**`)
      .addFields({name:"📊 Chances",value:"🎀🌿 Commun (55%) | ⚡🌸 Peu Commun (25%) | 💜🔥 Rare (12%) | 💎🌟 Épique (6%) | 👑🌌 Légendaire (1.8%) | ⚜️ Mythique (0.2%)"})
      .setFooter({text:"MAI•GESTION"}).setTimestamp()
  ] });
}

// ── Main button handler ───────────────────────────────────────────────────────
export async function handleGameButton(btn: ButtonInteraction) {
  const id = btn.customId;
  if (id.startsWith("g_flip_"))  return doFlip(btn, parseInt(id.replace("g_flip_","")));
  if (id.startsWith("g_slot_"))  return doSlots(btn, parseInt(id.replace("g_slot_","")));
  if (id.startsWith("g_bj_"))    return doBJ(btn, parseInt(id.replace("g_bj_","")));
  if (id === "g_gacha")          return doGacha(btn);
  if (id.startsWith("g_duel_") && !id.includes("accept") && !id.includes("refuse") && !id.includes("pick"))
    return doDuel(btn, parseInt(id.replace("g_duel_","")));
  if (id.startsWith("g_duel_accept:")) {
    const [,tId,betStr] = id.split(":") as string[];
    if (btn.user.id !== tId) { await btn.reply({content:"❌ Ce défi n'est pas pour toi !",ephemeral:true}); return; }
    if (!btn.guild) return;
    const duel = duels.get(`${btn.guild.id}:${tId}`);
    if (!duel) { await btn.reply({content:"❌ Défi expiré.",ephemeral:true}); return; }
    duels.delete(`${btn.guild.id}:${tId}`);
    const bet = parseInt(betStr ?? "0");
    const [cData, tData] = await Promise.all([getUser(btn.guild.id, duel.challengerId), getUser(btn.guild.id, tId!)]);
    if (cData.coins < bet || tData.coins < bet) { await btn.reply({content:"❌ L'un des joueurs n'a plus assez de pièces.",ephemeral:true}); return; }
    const cWins = Math.random() < 0.5;
    const [wId, lId] = cWins ? [duel.challengerId, tId!] : [tId!, duel.challengerId];
    const [wData, lData] = cWins ? [cData, tData] : [tData, cData];
    await Promise.all([saveUser(btn.guild.id, wId, {...wData,coins:wData.coins+bet}), saveUser(btn.guild.id, lId, {...lData,coins:lData.coins-bet})]);
    await btn.update({ embeds:[new EmbedBuilder().setColor(0xffd700).setTitle("🎲 Duel terminé !").setDescription(`🏆 <@${wId}> remporte **${bet*2} 🪙** contre <@${lId}> !`).setFooter({text:"MAI•GESTION"}).setTimestamp()], components:[] });
    return;
  }
  if (id.startsWith("g_duel_refuse:")) {
    const tId = id.split(":")[1]!;
    if (btn.user.id !== tId) { await btn.reply({content:"❌ Ce défi n'est pas pour toi !",ephemeral:true}); return; }
    if (btn.guild) duels.delete(`${btn.guild.id}:${tId}`);
    await btn.update({ embeds:[new EmbedBuilder().setColor(0x888888).setDescription(`❌ **${btn.user.displayName}** a refusé le défi.`).setFooter({text:"MAI•GESTION"}).setTimestamp()], components:[] });
  }
}
