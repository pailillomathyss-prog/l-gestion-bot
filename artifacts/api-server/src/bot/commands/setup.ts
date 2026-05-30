import {
  Message,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  CategoryChannel,
  TextChannel,
  OverwriteType,
} from "discord.js";
import { sendRulesMessage, ensureMembresRolePermissions } from "../modules/rulesGate";
import { sendRoleSelectorMessage } from "../modules/roleSelector";

interface ChannelDef {
  name: string;
  type: ChannelType.GuildText | ChannelType.GuildVoice | ChannelType.GuildAnnouncement;
  topic?: string;
  isRules?: boolean;
  isRoles?: boolean;
}

interface CategoryDef {
  name: string;
  emoji: string;
  staffOnly?: boolean;
  channels: ChannelDef[];
}

const SERVER_STRUCTURE: CategoryDef[] = [
  {
    name: "INFORMATIONS",
    emoji: "📋",
    channels: [
      { name: "📢・annonces", type: ChannelType.GuildAnnouncement, topic: "Annonces officielles du serveur" },
      { name: "📜・règles", type: ChannelType.GuildText, topic: "Règles du serveur — réagis ✅ pour accéder", isRules: true },
      { name: "ℹ️・informations", type: ChannelType.GuildText, topic: "Informations et mises à jour" },
      { name: "🤝・rôles", type: ChannelType.GuildText, topic: "Choisis tes rôles en réagissant", isRoles: true },
    ],
  },
  {
    name: "GÉNÉRAL",
    emoji: "💬",
    channels: [
      { name: "💬・général", type: ChannelType.GuildText, topic: "Discussion générale" },
      { name: "📸・médias", type: ChannelType.GuildText, topic: "Partage tes images, vidéos et GIFs" },
      { name: "😂・memes", type: ChannelType.GuildText, topic: "Partage tes meilleurs memes" },
      { name: "🤖・commandes-bot", type: ChannelType.GuildText, topic: "Utilise les commandes du bot ici" },
      { name: "🎵・musique", type: ChannelType.GuildText, topic: "Demandes musicales et liens" },
    ],
  },
  {
    name: "GAMING",
    emoji: "🎮",
    channels: [
      { name: "🎮・gaming", type: ChannelType.GuildText, topic: "Discussion gaming" },
      { name: "🏆・tournois", type: ChannelType.GuildText, topic: "Organisation de tournois et classements" },
      { name: "🕹️・recherche-équipe", type: ChannelType.GuildText, topic: "Cherche des coéquipiers" },
    ],
  },
  {
    name: "ÉVÉNEMENTS",
    emoji: "🎉",
    channels: [
      { name: "🎉・giveaways", type: ChannelType.GuildText, topic: "Giveaways du serveur" },
      { name: "📅・événements", type: ChannelType.GuildText, topic: "Événements à venir" },
      { name: "🏅・palmarès", type: ChannelType.GuildText, topic: "Résultats des giveaways et événements" },
    ],
  },
  {
    name: "VOCAL",
    emoji: "🔊",
    channels: [
      { name: "🔊 Général", type: ChannelType.GuildVoice },
      { name: "🎮 Gaming", type: ChannelType.GuildVoice },
      { name: "🎵 Musique", type: ChannelType.GuildVoice },
      { name: "📺 Stream / Watch", type: ChannelType.GuildVoice },
      { name: "🎙️ Staff Voice", type: ChannelType.GuildVoice },
    ],
  },
  {
    name: "STAFF",
    emoji: "🔒",
    staffOnly: true,
    channels: [
      { name: "📋・staff-général", type: ChannelType.GuildText, topic: "Discussion privée du staff" },
      { name: "🔨・logs-modération", type: ChannelType.GuildText, topic: "Logs de modération automatiques" },
      { name: "⚠️・rapports", type: ChannelType.GuildText, topic: "Rapports des membres" },
      { name: "📊・statistiques", type: ChannelType.GuildText, topic: "Statistiques du serveur" },
    ],
  },
];

