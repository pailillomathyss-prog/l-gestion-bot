import { Message, EmbedBuilder, PermissionFlagsBits } from "discord.js";

function parseDuration(str: string): number {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return 0;
  const val = parseInt(match[1]);
  const units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return val * (units[match[2].toLowerCase()] ?? 0);
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
  if (!message.member?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    return message.reply("❌ Tu n'as pas la permission de muter.");
  }

  const target = message.mentions.members?.first();
  if (!target) return message.reply("❌ Mentionne un membre. Ex: `!mute @user 10m raison`");
  if (!target.moderatable) return message.reply("❌ Je ne peux pas muter ce membre.");

  const durationStr = args[1];
  if (!durationStr) return message.reply("❌ Fournis une durée. Ex: `10s`, `5m`, `2h`, `1d`");

  const duration = parseDuration(durationStr);
  if (!duration) return message.reply("❌ Durée invalide. Ex: `10s`, `5m`, `2h`, `1d`");
  if (duration > 28 * 24 * 3600000) return message.reply("❌ Durée max : 28 jours.");

  const reason = args.slice(2).join(" ") || "Aucune raison fournie";
  const formatted = formatDuration(duration);

  await target.timeout(duration, `${message.author.tag}: ${reason}`);

  await target.send({
    embeds: [
      new EmbedBuilder().setColor(0xffa500).setTitle("🔇 Tu as été muté")
        .addFields(
          { name: "Serveur", value: message.guild!.name },
          { name: "Durée", value: formatted },
          { name: "Raison", value: reason },
          { name: "Modérateur", value: message.author.tag }
        ).setTimestamp(),
    ],
  }).catch(() => {});

  await message.channel.send({
    embeds: [
      new EmbedBuilder().setColor(0xffa500).setTitle("🔇 Membre muté")
        .addFields(
          { name: "Utilisateur", value: `${target.user.tag} (${target.id})` },
          { name: "Durée", value: formatted },
          { name: "Expiration", value: `<t:${Math.floor((Date.now() + duration) / 1000)}:R>` },
          { name: "Raison", value: reason },
          { name: "Modérateur", value: message.author.tag }
        ).setThumbnail(target.user.displayAvatarURL()).setTimestamp(),
    ],
  });
}

export async function demuteCommand(message: Message, args: string[]) {
  if (!message.member?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    return message.reply("❌ Tu n'as pas la permission de démuter.");
  }

  const target = message.mentions.members?.first();
  if (!target) return message.reply("❌ Mentionne un membre. Ex: `!demute @user raison`");
  if (!target.isCommunicationDisabled()) return message.reply("ℹ️ Ce membre n'est pas muté.");

  const reason = args.slice(1).join(" ") || "Aucune raison fournie";

  await target.timeout(null, `${message.author.tag}: ${reason}`);

  await message.channel.send({
    embeds: [
      new EmbedBuilder().setColor(0x57f287).setTitle("🔊 Membre démuté")
        .addFields(
          { name: "Utilisateur", value: `${target.user.tag} (${target.id})` },
          { name: "Raison", value: reason },
          { name: "Modérateur", value: message.author.tag }
        ).setThumbnail(target.user.displayAvatarURL()).setTimestamp(),
    ],
  });
}
