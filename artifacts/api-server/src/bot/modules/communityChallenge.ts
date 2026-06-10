/**
 * Défi communautaire mensuel.
 * Chaque membre contribue individuellement DEPUIS le lancement du défi.
 * Quiconque atteint l'objectif individuel peut réclamer sa récompense.
 * La progression live dans ☎️・événement montre les top contributors.
 */

import { Client, Guild, TextChannel, ChannelType, EmbedBuilder, GuildMember } from "discord.js";
import { logger } from "../../lib/logger";
import { addCoins } from "./db";
import postgres from "postgres";

const CHALLENGE_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 jours

function getSql() {
  const url = process.env["DATABASE_URL"];
  if (!url) return null;
  try { return postgres(url, { max: 3, idle_timeout: 30 }); } catch { return null; }
}

// Défis disponibles — objectif PER PERSON
const CHALLENGES = [
  { id: "cc_msg_50",  label: "Chaque membre envoie **50 messages**",  type: "messages", target: 50   },
  { id: "cc_msg_100", label: "Chaque membre envoie **100 messages**", type: "messages", target: 100  },
  { id: "cc_xp_300",  label: "Chaque membre gagne **300 XP**",        type: "xp",       target: 300  },
  { id: "cc_xp_500",  label: "Chaque membre gagne **500 XP**",        type: "xp",       target: 500  },
  { id: "cc_msg_75",  label: "Chaque membre envoie **75 messages**",  type: "messages", target: 75   },
];

// ── State mémoire ─────────────────────────────────────────────────────────────

interface ChallengeState {
  challengeId: string; label: string; type: string;
  target: number; rewardPerPerson: number;
  startedAt: number; messageId: string | null; ended: boolean;
}

// guildId → ChallengeState
const stateCache = new Map<string, ChallengeState>();

// guildId → userId → personal contribution since challenge start
const personalProgress = new Map<string, Map<string, number>>();

// guildId → Set<userId> claimed
const claimedCache = new Map<string, Set<string>>();

// rate-limit for embed updates (guildId → last update ts)
const lastUpdateTs = new Map<string, number>();

// ── DB ────────────────────────────────────────────────────────────────────────

export async function ensureChallengeTables(): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  await sql`CREATE TABLE IF NOT EXISTS community_challenge (
    guild_id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL, label TEXT NOT NULL,
    type TEXT NOT NULL, target INTEGER NOT NULL,
    reward_per_person INTEGER NOT NULL, started_at BIGINT NOT NULL,
    message_id TEXT DEFAULT NULL, ended BOOLEAN NOT NULL DEFAULT false)`;
  await sql`CREATE TABLE IF NOT EXISTS community_challenge_progress (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, challenge_id TEXT NOT NULL,
    contribution INTEGER NOT NULL DEFAULT 0, claimed BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (guild_id, user_id))`;
}

async function loadState(guildId: string): Promise<ChallengeState | null> {
  const mem = stateCache.get(guildId);
  if (mem) return mem;
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql<any[]>`SELECT * FROM community_challenge WHERE guild_id=${guildId}`;
  if (!rows[0]) return null;
  const r = rows[0];
  const s: ChallengeState = {
    challengeId: r.challenge_id, label: r.label, type: r.type,
    target: r.target, rewardPerPerson: r.reward_per_person,
    startedAt: Number(r.started_at), messageId: r.message_id, ended: r.ended,
  };
  stateCache.set(guildId, s);
  return s;
}

async function saveState(guildId: string, s: ChallengeState): Promise<void> {
  stateCache.set(guildId, s);
  const sql = getSql();
  if (!sql) return;
  await sql`INSERT INTO community_challenge
    (guild_id,challenge_id,label,type,target,reward_per_person,started_at,message_id,ended)
    VALUES (${guildId},${s.challengeId},${s.label},${s.type},${s.target},
            ${s.rewardPerPerson},${s.startedAt},${s.messageId},${s.ended})
    ON CONFLICT (guild_id) DO UPDATE SET
      challenge_id=${s.challengeId}, label=${s.label}, type=${s.type}, target=${s.target},
      reward_per_person=${s.rewardPerPerson}, started_at=${s.startedAt},
      message_id=${s.messageId}, ended=${s.ended}`;
}

