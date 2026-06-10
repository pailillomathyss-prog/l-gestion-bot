import { GuildMember, EmbedBuilder, TextChannel, ChannelType } from "discord.js";
import { logger } from "../../lib/logger";
import { getUserBadges, addUserBadge, UserStats } from "./db";

export interface Badge {
  id: string;
  name: string;
  description: string;
  emoji: string;
  stat: keyof UserStats | "streak";
  threshold: number;
}

export const BADGES: Badge[] = [
  { id: "bavard",       name: "💬・bavard",       description: "100 messages envoyés",      emoji: "💬", stat: "messagesTotal",     threshold: 100   },
  { id: "communicatif", name: "🗣️・communicatif",  description: "500 messages envoyés",      emoji: "🗣️", stat: "messagesTotal",     threshold: 500   },
  { id: "orateur",      name: "📢・orateur",       description: "1 000 messages envoyés",    emoji: "📢", stat: "messagesTotal",     threshold: 1000  },
  { id: "legende_msg",  name: "🌟・légende",       description: "5 000 messages envoyés",    emoji: "🌟", stat: "messagesTotal",     threshold: 5000  },
  { id: "combattant",   name: "⚔️・combattant",   description: "1er duel gagné",             emoji: "⚔️", stat: "duelsWon",          threshold: 1     },
  { id: "guerrier",     name: "🛡️・guerrier",     description: "5 duels gagnés",             emoji: "🛡️", stat: "duelsWon",          threshold: 5     },
  { id: "champion",     name: "🏆・champion",      description: "10 duels gagnés",            emoji: "🏆", stat: "duelsWon",          threshold: 10    },
  { id: "invincible",   name: "👑・invincible",    description: "25 duels gagnés",            emoji: "👑", stat: "duelsWon",          threshold: 25    },
  { id: "riche",        name: "💰・riche",         description: "1 000 🪙 gagnées",           emoji: "💰", stat: "coinsEarnedTotal",   threshold: 1000  },
  { id: "investisseur", name: "💎・investisseur",  description: "10 000 🪙 gagnées",          emoji: "💎", stat: "coinsEarnedTotal",   threshold: 10000 },
  { id: "millionnaire", name: "🤑・millionnaire",  description: "50 000 🪙 gagnées",          emoji: "🤑", stat: "coinsEarnedTotal",   threshold: 50000 },
  { id: "assidu",       name: "🔥・assidu",        description: "3 jours de streak daily",    emoji: "🔥", stat: "streak",             threshold: 3     },
  { id: "regulier",     name: "⚡・régulier",      description: "7 jours de streak daily",    emoji: "⚡", stat: "streak",             threshold: 7     },
  { id: "fidele",       name: "💫・fidèle",        description: "30 jours de streak daily",   emoji: "💫", stat: "streak",             threshold: 30    },
];

/**
 * Catégories de badges ordonnées du plus faible au plus fort.
 * Quand un badge supérieur est attribué, les inférieurs de la même catégorie sont retirés.
 */
const BADGE_CATEGORIES: string[][] = [
  ["bavard", "communicatif", "orateur", "legende_msg"],
  ["combattant", "guerrier", "champion", "invincible"],
  ["riche", "investisseur", "millionnaire"],
  ["assidu", "regulier", "fidele"],
];

/** Retourne les IDs des badges inférieurs dans la même catégorie que badgeId */
function getLowerBadgesInCategory(badgeId: string): string[] {
  for (const category of BADGE_CATEGORIES) {
    const idx = category.indexOf(badgeId);
    if (idx > 0) return category.slice(0, idx);
  }
  return [];
}

async function ensureBadgeRole(guild: import("discord.js").Guild, badge: Badge) {
  await guild.roles.fetch();
  let role = guild.roles.cache.find((r) => r.name === badge.name);
  if (!role) {
    try {
      role = await guild.roles.create({
        name: badge.name,
        reason: `Badge MAI•GESTION — ${badge.description}`,
        permissions: [],
      });
      logger.info(`🏅 Rôle badge créé : ${badge.name}`);
    } catch (err) {
      logger.error({ err }, `Impossible de créer le rôle badge ${badge.name}`);
      return null;
    }
  }
  return role;
}

function findAnnounceCh(guild: import("discord.js").Guild): TextChannel | null {
  return (guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      (c.name.toLowerCase().includes("general") ||
        c.name.toLowerCase().includes("général") ||
        c.name.toLowerCase().includes("cmds") ||
        c.name.toLowerCase().includes("chat"))
  ) as TextChannel) ?? null;
}

export async function checkBadges(member: GuildMember, stats: UserStats, streak = 0): Promise<void> {
  const guildId = member.guild.id;
  const userId = member.id;
  const owned = await getUserBadges(guildId, userId);
  const ownedSet = new Set(owned);

  for (const badge of BADGES) {
    if (ownedSet.has(badge.id)) continue;

    const value = badge.stat === "streak" ? streak : (stats[badge.stat as keyof UserStats] as number);
    if (value < badge.threshold) continue;

    const role = await ensureBadgeRole(member.guild, badge);
    if (!role) continue;

    await member.roles.add(role).catch(() => {});
    await addUserBadge(guildId, userId, badge.id);

    // ── Retirer les rôles inférieurs de la même catégorie ──────────────────
    const lowerIds = getLowerBadgesInCategory(badge.id);
    for (const lowerId of lowerIds) {
      const lowerBadge = BADGES.find((b) => b.id === lowerId);
      if (!lowerBadge) continue;
      const lowerRole = member.guild.roles.cache.find((r) => r.name === lowerBadge.name);
      if (lowerRole && member.roles.cache.has(lowerRole.id)) {
        await member.roles.remove(lowerRole).catch(() => {});
        logger.info(`🔄 Rôle badge inférieur "${lowerBadge.name}" retiré à ${member.user.tag} (remplacé par "${badge.name}")`);
      }
    }

    const ch = findAnnounceCh(member.guild);
    if (ch) {
      const msg = await ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle(`${badge.emoji} Badge débloqué !`)
            .setDescription(`${member} vient de débloquer le badge **${badge.name}** !\n*${badge.description}*`)
            .setThumbnail(member.user.displayAvatarURL())
            .setFooter({ text: "MAI•GESTION • Badges" })
            .setTimestamp(),
        ],
      }).catch(() => null);
      if (msg) setTimeout(() => msg.delete().catch(() => {}), 15_000);
    }

    logger.info(`🏅 Badge "${badge.name}" attribué à ${member.user.tag}`);
  }
}
