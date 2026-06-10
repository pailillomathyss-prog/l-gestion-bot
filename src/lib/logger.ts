type LogData = Record<string, unknown> | unknown;

function fmt(data: LogData, msg?: string): string {
  const time = new Date().toISOString();
  if (msg) {
    const extra = data && typeof data === "object" && "err" in (data as Record<string, unknown>)
      ? ` — ${(data as Record<string, unknown>).err}`
      : "";
    return `[${time}] ${msg}${extra}`;
  }
  return `[${time}] ${typeof data === "string" ? data : JSON.stringify(data)}`;
}

export const logger = {
  info:  (data: LogData, msg?: string) => console.log("ℹ️ ", fmt(data, msg)),
  warn:  (data: LogData, msg?: string) => console.warn("⚠️ ", fmt(data, msg)),
  error: (data: LogData, msg?: string) => console.error("❌ ", fmt(data, msg)),
  debug: (data: LogData, msg?: string) => console.debug("🔍 ", fmt(data, msg)),
};
