import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { logger } from "../../lib/logger";

const ADMIN = "8";

const commands = [
  // ── Publiques ──────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("help").setDescription("Affiche toutes les commandes disponibles").toJSON(),
  new SlashCommandBuilder().setName("rank").setDescription("Affiche ton profil XP ou celui d'un membre")
    .addUserOption(o => o.setName("membre").setDescription("Membre à consulter").setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Classement des 10 meilleurs membres").toJSON(),
  new SlashCommandBuilder().setName("balance").setDescription("Affiche ton solde de pièces").toJSON(),
  new SlashCommandBuilder().setName("shop").setDescription("Affiche la boutique avec ton solde et tes rôles").toJSON(),
  new SlashCommandBuilder().setName("buy").setDescription("Acheter un rôle dans la boutique")
    .addStringOption(o => o.setName("role").setDescription("Nom du rôle à acheter").setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName("coinflip").setDescription("Pile ou face — double ou rien !")
    .addIntegerOption(o => o.setName("mise").setDescription("Montant à miser").setRequired(true).setMinValue(1)).toJSON(),
  new SlashCommandBuilder().setName("slot").setDescription("Machine à sous — tente ta chance !")
    .addIntegerOption(o => o.setName("mise").setDescription("Montant à miser").setRequired(true).setMinValue(1)).toJSON(),
  new SlashCommandBuilder().setName("daily").setDescription("Réclame ta récompense quotidienne (coins ou XP)").toJSON(),
  new SlashCommandBuilder().setName("quest").setDescription("Affiche ta progression sur la quête active").toJSON(),
  new SlashCommandBuilder().setName("claim").setDescription("Réclame la récompense de la quête active").toJSON(),
  new SlashCommandBuilder().setName("warn").setDescription("Affiche le statut de sanction d'un membre")
    .addUserOption(o => o.setName("membre").setDescription("Membre à consulter").setRequired(false)).toJSON(),

  // ── Admin ──────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("ban").setDescription("(Admin) Bannir un membre")
    .setDefaultMemberPermissions(ADMIN)
    .addUserOption(o => o.setName("membre").setDescription("Membre à bannir").setRequired(true))
    .addStringOption(o => o.setName("raison").setDescription("Raison du ban").setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName("unban").setDescription("(Admin) Débannir un membre")
    .setDefaultMemberPermissions(ADMIN)
    .addStringOption(o => o.setName("id").setDescription("ID du membre à débannir").setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName("mute").setDescription("(Admin) Rendre un membre muet")
    .setDefaultMemberPermissions(ADMIN)
    .addUserOption(o => o.setName("membre").setDescription("Membre à muter").setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName("demute").setDescription("(Admin) Retirer le mute d'un membre")
    .setDefaultMemberPermissions(ADMIN)
    .addUserOption(o => o.setName("membre").setDescription("Membre à démuter").setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName("clear").setDescription("(Admin) Supprimer des messages en masse")
    .setDefaultMemberPermissions(ADMIN)
    .addIntegerOption(o => o.setName("nombre").setDescription("Nombre de messages à supprimer (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)).toJSON(),
  new SlashCommandBuilder().setName("lock").setDescription("(Admin) Verrouiller le salon actuel").setDefaultMemberPermissions(ADMIN).toJSON(),
  new SlashCommandBuilder().setName("unlock").setDescription("(Admin) Déverrouiller le salon actuel").setDefaultMemberPermissions(ADMIN).toJSON(),
  new SlashCommandBuilder().setName("pardon").setDescription("(Admin) Lever manuellement une sanction")
    .setDefaultMemberPermissions(ADMIN)
    .addUserOption(o => o.setName("membre").setDescription("Membre à gracier").setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName("giveaway").setDescription("(Admin) Lancer un giveaway")
    .setDefaultMemberPermissions(ADMIN)
    .addStringOption(o => o.setName("prix").setDescription("Prix du giveaway").setRequired(true))
    .addStringOption(o => o.setName("durée").setDescription("Durée (ex: 1h, 30m, 2d)").setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName("event").setDescription("(Admin) Lancer une quête communautaire avec paramètres custom")
    .setDefaultMemberPermissions(ADMIN)
    .addStringOption(o => o.setName("type").setDescription("Type de défi").setRequired(true)
      .addChoices(
        { name: "Messages", value: "messages" },
        { name: "XP", value: "xp" },
        { name: "Vocal (minutes)", value: "vocal" },
      ))
    .addIntegerOption(o => o.setName("cible").setDescription("Nombre à atteindre").setRequired(true).setMinValue(1))
    .addIntegerOption(o => o.setName("récompense").setDescription("Coins à gagner").setRequired(true).setMinValue(1))
    .addIntegerOption(o => o.setName("durée").setDescription("Durée en jours (défaut: 7)").setRequired(false).setMinValue(1).setMaxValue(30)).toJSON(),
  new SlashCommandBuilder().setName("syncperms").setDescription("(Admin) Synchroniser les permissions des salons").setDefaultMemberPermissions(ADMIN).toJSON(),
  new SlashCommandBuilder().setName("postshop").setDescription("(Admin) Poste le panneau boutique avec boutons").setDefaultMemberPermissions(ADMIN).toJSON(),
];

export async function registerSlashCommands(token: string, clientId: string) {
  const rest = new REST().setToken(token);
  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    logger.info(`✅ ${commands.length} slash commands enregistrées`);
  } catch (err) {
    logger.error({ err }, "Impossible d'enregistrer les slash commands");
  }
}
