import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { logger } from "../../lib/logger";

export const slashCommands = [
  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Voir ton profil XP et niveau")
    .addUserOption(o => o.setName("membre").setDescription("Membre à inspecter").setRequired(false)),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Voir le top 10 des joueurs les plus actifs"),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Voir ton solde de pièces")
    .addUserOption(o => o.setName("membre").setDescription("Membre à inspecter").setRequired(false)),

  new SlashCommandBuilder()
    .setName("jackpot")
    .setDescription("Voir la cagnotte du jackpot communautaire"),

  new SlashCommandBuilder()
    .setName("don")
    .setDescription("Donner des pièces à un membre")
    .addUserOption(o => o.setName("membre").setDescription("Destinataire du don").setRequired(true))
    .addIntegerOption(o => o.setName("montant").setDescription("Montant de pièces à donner").setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Lancer un giveaway (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName("durée").setDescription("Durée (ex: 1h, 30m, 2d)").setRequired(true))
    .addStringOption(o => o.setName("prix").setDescription("Prix du giveaway").setRequired(true)),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bannir un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre à bannir").setRequired(true))
    .addStringOption(o => o.setName("raison").setDescription("Raison du bannissement").setRequired(false)),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Débannir un utilisateur")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(o => o.setName("id").setDescription("ID de l'utilisateur à débannir").setRequired(true))
    .addStringOption(o => o.setName("raison").setDescription("Raison").setRequired(false)),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Muter un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre à muter").setRequired(true))
    .addStringOption(o => o.setName("durée").setDescription("Durée (ex: 10m, 2h, 1d)").setRequired(true))
    .addStringOption(o => o.setName("raison").setDescription("Raison").setRequired(false)),

  new SlashCommandBuilder()
    .setName("demute")
    .setDescription("Démuter un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre à démuter").setRequired(true))
    .addStringOption(o => o.setName("raison").setDescription("Raison").setRequired(false)),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Verrouiller un salon")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o => o.setName("salon").setDescription("Salon à verrouiller").setRequired(false))
    .addStringOption(o => o.setName("raison").setDescription("Raison").setRequired(false)),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Déverrouiller un salon")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o => o.setName("salon").setDescription("Salon à déverrouiller").setRequired(false))
    .addStringOption(o => o.setName("raison").setDescription("Raison").setRequired(false)),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Supprimer des messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName("nombre").setDescription("Nombre de messages (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)),

  new SlashCommandBuilder()
    .setName("restorexp")
    .setDescription("Ajouter de l'XP à un membre (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName("membre").setDescription("Membre").setRequired(true))
    .addIntegerOption(o => o.setName("xp").setDescription("Montant XP à ajouter").setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName("addcoins")
    .setDescription("Ajouter ou retirer des pièces à un membre (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o => o.setName("montant").setDescription("Montant (positif = ajouter, négatif = retirer)").setRequired(true))
    .addUserOption(o => o.setName("membre").setDescription("Membre cible (toi par défaut)").setRequired(false)),
];

export async function registerSlashCommands(token: string, clientId: string, guildId?: string) {
  const rest = new REST({ version: "10" }).setToken(token);
  const body = slashCommands.map(c => c.toJSON());

  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
      logger.info(`✅ ${body.length} commandes / enregistrées (guild ${guildId})`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body });
      logger.info(`✅ ${body.length} commandes / enregistrées (global)`);
    }
  } catch (err) {
    logger.error({ err }, "Erreur enregistrement commandes /");
  }
}
