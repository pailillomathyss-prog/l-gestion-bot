import { Message, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { logMute, logDemute } from "../modules/modLogs";

function parseDuration(str: string): number {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return 0;
  const val   = parseInt(match[1]!);
  const units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return val * (units[match[2]!.toLowerCase()] ?? 0);
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60)  return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

export async function muteCommand(message: Message, args: string[]) {
  if (!message.member?.permissions.has(PermissionFlagsBits.ModerateMembers))
    return message.reply("❌ Tu n'as pas la permission de muter.");
  if (!message.guild) return;

  const target = message.mentions.members?.first();
  if (!target) return message.reply("❌ Mentionne un membre. Ex: `!mute @user 10m raison`");

  // args[0] = mention, args[1] = durée, args[2+] = raison
  const durationStr = args[1];
  if (!durationStr) return message.reply("❌ Fournis une durée. Ex: `!mute @user 10m raison`");

  const duration = parseDuration(durationStr);
  if (!duration)              return message.reply("❌ Durée invalide. Exemples : `10s` `5m` `2h` `1d`");
  if (duration < 5000)        return message.reply("❌ Durée minimum : 5 secondes.");
  if (duration > 28 * 86400000) return message.reply("❌ Durée maximum : 28 jours.");

  const reason    = args.slice(2).join(" ") || "Aucune raison fournie";
  const formatted = formatDuration(duration);

  // Vérifications de hiérarchie
  const botMember = message.guild.members.me;
  if (!botMember) return message.reply("❌ Impossible de récupérer le membre bot.");
  if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers))
    return message.reply("❌ Le bot n'a pas la permission `Expirer les membres` sur le serveur.");
  if (target.roles.highest.position >= botMember.roles.highest.position)
    return message.reply("❌ Je ne peux pas muter ce membre (rôle trop haut).");
  if (target.user.id === message.guild.ownerId)
    return message.reply("❌ Impossible de muter le propriétaire du serveur.");

  try {
    await target.timeout(duration, `${message.author.tag}: ${reason}`);

    await logMute(message.guild, target.user, message.author, formatted, reason);

    await target.send({ embeds: [new EmbedBuilder()
      .setColor(0xffa500).setTitle("🔇 Tu as été muté")
      .addFields(
        { name: "Serveur",     value: message.guild.name,  inline: true },
        { name: "Durée",       value: formatted,            inline: true },
        { name: "Expiration",  value: `<t:${Math.floor((Date.now() + duration) / 1000)}:R>`, inline: true },
        { name: "Raison",      value: reason },
        { name: "Modérateur",  value: message.author.tag },
      ).setTimestamp()] }).catch(() => {});

    await message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(0xffa500).setTitle("🔇 Membre muté")
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: "Utilisateur", value: `${target.user.tag} (${target.id})`, inline: true },
        { name: "Durée",       value: formatted,                            inline: true },
        { name: "Expiration",  value: `<t:${Math.floor((Date.now() + duration) / 1000)}:R>`, inline: true },
        { name: "Raison",      value: reason },
        { name: "Modérateur",  value: message.author.tag },
      ).setTimestamp()] });
  } catch (err: any) {
    await message.reply(`❌ Échec du mute : \`${err?.message ?? err}\`\nVérifie que le bot a le rôle **Expirer les membres** et qu'il est au-dessus de la cible.`);
  }
}

export async function demuteCommand(message: Message, args: string[]) {
  if (!message.member?.permissions.has(PermissionFlagsBits.ModerateMembers))
    return message.reply("❌ Tu n'as pas la permission de démuter.");
  if (!message.guild) return;

  const target = message.mentions.members?.first();
  if (!target) return message.reply("❌ Mentionne un membre. Ex: `!demute @user raison`");

  if (!target.isCommunicationDisabled())
    return message.reply("ℹ️ Ce membre n'est pas muté (timeout actif).");

  const reason = args.slice(1).join(" ") || "Aucune raison fournie";

  try {
    await target.timeout(null, `${message.author.tag}: ${reason}`);
    await logDemute(message.guild, target.user, message.author, reason);

    await message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(0x57f287).setTitle("🔊 Membre démuté")
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: "Utilisateur", value: `${target.user.tag} (${target.id})`, inline: true },
        { name: "Raison",      value: reason },
        { name: "Modérateur",  value: message.author.tag },
      ).setTimestamp()] });
  } catch (err: any) {
    await message.reply(`❌ Échec du démute : \`${err?.message ?? err}\``);
  }
}
