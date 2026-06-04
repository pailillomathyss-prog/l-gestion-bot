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
      .addUserOption((o) =>
        o.setName("membre").setDescription("Membre a bannir").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("raison").setDescription("Raison du ban").setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("mute")
      .setDescription("Muter un membre (timeout)")
      .setDefaultMemberPermissions(ADMIN)
      .addUserOption((o) =>
        o.setName("membre").setDescription("Membre a muter").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("durée").setDescription("Durée: 10s, 5m, 2h, 1d").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("raison").setDescription("Raison du mute").setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("unmute")
      .setDescription("Demuter un membre")
      .setDefaultMemberPermissions(ADMIN)
      .addUserOption((o) =>
        o.setName("membre").setDescription("Membre a demuter").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("raison").setDescription("Raison").setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("clear")
      .setDescription("Supprimer des messages en masse")
      .setDefaultMemberPermissions(ADMIN)
      .addIntegerOption((o) =>
        o
          .setName("nombre")
          .setDescription("Nombre de messages a supprimer (1-100)")
          .setMinValue(1)
          .setMaxValue(100)
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("deban")
      .setDescription("Debannir un utilisateur par son ID")
      .setDefaultMemberPermissions(ADMIN)
      .addStringOption((o) =>
        o.setName("id").setDescription("ID de l utilisateur banni").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("raison").setDescription("Raison du deban").setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("lock")
      .setDescription("Verrouiller un salon")
      .setDefaultMemberPermissions(ADMIN)
      .addChannelOption((o) =>
        o.setName("salon").setDescription("Salon a verrouiller (defaut: salon actuel)").setRequired(false)
      )
      .addStringOption((o) =>
        o.setName("raison").setDescription("Raison").setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("unlock")
      .setDescription("Deverrouiller un salon")
      .setDefaultMemberPermissions(ADMIN)
      .addChannelOption((o) =>
        o.setName("salon").setDescription("Salon a deverrouiller (defaut: salon actuel)").setRequired(false)
      )
      .addStringOption((o) =>
        o.setName("raison").setDescription("Raison").setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("invites")
      .setDescription("Voir les invitations du serveur ou d un utilisateur")
      .setDefaultMemberPermissions(ADMIN)
      .addUserOption((o) =>
        o.setName("utilisateur").setDescription("Voir les invitations d un utilisateur specifique").setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("giveaway")
      .setDescription("Gerer les giveaways")
      .setDefaultMemberPermissions(ADMIN)
      .addSubcommand((sub) =>
        sub
          .setName("start")
          .setDescription("Lancer un giveaway")
          .addStringOption((o) =>
            o.setName("durée").setDescription("Durée: 10s, 5m, 2h, 1d").setRequired(true)
          )
          .addIntegerOption((o) =>
            o.setName("gagnants").setDescription("Nombre de gagnants").setMinValue(1).setRequired(true)
          )
          .addStringOption((o) =>
            o.setName("prix").setDescription("Lot du giveaway").setRequired(true)
          )
          .addIntegerOption((o) =>
            o.setName("invitations").setDescription("Nb d invitations min pour participer (optionnel)").setMinValue(1).setRequired(false)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("end")
          .setDescription("Terminer un giveaway")
          .addStringOption((o) =>
            o.setName("id").setDescription("ID du message du giveaway").setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("reroll")
          .setDescription("Relancer un gagnant")
          .addStringOption((o) =>
            o.setName("id").setDescription("ID du message du giveaway").setRequired(true)
          )
      ),

    new SlashCommandBuilder()
        .setName("lockstaff")
        .setDescription("Rendre les salons staff/mod/admin invisibles a tout le monde sauf le role Staff")
        .setDefaultMemberPermissions(ADMIN),

    new SlashCommandBuilder()
        .setName("syncperms")
        .setDescription("Mettre à jour les permissions et le règlement sans recréer les salons")
        .setDefaultMemberPermissions(ADMIN),

      new SlashCommandBuilder()
        .setName("setup")
      .setDescription("Creer toute la structure du serveur")
      .setDefaultMemberPermissions(ADMIN),

    new SlashCommandBuilder()
      .setName("delete")
      .setDescription("Supprimer tous les salons crees par le bot")
      .setDefaultMemberPermissions(ADMIN),

    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Afficher la liste des commandes"),
  ].map((c) => c.toJSON());

  export async function registerSlashCommands(token: string, clientId: string) {
    const rest = new REST().setToken(token);
    try {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      logger.info(`Slash commands enregistrees (${commands.length} commandes) OK`);
    } catch (err) {
      logger.error({ err }, "Impossible d enregistrer les slash commands");
    }
  }
  