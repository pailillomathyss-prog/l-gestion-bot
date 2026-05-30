import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STATE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "bot-state.json"
);

interface BotState {
  rulesMessages: Record<string, string>;
  roleSelectorMessages: Record<string, string>;
}

function load(): BotState {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    }
  } catch {}
  return { rulesMessages: {}, roleSelectorMessages: {} };
}

function save(state: BotState) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {}
}

export function getSavedRulesMessageId(guildId: string): string | null {
  return load().rulesMessages[guildId] ?? null;
}

export function getSavedRoleSelectorMessageId(guildId: string): string | null {
  return load().roleSelectorMessages[guildId] ?? null;
}

export function saveRulesMessageId(guildId: string, messageId: string) {
  const state = load();
  state.rulesMessages[guildId] = messageId;
  save(state);
}

export function saveRoleSelectorMessageId(guildId: string, messageId: string) {
  const state = load();
  state.roleSelectorMessages[guildId] = messageId;
  save(state);
}
