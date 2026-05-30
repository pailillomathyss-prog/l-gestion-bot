import {
  Message,
  PermissionFlagsBits,
  EmbedBuilder,
  AuditLogEvent,
  ChannelType,
} from "discord.js";

export async function deleteSetupCommand(message: Message, args: string[]) {
  if (!message.guild) return;

  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    return message.reply("❌ Seuls les administrateurs peuvent utiliser `!delete`.");
  }

  if (args[0] !== "confirm") {
    return message.reply(
      "⚠️ Cette commande va supprimer **tous les salons et catégories créés par le bot**.\n\n" +
        "Confirme avec : **`!delete confirm`**"
    );
  }

  const guild = message.guild;
  const botId = message.client.user?.id;
  if (!botId) return;

  const progressMsg = await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("🗑️ Suppression en cours...")
        .setDescription("Analyse des salons créés par le bot via les logs d'audit...")
        .setTimestamp(),
    ],
  });

  const botCreatedChannelIds = new Set<string>();

  try {
    let before: string | undefined = undefined;
    let fetched = 0;

    for (let i = 0; i < 5; i++) {
      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.ChannelCreate,
        limit: 100,
        before,
      });

      if (logs.entries.size === 0) break;

      for (const entry of logs.entries.values()) {
        if (entry.executor?.id === botId && entry.target) {
          botCreatedChannelIds.add(entry.target.id);
        }
      }

      fetched += logs.entries.size;
      before = logs.entries.last()?.id;
      if (logs.entries.size < 100) break;
    }
  } catch {
    return progressMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ Erreur")
          .setDescription(
            "Impossible de lire les logs d'audit. Assure-toi que le bot a la permission **Voir les logs d'audit**."
          ),
      ],
    });
  }

  if (botCreatedChannelIds.size === 0) {
    return progressMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle("ℹ️ Rien à supprimer")
          .setDescription("Aucun salon créé par le bot n'a été trouvé dans les logs d'audit."),
      ],
    });
  }

  const textChannels = guild.channels.cache.filter(
    (c) =>
      botCreatedChannelIds.has(c.id) &&
      c.type !== ChannelType.GuildCategory
  );

  const categories = guild.channels.cache.filter(
    (c) =>
      botCreatedChannelIds.has(c.id) &&
      c.type === ChannelType.GuildCategory
  );

  let deleted = 0;
  const errors: string[] = [];

  for (const [, channel] of textChannels) {
    if (channel.id === message.channel.id) continue;
    try {
      await channel.delete(`!delete confirm par ${message.author.tag}`);
      deleted++;
    } catch {
      errors.push(channel.name);
    }
    await delay(300);
  }

  for (const [, category] of categories) {
    try {
      await category.delete(`!delete confirm par ${message.author.tag}`);
      deleted++;
    } catch {
      errors.push(category.name);
    }
    await delay(300);
  }

  const embed = new EmbedBuilder()
    .setColor(errors.length === 0 ? 0x57f287 : 0xffa500)
    .setTitle(
      errors.length === 0
        ? "✅ Suppression terminée"
        : "⚠️ Suppression terminée avec des erreurs"
    )
    .addFields(
      {
        name: "🗑️ Salons supprimés",
        value: `${deleted}`,
        inline: true,
      },
      {
        name: "🔍 Trouvés via audit log",
        value: `${botCreatedChannelIds.size}`,
        inline: true,
      }
    )
    .setDescription(
      errors.length > 0
        ? `❌ Impossible de supprimer :\n${errors.map((e) => `• ${e}`).join("\n")}`
        : "Tous les salons créés par le bot ont été supprimés."
    )
    .setFooter({ text: `Action par ${message.author.tag}` })
    .setTimestamp();

  await progressMsg.edit({ embeds: [embed] });
  await message.delete().catch(() => {});
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
