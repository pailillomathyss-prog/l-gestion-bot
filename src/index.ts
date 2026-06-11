import { createServer } from "node:http";
import { startBot } from "./bot/index.js";
import { logger } from "./lib/logger.js";

const port = Number(process.env["PORT"] ?? 8080);

// Minimal health-check server (required by Replit workflow)
const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", service: "MAI·GESTION Bot" }));
});

server.listen(port, () => {
  logger.info({ port }, "Health server listening");
});

// Start the Discord bot
logger.info("🚀 Démarrage MAI•GESTION...");
startBot().catch(err => {
  logger.error({ err }, "Erreur critique au démarrage du bot");
  process.exit(1);
});
