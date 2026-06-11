import { TextChannel, Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder } from "discord.js";
import { logger } from "../../lib/logger";

/**
 * Trouve, vérifie et rafraîchit un panel.
 * - Si aucun panel bot n'existe → poste.
 * - Si un panel bot existe mais que son premier bouton n'a pas le bon customId → supprime tout et reposte.
 * - Si le panel est déjà correct → ne fait rien.
 *
 * @param ch          Salon cible
 * @param botId       ID du bot
 * @param titleSnippet Fragment du titre de l'embed (ex: "Boutique")
 * @param expectedId  customId exact du premier bouton attendu (ex: "shop_role_aventurier")
 * @param makeEmbed   Fonction qui produit l'EmbedBuilder
 * @param makeRows    Fonction qui produit les ActionRows
 * @param logName     Label pour le logger
 */
export async function ensurePanel(
  ch: TextChannel,
  botId: string,
  titleSnippet: string,
  expectedId: string,
  makeEmbed: () => EmbedBuilder,
  makeRows: () => ActionRowBuilder<ButtonBuilder>[],
  logName: string,
): Promise<void> {
  try {
    const recent = await ch.messages.fetch({ limit: 50 }).catch(() => null);
    if (!recent) return;

    // Cherche tous les messages bot correspondant au panel
    const existing = recent.filter(m =>
      m.author.id === botId && m.embeds[0]?.title?.includes(titleSnippet)
    );

    if (existing.size > 0) {
      const panel = existing.first()!;
      // Vérifier si le premier bouton a le bon customId
      const firstComp = panel.components[0]?.components[0];
      const currentId = firstComp && "customId" in firstComp ? firstComp.customId : null;

      if (currentId === expectedId) {
        // Panel correct, rien à faire
        return;
      }

      // Mauvais IDs → supprime tous les anciens panels du bot dans ce salon
      logger.info(`🔄 ${logName} : panel obsolète détecté (ID: ${currentId ?? "?"}), rafraîchissement...`);
      for (const [, msg] of existing) {
        await msg.delete().catch(() => {});
      }
    }

    // Poste le nouveau panel
    await ch.send({ embeds: [makeEmbed()], components: makeRows() as any });
    logger.info(`✅ ${logName} : panel posté dans #${ch.name}`);
  } catch (err) {
    logger.warn({ err }, `${logName} : impossible de poster le panel`);
  }
}
