import { Message, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { getPunishment, setPunishment } from "../modules/db.js";

const MUTED_ROLE = "🔇 Muet";
const MUTE_DURATION_MS = 60 * 60 * 1000; // 1h par défaut

export async function muteCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    await message.reply("❌ Permission insuffisante.").catch(() => {});
    return;
  }
  const target = message.mentions.members?.first();
  if (!target) { await message.reply("❌ Usage: `!mute @membre [durée_minutes]`").catch(() => {}); return; }

  let duration = MUTE_DURATION_MS;
  if (args[1]) {
    const min = parseInt(args[1]);
    if (!isNaN(min) && min > 0) duration = min * 60 * 1000;
  }

  await message.guild.roles.fetch();
  let muteRole = message.guild.roles.cache.find(r => r.name === MUTED_ROLE);
  if (!muteRole) {
    muteRole = await message.guild.roles.create({ name: MUTED_ROLE, permissions: [], reason: "Rôle mute MAI•GESTION" }).catch(() => undefined);
  }
  if (!muteRole) { await message.reply("❌ Impossible de créer le rôle mute.").catch(() => {}); return; }

  const savedRoles = target.roles.cache.filter(r => r.id !== message.guild!.roles.everyone.id).map(r => r.id);
  const now = Date.now();
  const expiresAt = now + duration;

  await setPunishment(message.guild.id, target.id, { roles: savedRoles, punishedAt: now, expiresAt, reason: "Mute manuel" });
  await target.roles.set([muteRole]).catch(() => {});

  const minutes = Math.floor(duration / 60000);
  await message.reply({
    embeds: [new EmbedBuilder().setColor(0xff9900).setTitle("🔇 Membre muté")
      .setDescription(`**${target.displayName}** est maintenant muet pendant **${minutes} min**.\nLibération : <t:${Math.floor(expiresAt / 1000)}:R>`)
      .setFooter({ text: "MAI•GESTION" }).setTimestamp()],
  }).catch(() => {});

  setTimeout(async () => {
    const record = await getPunishment(message.guild!.id, target.id).catch(() => null);
    if (!record) return;
    const { restoreMember } = await import("../modules/punishSystem.js");
    await restoreMember(message.client, message.guild!.id, target.id).catch(() => {});
  }, duration);
}

export async function demuteCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    await message.reply("❌ Permission insuffisante.").catch(() => {});
    return;
  }
  const target = message.mentions.members?.first();
  if (!target) { await message.reply("❌ Usage: `!demute @membre`").catch(() => {}); return; }
  const { restoreMember } = await import("../modules/punishSystem.js");
  await restoreMember(message.client, message.guild.id, target.id);
  await message.reply(`✅ **${target.displayName}** n'est plus muet.`).catch(() => {});
}