async function addPersonalProgress(guildId: string, userId: string, challengeId: string, amount: number): Promise<number> {
  if (!personalProgress.has(guildId)) personalProgress.set(guildId, new Map());
  const gMap = personalProgress.get(guildId)!;
  const cur = gMap.get(userId) ?? 0;
  const next = cur + amount;
  gMap.set(userId, next);

  const sql = getSql();
  if (sql) {
    await sql`INSERT INTO community_challenge_progress (guild_id,user_id,challenge_id,contribution,claimed)
      VALUES (${guildId},${userId},${challengeId},${amount},false)
      ON CONFLICT (guild_id,user_id) DO UPDATE SET
        challenge_id=${challengeId},
        contribution=community_challenge_progress.contribution+${amount}`.catch(() => {});
  }
  return next;
}

async function getPersonalProgress(guildId: string, userId: string, challengeId: string): Promise<number> {
  const mem = personalProgress.get(guildId)?.get(userId);
  if (mem !== undefined) return mem;
  const sql = getSql();
  if (!sql) return 0;
  const rows = await sql<{ contribution: number; challenge_id: string }[]>`
    SELECT contribution,challenge_id FROM community_challenge_progress WHERE guild_id=${guildId} AND user_id=${userId}`;
  if (!rows[0] || rows[0].challenge_id !== challengeId) return 0;
  const val = rows[0].contribution;
  if (!personalProgress.has(guildId)) personalProgress.set(guildId, new Map());
  personalProgress.get(guildId)!.set(userId, val);
  return val;
}

async function getTopProgress(guildId: string, challengeId: string): Promise<Array<{ userId: string; contribution: number; claimed: boolean }>> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql<{ user_id: string; contribution: number; claimed: boolean }[]>`
    SELECT user_id,contribution,claimed FROM community_challenge_progress
    WHERE guild_id=${guildId} AND challenge_id=${challengeId} AND contribution > 0
    ORDER BY contribution DESC LIMIT 5`;
  return rows.map(r => ({ userId: r.user_id, contribution: r.contribution, claimed: r.claimed }));
}

async function countCompleted(guildId: string, challengeId: string, target: number): Promise<number> {
  const sql = getSql();
  if (!sql) {
    const gMap = personalProgress.get(guildId);
    if (!gMap) return 0;
    let count = 0;
    for (const v of gMap.values()) if (v >= target) count++;
    return count;
  }
  const rows = await sql<{ n: string }[]>`
    SELECT COUNT(*) as n FROM community_challenge_progress
    WHERE guild_id=${guildId} AND challenge_id=${challengeId} AND contribution >= ${target}`;
  return parseInt(rows[0]?.n ?? "0", 10);
}

async function isClaimed(guildId: string, userId: string): Promise<boolean> {
  if (claimedCache.get(guildId)?.has(userId)) return true;
  const sql = getSql();
  if (!sql) return false;
  const rows = await sql<{ claimed: boolean }[]>`
    SELECT claimed FROM community_challenge_progress WHERE guild_id=${guildId} AND user_id=${userId}`;
  return rows[0]?.claimed ?? false;
}

async function markClaimed(guildId: string, userId: string): Promise<void> {
  if (!claimedCache.has(guildId)) claimedCache.set(guildId, new Set());
  claimedCache.get(guildId)!.add(userId);
  const sql = getSql();
  if (sql) await sql`UPDATE community_challenge_progress SET claimed=true WHERE guild_id=${guildId} AND user_id=${userId}`.catch(() => {});
}

// ── UI ────────────────────────────────────────────────────────────────────────

function progressBar(current: number, total: number, size = 14): string {
  const filled = Math.min(size, Math.round((current / total) * size));
  return "█".repeat(filled) + "░".repeat(size - filled);
}

