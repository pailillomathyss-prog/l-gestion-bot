import { Message, EmbedBuilder, ChannelType, PermissionFlagsBits, OverwriteType } from "discord.js";

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isStaffChannel(name: string): boolean {
  const n = normalize(name);
  return n.includes("staff") || n.includes("mod") || n.includes("admin") || n.includes("log");
}

export async function lockstaffCommand(message: Message) {
  if (!message.guild) return;
  const guild = message.guild;
  const everyoneRole = guild.roles.everyone;

  // Trouver ou creer le role Staff
  let staffRole = guild.roles.cache.find(
    (r) => normalize(r.name).includes("staff") || normalize(r.name).includes("admin") || normalize(r.name).includes("moderateur") || normalize(r.name).includes("modo")
  );

  if (!staffRole) {
    staffRole = await guild.roles.create({
      name: "Staff",
      color: 0xe74c3c,
      reason: "Role Staff cree automatiquement par !lockstaff",
      permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers],
    });
  }

  const progressMsg = await message.channel.send({
    embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("🔒 Verrouillage des salons staff en cours...").setTimestamp()],
  });

  let locked = 0;
  let errors = 0;

  for (const [, channel] of guild.channels.cache) {
    if (!isStaffChannel(channel.name)) continue;

    try {
      // Bloquer @everyone
      await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel: false });
      // Autoriser Staff
      await channel.permissionOverwrites.edit(staffRole, { ViewChannel: true, SendMessages: true });
      locked++;
    } catch {
      errors++;
    }
  }

  await progressMsg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(errors > 0 ? 0xffa500 : 0x57f287)
        .setTitle("🔒 Salons staff verrouilles")
        .setDescription("Seuls les membres avec le role **@" + staffRole.name + "** peuvent voir les salons staff.")
        .addFields(
          { name: "✅ Salons verrouilles", value: String(locked), inline: true },
          { name: "❌ Erreurs", value: String(errors), inline: true },
          { name: "🎭 Role autorise", value: "@" + staffRole.name, inline: true }
        )
        .setFooter({ text: "Les salons detectes sont ceux contenant : staff, mod, admin, log" })
        .setTimestamp(),
    ],
  });

  await message.delete().catch(() => {});
}