export async function setupCommand(message: Message, args: string[]) {
  if (!message.guild) return;

  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    return message.reply("❌ Seuls les administrateurs peuvent utiliser `!setup`.");
  }

  if (args[0] !== "confirm") {
    return message.reply(
      "⚠️ Cette commande va créer toute la structure du serveur (catégories + salons).\n\n" +
      "Confirme avec : **`!setup confirm`**"
    );
  }

  const progressMsg = await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("⚙️ Configuration du serveur en cours...")
        .setDescription("Création des catégories et salons, merci de patienter...")
        .setTimestamp(),
    ],
  });

  const guild = message.guild;
  const everyoneRole = guild.roles.everyone;

  let createdCategories = 0;
  let createdChannels = 0;
  const errors: string[] = [];
  let rulesChannel: TextChannel | null = null;
  let rolesChannel: TextChannel | null = null;

  for (const categoryDef of SERVER_STRUCTURE) {
    try {
      const permissionOverwrites = categoryDef.staffOnly
        ? [{ id: everyoneRole.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] }]
        : [];

      const category = (await guild.channels.create({
        name: `${categoryDef.emoji} ${categoryDef.name}`,
        type: ChannelType.GuildCategory,
        permissionOverwrites,
        reason: `Setup automatique par ${message.author.tag}`,
      })) as CategoryChannel;

      createdCategories++;

      for (const chanDef of categoryDef.channels) {
        try {
          const created = await guild.channels.create({
            name: chanDef.name,
            type: chanDef.type,
            parent: category.id,
            topic: chanDef.type !== ChannelType.GuildVoice ? chanDef.topic : undefined,
            permissionOverwrites: categoryDef.staffOnly
              ? [{ id: everyoneRole.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] }]
              : [],
            reason: `Setup automatique par ${message.author.tag}`,
          });

          createdChannels++;

          if (chanDef.isRules) rulesChannel = created as TextChannel;
          if (chanDef.isRoles) rolesChannel = created as TextChannel;
        } catch {
          errors.push(`Salon: ${chanDef.name}`);
        }

        await delay(300);
      }
    } catch {
      errors.push(`Catégorie: ${categoryDef.emoji} ${categoryDef.name}`);
    }
  }

  await progressMsg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("⚙️ Finalisation...")
        .setDescription("Envoi des messages de règles et de sélection de rôles...")
        .setTimestamp(),
    ],
  });

  if (rulesChannel) {
    await sendRulesMessage(rulesChannel);
    await ensureMembresRolePermissions(guild);
  }

  if (rolesChannel) {
    await sendRoleSelectorMessage(rolesChannel);
  }

  const embed = new EmbedBuilder()
    .setColor(errors.length === 0 ? 0x57f287 : 0xffa500)
    .setTitle(errors.length === 0 ? "✅ Serveur configuré avec succès !" : "⚠️ Configuration terminée avec des erreurs")
    .addFields(
      { name: "📁 Catégories créées", value: `${createdCategories}`, inline: true },
      { name: "💬 Salons créés", value: `${createdChannels}`, inline: true },
      { name: "📜 Règlement", value: rulesChannel ? `Envoyé dans ${rulesChannel}` : "❌ Non envoyé", inline: false },
      { name: "🎭 Sélection de rôles", value: rolesChannel ? `Envoyé dans ${rolesChannel}` : "❌ Non envoyé", inline: false },
      { name: "🔒 Accès restreint", value: "Les membres doivent accepter le règlement avec ✅ pour voir les salons", inline: false },
    )
    .setDescription(
      errors.length > 0
        ? `❌ Éléments non créés:\n${errors.map((e) => `• ${e}`).join("\n")}`
        : null
    )
    .setFooter({ text: `Configuré par ${message.author.tag}` })
    .setTimestamp();

  await progressMsg.edit({ embeds: [embed] });
  await message.delete().catch(() => {});
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
