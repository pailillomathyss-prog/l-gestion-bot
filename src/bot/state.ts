import { setState, getState } from "./modules/db.js";

export async function saveRulesMessageId(guildId: string, messageId: string) {
  await setState(`rules_msg:${guildId}`, messageId);
}

export async function getSavedRulesMessageId(guildId: string): Promise<string | null> {
  return getState(`rules_msg:${guildId}`);
}
