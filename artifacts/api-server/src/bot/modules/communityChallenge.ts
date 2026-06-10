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

const CHALLENGES = [
  { id: "cc_msg_500",  label: "La communauté envoie **500 messages** ensemble !",  type: "messages", target: 500  },
  { id: "cc_msg_1000", label: "La communauté envoie **1 000 messages** ensemble !", type: "messages", target: 1000 },
  { id: "cc_xp_5000",  label: "La communauté gagne **5 000 XP** ensemble !",        type: "xp",       target: 5000 },
  { id: "cc_xp_10000", label: "La communauté gagne **10 000 XP** ensemble !",       type: "xp",       target: 10000},
  { id: "cc_msg_750",  label: "La communauté envoie **750 messages** ensemble !",   type: "messages", target: 750  },
];

// ── In-memory state ───────────────────────────────────────────────────────────
interface ChallengeState {
  challengeId: string; label: string; type: string;
  target: number; rewardPerPerson: number;
  communityTotal: number; startedAt: number;
  messageId: string | null; ended: boolean;
}

const state    = new Map<string, ChallengeState>();
const progress = new Map<string, Map<string, number>>(); // guildId → userId → contribution
const claimed  = new Map<string, Set<string>>();         // guildId → Set<userId>
const lastUpdate = new Map<string, number>();

// ── DB helpers ────────────────────────────────────────────────────────────────

async function ensureChallengeTables() {
  const sql = getSql();
  if (!sql) return;
  await sql`CREATE TABLE IF NOT EXISTS community_challenge (
    guild_id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL, label TEXT NOT NULL,
    type TEXT NOT NULL, target INTEGER NOT NULL, community_total INTEGER NOT NULL DEFAULT 0,
    reward_per_person INTEGER NOT NULL, started_at BIGINT NOT NULL,
    message_id TEXT DEFAULT NULL, ended BOOLEAN NOT NULL DEFAULT false)`;
  await sql`CREATE TABLE IF NOT EXISTS community_challenge_progress (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, challenge_id TEXT NOT NULL,
    contribution INTEGER NOT NULL DEFAULT 0, claimed BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (guild_id, user_id))`;
}

async function loadChallenge(guildId: string): Promise<ChallengeState | null> {
  const sql = getSql();
  if (!sql) return state.get(guildId) ?? null;
  const rows = await sql<any[]>`SELECT * FROM community_challenge WHERE guild_id=${guildId}`;
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    challengeId: r.challenge_id, label: r.label, type: r.type,
    target: r.target, rewardPerPerson: r.reward_per_person,
    communityTotal: r.community_total, startedAt: Number(r.started_at),
    messageId: r.message_id, ended: r.ended,
  };
}

async function saveChallenge(guildId: string, s: ChallengeState) {
  state.set(guildId, s);
  const sql = getSql();
  if (!sql) return;
  await sql`INSERT INTO community_challenge
    (guild_id,challenge_id,label,type,target,community_total,reward_per_person,started_at,message_id,ended)
    VALUES (${guildId},${s.challengeId},${s.label},${s.type},${s.target},${s.communityTotal},
            ${s.rewardPerPerson},${s.startedAt},${s.messageId},${s.ended})
    ON CONFLICT (guild_id) DO UPDATE SET
      challenge_id=${s.challengeId}, label=${s.label}, type=${s.type}, target=${s.target},
      community_total=${s.communityTotal}, reward_per_person=${s.rewardPerPerson},
      started_at=${s.startedAt}, message_id=${s.messageId}, ended=${s.ended}`;
}

async function addProgress(guildId: string, userId: string, challengeId: string, amount: number): Promise<number> {
  if (!progress.has(guildId)) progress.set(guildId, new Map());
  const gMap = progress.get(guildId)!;
  const cur = gMap.get(userId) ?? 0;
  gMap.set(userId, cur + amount);

  const sql = getSql();
  if (sql) {
    await sql`INSERT INTO community_challenge_progress (guild_id,user_id,challenge_id,contribution,claimed)
      VALUES (${guildId},${userId},${challengeId},${amount},false)
      ON CONFLICT (guild_id,user_id) DO UPDATE SET
        challenge_id=${challengeId}, contribution=community_challenge_progress.contribution+${amount}`.catch(() => {});
  }
  return cur + amount;
}

async function markClaimed(guildId: string, userId: string) {
  if (!claimed.has(guildId)) claimed.set(guildId, new Set());
  claimed.get(guildId)!.add(userId);
  const sql = getSql();
  if (sql) {
    await sql`UPDATE community_challenge_progress SET claimed=true WHERE guild_id=${guildId} AND user_id=${userId}`.catch(() => {});
  }
}

