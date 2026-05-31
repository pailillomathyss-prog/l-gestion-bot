import {
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
  } from "discord.js";
  import { logger } from "../../lib/logger";

  const ADMIN = PermissionFlagsBits.Administrator;

  const commands = [
    new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Bannir un membre du serveur")
      .setDefaultMemberPermissions(ADMIN)
      .addUserOption((o) => o.setName("membre").setDescription("Membre à bannir").setRequired(true))
      .addStringOption((o) => o.setName("raison").setDescription("Raison du ban").setRequired(false)),

    new SlashCommandBuilder()
      .setName("mute")
      .setDescription("Muter un membre (timeout)")
      .setDefaultMemberPermissions(ADMIN)
      .addUserOption((o) => o.setName("membre").setDescription("Membre à muter").setRequired(true))
      .addStringOption((o) => o.setName("durée").setDescription("Durée: 10s, 5m, 2h, 1d").setRequired(true))
      .addStringOption((o) => o.setName("raison").setDescription("Raison du mute").setRequired(false)),

    new SlashCommandBuilder()
      .setName("unmute")
      .setDescription("Démuter un membre")
      .setDefaultMemberPermissions(ADMIN)
      .addUserOption((o) => o.setName("membre").setDescription("Membre à démuter").setRequired(true))
      .addStringOption((o) => o.setName("raison").setDescription("Raison").setRequired(false)),

    new SlashCommandBuilder()
      .setName("clear")
      .setDescription("Supprimer des messages en masse")
      .setDefaultMemberPermissions(ADMIN)
      .addIntegerOption((o) =>
        o.setName("nombre").setDescription("Nombre de messages à supprimer (1-100)").setMinValue(1).setMaxValue(100).setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("deban")
      .setDescription("Débannir un utilisateur par son ID")
      .setDefaultMemberPermissions(ADMIN)
      .addStringOption((o) => o.setName("id").setDescription("ID de l'utilisateur banni").setRequired(true))
      .addStringOption((o) => o.setName("raison").setDescription("Raison du déban").setRequired(false)),

    new SlashCommandBuilder()
      .setName("lock")
      .setDescription("Verrouiller un salon")
      .setDefaultMemberPermissions(ADMIN)
      .addChannelOption((o) => o.setName("salon").setDescription("Salon à verrouiller (défaut: salon actuel)").setRequired(false))
      .addStringOption((o) => o.setName("raison").setDescription("Raison").setRequired(false)),

    new SlashCommandBuilder()
      .setName("unlock")
      .setDescription("Déverrouiller un salon")
      .setDefaultMemberPermissions(ADMIN)
      .addChannelOption((o) => o.setName("salon").setDescription("Salon à déverrouiller (défaut: salon actuel)").setRequired(false))
      .addStringOption((o) => o.setName("raison").setDescription("Raison").setRequired(false)),

    new SlashCommandBuilder()
      .setName("giveaway")
      .setDescription("Gérer les giveaways")
      .setDefaultMemberPermissions(ADMIN)
      .addSubcommand((s) =>
        s.setName("start").setDescription("Lancer un giveaway")
          .addStringOption((o) => o.setName("durée").setDescription("Durée: 10s, 5m, 2h, 1d").setRequired(true))
          .addIntegerOption((o) => o.setName("gagnants").setDescription("Nombre de gagnants").setMinValue(1).setRequired(true))
          .addStringOption((o) => o.setName("prix").setDescription("Lot du giveaway").setRequired(true))
      )
      .addSubcommand((s) =>
        s.setName("end").setDescription("Terminer un giveaway")
          .addStringOption((o) => o.setName("id").setDescription("ID du message du giveaway").setRequired(true))
      )
      .addSubcommand((s) =>
        s.setName("reroll").setDescription("Relancer un gagnant")
          .addStringOption((o) => o.setName("id").setDescription("ID du message du giveaway").setRequired(true))
      ),

    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Créer toute la structure du serveur (catégories + salons)")
      .setDefaultMemberPermissions(ADMIN),

    new SlashCommandBuilder()
      .setName("delete")
      .setDescription("Supprimer tous les salons créés par le bot")
      .setDefaultMemberPermissions(ADMIN),

    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Afficher la liste des commandes"),
  ].map((c) => c.toJSON());

  export async function registerSlashCommands(token: string, clientId: string) {
    const rest = new REST().setToken(token);
    try {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      logger.info(`Slash commands enregistrées (${commands.length} commandes) ✅`);
    } catch (err) {
      logger.error({ err }, "Impossible d'enregistrer les slash commands");
    }
  }
  