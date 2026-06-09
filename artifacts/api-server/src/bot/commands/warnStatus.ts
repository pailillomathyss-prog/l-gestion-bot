import { Message, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { getPunishmentStatus } from "../modules/punishSystem";

function formatDuration(ms: number): string {
  if (ms <= 0) return "Expiré";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}min`);
  if (s > 0 && h === 0) parts.push(`${s}s`);
  return parts.join(" ") || "< 1s";
}

export async function warnStatusCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;

  let targetId = message.member.id;
  let targetMention = `${message.member}`;

  if (args[0]) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.reply("❌ Seuls les admins peuvent vérifier la sanction d'un autre membre.").catch(() => {});
      return;
    }
    targetId = args[0].replace(/[<@!>]/g, "");
    const fetched = await message.guild.members.fetch(targetId).catch(() => null);
    if (!fetched) {
      await message.reply("❌ Membre introuvable.").catch(() => {});
      return;
    }
    targetMention = `${fetched}`;
  }

  const status = await getPunishmentStatus(message.guild.id, targetId);

  if (!status) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00cc66)
          .setTitle("✅ Aucune sanction active")
          .setDescription(`${targetMention} n'est pas sanctionné(e) actuellement.`)
          .setFooter({ text: "MAI•GESTION" })
          .setTimestamp(),
      ],
    }).catch(() => {});
    return;
  }

  const remaining = status.expiresAt - Date.now();

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle("🪫 Sanction en cours")
        .setDescription(`${targetMention} est actuellement sanctionné(e).`)
        .addFields(
          { name: "⚠️ Motif", value: `Mot interdit : \`${status.reason}\``, inline: false },
          { name: "🕐 Sanctionné le", value: `<t:${Math.floor(status.punishedAt / 1000)}:F>`, inline: true },
          { name: "🔓 Libération", value: `<t:${Math.floor(status.expiresAt / 1000)}:R>`, inline: true },
          { name: "⏳ Temps restant", value: `**${formatDuration(remaining)}**`, inline: true }
        )
        .setFooter({ text: "MAI•GESTION" })
        .setTimestamp(),
    ],
  }).catch(() => {});
}