async function isClaimed(guildId: string, userId: string): Promise<boolean> {
  if (claimed.get(guildId)?.has(userId)) return true;
  const sql = getSql();
  if (!sql) return false;
  const rows = await sql<{ claimed: boolean }[]>`
    SELECT claimed FROM community_challenge_progress WHERE guild_id=${guildId} AND user_id=${userId}`;
  return rows[0]?.claimed ?? false;
}

async function getUserContribution(guildId: string, userId: string, challengeId: string): Promise<number> {
  const mem = progress.get(guildId)?.get(userId);
  if (mem !== undefined) return mem;
  const sql = getSql();
  if (!sql) return 0;
  const rows = await sql<{ contribution: number; challenge_id: string }[]>`
    SELECT contribution, challenge_id FROM community_challenge_progress WHERE guild_id=${guildId} AND user_id=${userId}`;
  if (!rows[0] || rows[0].challenge_id !== challengeId) return 0;
  return rows[0].contribution;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function progressBar(current: number, total: number, size = 16): string {
  const filled = Math.min(size, Math.round((current / total) * size));
  return "█".repeat(filled) + "░".repeat(size - filled);
}

function buildChallengeEmbed(s: ChallengeState, endsAt: number): EmbedBuilder {
  const pct = Math.min(100, Math.round((s.communityTotal / s.target) * 100));
  const bar = progressBar(s.communityTotal, s.target);
  const done = s.communityTotal >= s.target;

  if (s.ended || done) {
    return new EmbedBuilder()
      .setColor(0x00cc66)
      .setTitle("🏆 Défi communautaire — Accompli !")
      .setDescription(s.label)
      .addFields(
        { name: "✅ Total communauté",   value: `**${s.communityTotal.toLocaleString("fr-FR")} / ${s.target.toLocaleString("fr-FR")}**`, inline: false },
        { name: "🪙 Récompense/pers.",   value: `**${s.rewardPerPerson.toLocaleString("fr-FR")} 🪙**`,                                   inline: true  },
        { name: "📊 Progression",        value: `\`${bar}\` **${pct}%**`,                                                                 inline: false },
      )
      .setFooter({ text: "MAI•GESTION • Utilisez !claim-defi pour récupérer vos pièces !" })
      .setTimestamp();
  }

  return new EmbedBuilder()
    .setColor(0x0984e3)
    .setTitle("🌍 Défi communautaire mensuel !")
    .setDescription(s.label)
    .addFields(
      { name: "📊 Progression",          value: `\`${bar}\` **${s.communityTotal.toLocaleString("fr-FR")} / ${s.target.toLocaleString("fr-FR")}** (${pct}%)`, inline: false },
      { name: "🪙 Récompense par pers.", value: `**${s.rewardPerPerson.toLocaleString("fr-FR")} 🪙**`,                                                           inline: true  },
      { name: "⏰ Fin du défi",          value: `<t:${Math.floor(endsAt / 1000)}:R>`,                                                                            inline: true  },
    )
    .setFooter({ text: "MAI•GESTION • Chaque message et chaque XP compte pour la communauté !" })
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

// ── Update message ────────────────────────────────────────────────────────────

async function updateChallengeMessage(guild: Guild): Promise<void> {
  const s = await loadChallenge(guild.id);
  if (!s || !s.messageId) return;
  const endsAt = s.startedAt + CHALLENGE_INTERVAL;
  const ch = findEventChannel(guild);
  if (!ch) return;
  const msg = await ch.messages.fetch(s.messageId).catch(() => null);
  if (!msg) return;
  await msg.edit({ embeds: [buildChallengeEmbed(s, endsAt)] }).catch(() => {});
}

// ── On progress (called from expSystem) ──────────────────────────────────────

export async function onCommunityProgress(member: GuildMember, type: "messages" | "xp", amount: number): Promise<void> {
  const guildId = member.guild.id;
  const userId  = member.id;

  const s = await loadChallenge(guildId);
  if (!s || s.ended || s.communityTotal >= s.target) return;

  const endsAt = s.startedAt + CHALLENGE_INTERVAL;
  if (Date.now() > endsAt) return;
  if (s.type !== type) return;

  s.communityTotal = Math.min(s.target, s.communityTotal + amount);
  await addProgress(guildId, userId, s.challengeId, amount);
  await saveChallenge(guildId, s);

  // Annonce si objectif atteint
  if (s.communityTotal >= s.target && !s.ended) {
    s.ended = true;
    await saveChallenge(guildId, s);
    const ch = findEventChannel(member.guild);
    if (ch) {
      await ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle("🎉 Défi communautaire accompli !")
            .setDescription(`**La communauté a relevé le défi !** 🏆\n\n${s.label}\n\nChaque participant reçoit **${s.rewardPerPerson.toLocaleString("fr-FR")} 🪙** — tape \`!claim-defi\` pour les réclamer !`)
            .setFooter({ text: "MAI•GESTION" })
            .setTimestamp(),
        ],
      }).catch(() => {});
    }
    await updateChallengeMessage(member.guild);
    return;
  }

  // Rate-limit: màj toutes les 60s
  const last = lastUpdate.get(guildId) ?? 0;
  if (Date.now() - last > 60_000) {
    lastUpdate.set(guildId, Date.now());
    updateChallengeMessage(member.guild).catch(() => {});
  }
}

