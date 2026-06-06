import { REST, Routes } from "discord.js";
import { logger } from "../../lib/logger";

const commands: object[] = [];

export async function registerSlashCommands(token: string, clientId: string) {
  const rest = new REST().setToken(token);
  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    logger.info("Slash commands effacées (0 commandes)");
  } catch (err) {
    logger.error({ err }, "Impossible d'enregistrer les slash commands");
  }
}