async function buildEmbed(guild: Guild, s: ChallengeState, endsAt: number): Promise<EmbedBuilder> {
  const top = await getTopProgress(guild.id, s.challengeId);
  const completedCount = await countCompleted(guild.id, s.challengeId, s.target);

  let leaderboard = "*Aucune progression pour l'instant...*";
  if (top.length > 0) {
    const lines = await Promise.all(top.map(async (p) => {
      const member = await guild.members.fetch(p.userId).catch(() => null);
      const name = member?.displayName ?? `<@${p.userId}>`;
      const bar = progressBar(p.contribution, s.target, 10);
      const pct = Math.min(100, Math.round((p.contribution / s.target) * 100));
      const status = p.claimed ? " ✅" : (p.contribution >= s.target ? " 🎯" : "");
      return `**${name}**${status}\n\`${bar}\` ${p.contribution}/${s.target} (${pct}%)`;
    }));
    leaderboard = lines.join("\n\n");
  }

  const isEnded = s.ended || Date.now() > endsAt;

  return new EmbedBuilder()
    .setColor(isEnded ? 0x888888 : 0x0984e3)
    .setTitle(isEnded ? "🏁 Défi communautaire — Terminé !" : "🌍 Défi communautaire mensuel !")
    .setDescription(s.label)
    .addFields(
      { name: "🪙 Récompense",         value: `**${s.rewardPerPerson.toLocaleString("fr-FR")} 🪙 par personne**`, inline: true },
      { name: "✅ Objectif atteint",   value: `**${completedCount} membre(s)**`,                                   inline: true },
      { name: isEnded ? "🏁 Terminé" : "⏰ Fin", value: `<t:${Math.floor(endsAt / 1000)}:R>`,                     inline: true },
      { name: "📊 Top participants",   value: leaderboard },
    )
    .setFooter({ text: isEnded ? "MAI•GESTION • Défi terminé" : "MAI•GESTION • Tape !claim-defi quand tu atteins l'objectif !" })
    .setTimestamp();
}

function findEventChannel(guild: Guild): TextChannel | null {
  return (guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      (c.name.toLowerCase().includes("vénement") ||
        c.name.toLowerCase().includes("evenement") ||
        c.name.toLowerCase().includes("event") ||
        c.name.includes("☎️"))
  ) as TextChannel) ?? null;
}

async function updateMessage(guild: Guild): Promise<void> {
  const s = await loadState(guild.id);
  if (!s || !s.messageId) return;
  const endsAt = s.startedAt + CHALLENGE_INTERVAL;
  const ch = findEventChannel(guild);
  if (!ch) return;
  const msg = await ch.messages.fetch(s.messageId).catch(() => null);
  if (!msg) return;
  const embed = await buildEmbed(guild, s, endsAt);
  await msg.edit({ embeds: [embed] }).catch(() => {});
}

// ── onCommunityProgress — appelé depuis expSystem ─────────────────────────────

export async function onCommunityProgress(member: GuildMember, type: "messages" | "xp", amount: number): Promise<void> {
  const guildId = member.guild.id;
  const userId  = member.id;

  const s = await loadState(guildId);
  if (!s || s.ended) return;

  const endsAt = s.startedAt + CHALLENGE_INTERVAL;
  if (Date.now() > endsAt) return;
  if (s.type !== type) return;

  // Ajouter seulement ce qui est gagné DEPUIS le début du défi
  const newContrib = await addPersonalProgress(guildId, userId, s.challengeId, amount);

  // Mise à jour du message (rate-limited toutes les 60s)
  const last = lastUpdateTs.get(guildId) ?? 0;
  if (Date.now() - last > 60_000) {
    lastUpdateTs.set(guildId, Date.now());
    updateMessage(member.guild).catch(() => {});
  }

  // Notification quand l'objectif individuel est atteint (exactement au passage du seuil)
  const prev = newContrib - amount;
  if (prev < s.target && newContrib >= s.target) {
    const ch = findEventChannel(member.guild);
    if (ch) {
      await ch.send({
        content: `🎉 <@${userId}> a atteint l'objectif du défi communautaire ! Tape \`!claim-defi\` pour réclamer **${s.rewardPerPerson.toLocaleString("fr-FR")} 🪙** !`,
      }).catch(() => {});
    }
    // Màj immédiate
    updateMessage(member.guild).catch(() => {});
  }
}

// ── Claim ─────────────────────────────────────────────────────────────────────

export async function claimChallengeReward(member: GuildMember): Promise<{ success: boolean; message: string }> {
  const guildId = member.guild.id;
  const userId  = member.id;

  const s = await loadState(guildId);
  if (!s) return { success: false, message: "❌ Aucun défi communautaire actif." };

  if (await isClaimed(guildId, userId))
    return { success: false, message: "❌ Tu as déjà réclamé ta récompense pour ce défi." };

  const contrib = await getPersonalProgress(guildId, userId, s.challengeId);
  if (contrib < s.target) {
    const bar = progressBar(contrib, s.target, 14);
    const pct = Math.round((contrib / s.target) * 100);
    return {
      success: false,
      message: `❌ Objectif non atteint — **${contrib}/${s.target}** (${pct}%)\n\`${bar}\`\nContinue ! 💪`,
    };
  }

  await markClaimed(guildId, userId);
  const newBalance = await addCoins(guildId, userId, s.rewardPerPerson);
  updateMessage(member.guild).catch(() => {});

  return {
    success: true,
    message: `✅ Récompense réclamée ! **+${s.rewardPerPerson.toLocaleString("fr-FR")} 🪙** (solde : **${newBalance.toLocaleString("fr-FR")} 🪙**)`,
  };
}

