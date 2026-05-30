import { Message, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { logMute, logUnmute } from "../modules/modLogs";

function parseDuration(str: string): number {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 0;
  const val = parseInt(match[1]);
  const units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return val * (units[match[2]] ?? 0);
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

export async function muteCommand(message: Message, args: string[]) {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    return message.reply("❌ Tu n'as pas la permission de muter des membres.");
  }

  const target =
    message.mentions.members?.first() ||
    (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null);

  if (!target) {
    return message.reply("❌ Mentionne un membre valide. Ex: `!mute @user 10m raison`");
  }

  if (!target.moderatable) {
    return message.reply("❌ Je ne peux pas muter ce membre (rôle trop élevé).");
  }

  const durationStr = args[1] ?? "10m";
  const duration = parseDuration(durationStr);

  if (duration === 0) {
    return message.reply("❌ Durée invalide. Ex: `10s`, `5m`, `2h`, `1d`");
  }

  const MAX = 28 * 24 * 60 * 60 * 1000;
  if (duration > MAX) {
    return message.reply("❌ Durée maximale : 28 jours.");
  }

  const reason = args.slice(2).join(" ") || "Aucune raison fournie";
  const formatted = formatDuration(duration);

  try {
    await target.timeout(duration, `${message.author.tag}: ${reason}`);

    await target.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle("🔇 Tu as été muté")
          .addFields(
            { name: "Serveur", value: message.guild.name },
            { name: "Durée", value: formatted },
            { name: "Raison", value: reason },
            { name: "Modérateur", value: message.author.tag }
          )
          .setTimestamp(),
      ],
    }).catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle("🔇 Membre muté")
      .addFields(
        { name: "Utilisateur", value: `${target.user.tag} (${target.id})` },
        { name: "Durée", value: formatted },
        { name: "Expiration", value: `<t:${Math.floor((Date.now() + duration) / 1000)}:R>` },
        { name: "Raison", value: reason },
        { name: "Modérateur", value: message.author.tag }
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    await message.delete().catch(() => {});

    await logMute(message.guild, target.user, message.author, formatted, reason);
  } catch {
    await message.reply("❌ Une erreur est survenue lors du mute.");
  }
}

export async function unmuteCommand(message: Message, args: string[]) {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    return message.reply("❌ Tu n'as pas la permission de démuter des membres.");
  }

  const target =
    message.mentions.members?.first() ||
    (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null);

  if (!target) {
    return message.reply("❌ Mentionne un membre valide. Ex: `!unmute @user`");
  }

  if (!target.isCommunicationDisabled()) {
    return message.reply("ℹ️ Ce membre n'est pas muté.");
  }

  const reason = args.slice(1).join(" ") || "Aucune raison fournie";

  try {
    await target.timeout(null, `${message.author.tag}: ${reason}`);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🔊 Membre démuté")
      .addFields(
        { name: "Utilisateur", value: `${target.user.tag} (${target.id})` },
        { name: "Raison", value: reason },
        { name: "Modérateur", value: message.author.tag }
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    await message.delete().catch(() => {});

    await logUnmute(message.guild, target.user, message.author, reason);
  } catch {
    await message.reply("❌ Une erreur est survenue lors du démute.");
  }
}
