import { Message, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { LEVEL_ROLES, xpForLevel } from "../modules/expSystem";
import { upsertXP } from "../modules/db";

export async function restoreXpCommand(message: Message) {
  if (!message.guild || !message.member) return;

  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("❌ Seuls les administrateurs peuvent utiliser cette commande.").catch(() => {});
    return;
  }

  const loadingMsg = await message.reply("⏳ Scan des membres en cours...").catch(() => null);

  await message.guild.members.fetch();
  await message.guild.roles.fetch();

  const guildId = message.guild.id;
  let restored = 0;
  let skipped = 0;

  for (const [, member] of message.guild.members.cache) {
    if (member.user.bot) continue;

    // Trouver le rôle de niveau le plus élevé que le membre possède
    let bestLevel = -1;
    for (const { level, name } of LEVEL_ROLES) {
      const role = message.guild!.roles.cache.find((r) => r.name === name);
      if (role && member.roles.cache.has(role.id)) {
        if (level > bestLevel) bestLevel = level;
      }
    }

    if (bestLevel === -1) {
      // Aucun rôle de niveau → donner XP 0, niveau 0
      await upsertXP(guildId, member.id, 0, 0, 0).catch(() => {});
      skipped++;
      continue;
    }

    const xp = xpForLevel(bestLevel);
    await upsertXP(guildId, member.id, xp, bestLevel, 0).catch(() => {});
    restored++;
  }

  const embed = new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle("✅ XP restauré")
    .setDescription("L'XP des membres a été restauré depuis leurs rôles de niveau.")
    .addFields(
      { name: "🎖️ Membres restaurés", value: `**${restored}**`, inline: true },
      { name: "🍃 Sans rôle (nv 0)", value: `**${skipped}**`, inline: true }
    )
    .setFooter({ text: "MAI•GESTION" })
    .setTimestamp();

  if (loadingMsg) await loadingMsg.edit({ content: "", embeds: [embed] }).catch(() => {});
  else await message.reply({ embeds: [embed] }).catch(() => {});
}