// ── Claim reward ──────────────────────────────────────────────────────────────

export async function claimChallengeReward(member: GuildMember): Promise<{ success: boolean; message: string }> {
  const guildId = member.guild.id;
  const userId  = member.id;

  const s = await loadChallenge(guildId);
  if (!s) return { success: false, message: "❌ Aucun défi communautaire actif." };

  if (s.communityTotal < s.target && !s.ended)
    return { success: false, message: `❌ Le défi n'est pas encore accompli — **${s.communityTotal.toLocaleString("fr-FR")}/${s.target.toLocaleString("fr-FR")}**. Continuez ! 💪` };

  if (await isClaimed(guildId, userId))
    return { success: false, message: "❌ Tu as déjà réclamé ta récompense pour ce défi." };

  const contrib = await getUserContribution(guildId, userId, s.challengeId);
  if (contrib <= 0)
    return { success: false, message: "❌ Tu n'as pas contribué à ce défi communautaire." };

  await markClaimed(guildId, userId);
  const newBalance = await addCoins(guildId, userId, s.rewardPerPerson);
  return { success: true, message: `✅ Récompense réclamée ! **+${s.rewardPerPerson.toLocaleString("fr-FR")} 🪙** (solde : **${newBalance.toLocaleString("fr-FR")} 🪙**)` };
}

// ── Start challenge ───────────────────────────────────────────────────────────

async function startChallengeForGuild(client: Client, guild: Guild): Promise<void> {
  const def = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
  const rewardPerPerson = Math.floor(Math.random() * 9_001) + 1_000; // 1k–10k
  const now    = Date.now();
  const endsAt = now + CHALLENGE_INTERVAL;

  // Reset per-guild progress memory
  progress.set(guild.id, new Map());
  claimed.set(guild.id, new Set());

  const s: ChallengeState = {
    challengeId: `${def.id}_${now}`, label: def.label, type: def.type,
    target: def.target, rewardPerPerson, communityTotal: 0,
    startedAt: now, messageId: null, ended: false,
  };

  const ch = findEventChannel(guild);
  if (!ch) { logger.warn(`Salon événement introuvable sur ${guild.name} (défi)`); return; }

  const msg = await ch.send({ embeds: [buildChallengeEmbed(s, endsAt)] }).catch(() => null);
  if (msg) s.messageId = msg.id;

  await saveChallenge(guild.id, s);
  logger.info(`🌍 Défi communautaire lancé sur ${guild.name} (${def.id}, récompense ${rewardPerPerson} 🪙/pers.)`);

  // Programmer la fin
  setTimeout(async () => {
    const cur = await loadChallenge(guild.id);
    if (cur) { cur.ended = true; await saveChallenge(guild.id, cur); }
    await updateChallengeMessage(guild).catch(() => {});
    // Prochain défi dans CHALLENGE_INTERVAL
    setTimeout(() => startChallengeForGuild(client, guild).catch(() => {}), CHALLENGE_INTERVAL);
  }, CHALLENGE_INTERVAL);
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initCommunityChallenge(client: Client): Promise<void> {
  await ensureChallengeTables().catch(() => {});

  for (const [, guild] of client.guilds.cache) {
    try {
      const s = await loadChallenge(guild.id);

      if (s) {
        const endsAt = s.startedAt + CHALLENGE_INTERVAL;
        // Restaurer state mémoire
        state.set(guild.id, s);

        if (!s.ended && Date.now() < endsAt) {
          const remaining = endsAt - Date.now();
          logger.info(`🌍 Défi actif sur ${guild.name}, fin dans ${Math.round(remaining / 86_400_000)} jour(s)`);
          setTimeout(async () => {
            const cur = await loadChallenge(guild.id);
            if (cur) { cur.ended = true; await saveChallenge(guild.id, cur); }
            await updateChallengeMessage(guild).catch(() => {});
            setTimeout(() => startChallengeForGuild(client, guild).catch(() => {}), CHALLENGE_INTERVAL);
          }, remaining);

          // Màj du message au démarrage
          await updateChallengeMessage(guild).catch(() => {});
          continue;
        }
      }

      // Démarrer un nouveau défi
      await startChallengeForGuild(client, guild);
    } catch (err) {
      logger.error({ err }, `Erreur init défi communautaire sur ${guild.name}`);
    }
  }

  logger.info("🌍 Community Challenge system actif (mensuel, 1k–10k 🪙/pers.)");
}
