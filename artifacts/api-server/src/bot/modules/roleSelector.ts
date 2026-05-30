import { TextChannel, EmbedBuilder, GuildMember } from "discord.js";
import { logger } from "../../lib/logger";

export let roleSelectorMessageId: string | null = null;

export function setRoleSelectorMessageId(id: string) {
  roleSelectorMessageId = id;
}

export const ROLE_EMOJIS: Record<string, string> = {
  "👦": "boy",
  "👧": "girl",
  "⚧️": "non binaire",
  "🏳️‍⚧️": "trans",
  "🏳️‍🌈": "gay",
  "💅": "pretty",
};

export async function sendRoleSelectorMessage(channel: TextChannel): Promise<string | null> {
  const embed = new EmbedBuilder()
    .setColor(0xff73fa)
    .setTitle("🎭 Choix de rôles")
    .setDescription(
      [
        "Réagis avec l'emoji correspondant au rôle que tu veux obtenir.",
        "Tu peux en prendre plusieurs ! Clique à nouveau pour retirer un rôle.\n",
        "👦 — **Boy**",
        "👧 — **Girl**",
        "⚧️ — **Non Binaire**",
        "🏳️‍⚧️ — **Trans**",
        "🏳️‍🌈 — **Gay**",
        "💅 — **Pretty**",
      ].join("\n")
    )
    .setFooter({ text: "Réagis pour obtenir ou retirer un rôle" });

  try {
    const msg = await channel.send({ embeds: [embed] });

    for (const emoji of Object.keys(ROLE_EMOJIS)) {
      await msg.react(emoji).catch(() => {});
      await delay(300);
    }

    roleSelectorMessageId = msg.id;
    logger.info(`Message de sélection de rôles envoyé dans #${channel.name} (id: ${msg.id})`);
    return msg.id;
  } catch (err) {
    logger.error({ err }, "Impossible d'envoyer le message de sélection de rôles");
    return null;
  }
}

export async function handleRoleSelectorReaction(
  member: GuildMember,
  messageId: string,
  emojiName: string,
  action: "add" | "remove"
) {
  if (roleSelectorMessageId && messageId !== roleSelectorMessageId) return;

  const roleName = ROLE_EMOJIS[emojiName];
  if (!roleName) return;

  const guild = member.guild;
  let role = guild.roles.cache.find(
    (r) => r.name.toLowerCase() === roleName.toLowerCase()
  );

  if (!role) {
    const colorMap: Record<string, number> = {
      boy: 0x4fc3f7,
      girl: 0xf48fb1,
      "non binaire": 0xffd54f,
      trans: 0x80cbc4,
      gay: 0xff8a65,
      pretty: 0xce93d8,
    };

    try {
      role = await guild.roles.create({
        name: roleName,
        color: colorMap[roleName.toLowerCase()] ?? 0x99aab5,
        reason: "Rôle créé automatiquement par le sélecteur de rôles",
        permissions: [],
      });
      logger.info(`Rôle @${roleName} créé automatiquement`);
    } catch (err) {
      logger.error({ err }, `Impossible de créer le rôle @${roleName}`);
      return;
    }
  }

  try {
    if (action === "add") {
      await member.roles.add(role);
      logger.info(`Rôle @${roleName} donné à ${member.user.tag}`);
    } else {
      await member.roles.remove(role);
      logger.info(`Rôle @${roleName} retiré à ${member.user.tag}`);
    }
  } catch (err) {
    logger.warn({ err }, `Impossible de modifier le rôle @${roleName} pour ${member.user.tag}`);
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
