import { Message, EmbedBuilder, ChannelType, PermissionFlagsBits, CategoryChannel, GuildChannel } from "discord.js";

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isStaffName(name: string): boolean {
  const n = normalize(name);
  return n.includes("staff") || n.includes("mod") || n.includes("admin") || n.includes("log");
}

export async function lockstaffCommand(message: Message) {
  if (!message.guild) return;
  const guild = message.guild;
  const everyoneRole = guild.roles.everyone;

  // Trouver ou creer le role Staff
  let staffRole = guild.roles.cache.find(
    (r) => normalize(r.name).includes("staff") || normalize(r.name).includes("admin") ||
           normalize(r.name).includes("moderateur") || normalize(r.name).includes("modo")
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

  // Collecter toutes les categories staff
  const staffCategories = guild.channels.cache.filter(
    (ch) => ch.type === ChannelType.GuildCategory && isStaffName(ch.name)
  ) as Map<string, CategoryChannel>;

  // Collecter tous les salons dont le nom est staff OU dont la categorie parente est staff
  const staffChannels = guild.channels.cache.filter((ch) => {
    if (ch.type === ChannelType.GuildCategory) return false;
    const parentIsStaff = ch.parentId ? staffCategories.has(ch.parentId) : false;
    return isStaffName(ch.name) || parentIsStaff;
  }) as Map<string, GuildChannel>;

  let locked = 0;
  let errors = 0;

  // 1. Verrouiller les categories staff
  for (const [, cat] of staffCategories) {
    try {
      await cat.permissionOverwrites.set([
        { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ]);
      locked++;
    } catch { errors++; }
  }

  // 2. Synchroniser chaque salon enfant avec sa categorie + verrouiller les salons staff hors categorie
  for (const [, ch] of staffChannels) {
    try {
      const parent = ch.parentId ? (guild.channels.cache.get(ch.parentId) as CategoryChannel | undefined) : undefined;
      if (parent && staffCategories.has(parent.id)) {
        // Synchroniser avec la categorie (herite des perms)
        await (ch as any).lockPermissions();
      } else {
        // Salon staff hors categorie : verrouiller manuellement
        await ch.permissionOverwrites.set([
          { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        ]);
      }
      locked++;
    } catch { errors++; }
  }

  await progressMsg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(errors > 0 ? 0xffa500 : 0x57f287)
        .setTitle("🔒 Salons staff verrouilles")
        .setDescription("Seuls les membres avec le role **@" + staffRole.name + "** peuvent voir les salons/categories staff.")
        .addFields(
          { name: "🗂️ Categories trouvees", value: String(staffCategories.size), inline: true },
          { name: "💬 Salons verrouilles", value: String(locked), inline: true },
          { name: "❌ Erreurs", value: String(errors), inline: true },
          { name: "🎭 Role autorise", value: "@" + staffRole.name, inline: false },
          { name: "🔍 Detection", value: "Noms contenant : staff, mod, admin, log", inline: false }
        )
        .setTimestamp(),
    ],
  });

  await message.delete().catch(() => {});
}