import { getState, setState } from "./modules/db";

export async function getSavedRulesMessageId(guildId: string): Promise<string | null> {
  return getState(`rules_msg:${guildId}`);
}

export async function saveRulesMessageId(guildId: string, msgId: string): Promise<void> {
  await setState(`rules_msg:${guildId}`, msgId);
}
