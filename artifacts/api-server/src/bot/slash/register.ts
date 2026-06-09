import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { logger } from "../../lib/logger";

const commands = [
  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Affiche la boutique avec ton solde et tes rôles")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Affiche ton solde de pièces")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("postshop")
    .setDescription("(Admin) Poste le panneau boutique avec boutons dans ce salon")
    .setDefaultMemberPermissions("8")
    .toJSON(),
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