// ── Démarrage d'un défi ───────────────────────────────────────────────────────

async function startChallengeForGuild(client: Client, guild: Guild): Promise<void> {
  const def = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
  const rewardPerPerson = Math.floor(Math.random() * 9_001) + 1_000; // 1k–10k
  const now    = Date.now();
  const endsAt = now + CHALLENGE_INTERVAL;

  // Réinitialiser la mémoire per-guild
  personalProgress.set(guild.id, new Map());
  claimedCache.set(guild.id, new Set());

  const s: ChallengeState = {
    challengeId: `${def.id}_${now}`,
    label: def.label, type: def.type, target: def.target,
    rewardPerPerson, startedAt: now, messageId: null, ended: false,
  };

  const ch = findEventChannel(guild);
  if (!ch) { logger.warn(`Salon événement introuvable sur ${guild.name} (défi)`); return; }

  const embed = await buildEmbed(guild, s, endsAt);
  const msg   = await ch.send({ embeds: [embed] }).catch(() => null);
  if (msg) s.messageId = msg.id;

  await saveState(guild.id, s);
  logger.info(`🌍 Défi communautaire lancé sur ${guild.name} (${def.id}, cible ${def.target}, récompense ${rewardPerPerson} 🪙/pers.)`);

  // Annonce de démarrage
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x0984e3)
        .setTitle("🚀 Un nouveau défi communautaire commence !")
        .setDescription(`${def.label}\n\nObjectif : atteindre **${def.target}** — récompense **${rewardPerPerson.toLocaleString("fr-FR")} 🪙** par personne !\nDurée : **30 jours**\n\nTape \`!claim-defi\` quand tu atteins l'objectif 🎯`)
        .setFooter({ text: "MAI•GESTION" })
        .setTimestamp(),
    ],
  }).catch(() => {});

  // Programmer la fin
  setTimeout(async () => {
    const cur = await loadState(guild.id);
    if (cur) { cur.ended = true; await saveState(guild.id, cur); }
    await updateMessage(guild).catch(() => {});
    const completedCount = await countCompleted(guild.id, s.challengeId, s.target);
    await ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x888888)
          .setTitle("🏁 Défi communautaire terminé !")
          .setDescription(`Le défi est terminé !\n**${completedCount} membre(s)** ont atteint l'objectif et peuvent encore taper \`!claim-defi\` pour 24h supplémentaires.`)
          .setFooter({ text: "MAI•GESTION" })
          .setTimestamp(),
      ],
    }).catch(() => {});
    // Prochain défi dans 30 jours
    setTimeout(() => startChallengeForGuild(client, guild).catch(() => {}), CHALLENGE_INTERVAL);
  }, CHALLENGE_INTERVAL);
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initCommunityChallenge(client: Client): Promise<void> {
  await ensureChallengeTables().catch(() => {});

  for (const [, guild] of client.guilds.cache) {
    try {
      const s = await loadState(guild.id);

      if (s && !s.ended) {
        const endsAt = s.startedAt + CHALLENGE_INTERVAL;

        if (Date.now() < endsAt) {
          const remaining = endsAt - Date.now();
          logger.info(`🌍 Défi actif sur ${guild.name}, fin dans ${Math.round(remaining / 86_400_000)}j`);

          // Màj embed au démarrage
          await updateMessage(guild).catch(() => {});

          // Programmer la fin
          setTimeout(async () => {
            const cur = await loadState(guild.id);
            if (cur) { cur.ended = true; await saveState(guild.id, cur); }
            await updateMessage(guild).catch(() => {});
            setTimeout(() => startChallengeForGuild(client, guild).catch(() => {}), CHALLENGE_INTERVAL);
          }, remaining);
          continue;
        }
      }

      // Pas de défi actif → en lancer un
      await startChallengeForGuild(client, guild);
    } catch (err) {
      logger.error({ err }, `Erreur init défi communautaire sur ${guild.name}`);
    }
  }

  logger.info("🌍 Community Challenge system actif (mensuel, individuel, 1k–10k 🪙/pers.)");
}
