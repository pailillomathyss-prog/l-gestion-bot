import { Client, Guild, TextChannel, ChannelType, EmbedBuilder } from "discord.js";
import { logger } from "../../lib/logger";
import { getState, setState } from "./db";

export type WeatherType = "pluvieux" | "nuageux" | "ensoleille" | "orageux";

interface WeatherInfo {
  emoji: string;
  label: string;
  description: string;
  xpMultiplier: number;
  coinsMultiplier: number;
  color: number;
}

export const WEATHER_TABLE: Record<WeatherType, WeatherInfo> = {
  pluvieux:   { emoji: "🌧️", label: "Pluvieux",   description: "L'activité est au ralenti... XP et pièces réduits de **10%**.",       xpMultiplier: 0.9,  coinsMultiplier: 0.9,  color: 0x778ca3 },
  nuageux:    { emoji: "⛅",  label: "Nuageux",    description: "Le serveur est calme. Gains **normaux**.",                              xpMultiplier: 1.0,  coinsMultiplier: 1.0,  color: 0x95afc0 },
  ensoleille: { emoji: "☀️", label: "Ensoleillé", description: "Bonne activité ! XP et pièces **+15%**.",                               xpMultiplier: 1.15, coinsMultiplier: 1.15, color: 0xf9ca24 },
  orageux:    { emoji: "⚡",  label: "Orageux",    description: "Le serveur est en feu ! XP et pièces **+30%** !! 🔥",                  xpMultiplier: 1.3,  coinsMultiplier: 1.3,  color: 0x6c5ce7 },
};

let msgCount24h = 0;
let periodStart = Date.now();
const MSG_WINDOW = 24 * 60 * 60 * 1000;

let currentWeather: WeatherType = "nuageux";

export function recordMessage(): void {
  const now = Date.now();
  if (now - periodStart > MSG_WINDOW) {
    msgCount24h = 0;
    periodStart = now;
  }
  msgCount24h++;
}

export function getXPMultiplier(): number {
  return WEATHER_TABLE[currentWeather].xpMultiplier;
}

export function getCoinsMultiplier(): number {
  return WEATHER_TABLE[currentWeather].coinsMultiplier;
}

export function getCurrentWeather(): WeatherType {
  return currentWeather;
}

function computeWeather(count: number): WeatherType {
  if (count < 20) return "pluvieux";
  if (count < 60) return "nuageux";
  if (count < 150) return "ensoleille";
  return "orageux";
}

function findBoostChannel(guild: Guild): TextChannel | null {
  return (guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      (c.name.toLowerCase().includes("boost") || c.name.includes("🌤️"))
  ) as TextChannel) ?? null;
}

function buildWeatherEmbed(weather: WeatherType, count: number): EmbedBuilder {
  const info = WEATHER_TABLE[weather];
  const nextUpdate = periodStart + MSG_WINDOW;
  return new EmbedBuilder()
    .setColor(info.color)
    .setTitle(`${info.emoji} Météo du serveur — ${info.label}`)
    .setDescription(info.description)
    .addFields(
      { name: "📊 Messages (24h)",           value: `**${count}**`,                                        inline: true },
      { name: "⚡ Multiplicateur XP",        value: `**×${info.xpMultiplier.toFixed(2)}**`,                inline: true },
      { name: "🪙 Multiplicateur pièces",    value: `**×${info.coinsMultiplier.toFixed(2)}**`,             inline: true },
      { name: "🔄 Prochaine màj",            value: `<t:${Math.floor(nextUpdate / 1000)}:R>`,              inline: false },
    )
    .setFooter({ text: "MAI•GESTION • Plus le serveur est actif, plus les gains augmentent !" })
    .setTimestamp();
}

async function postOrUpdateWeather(guild: Guild): Promise<void> {
  const ch = findBoostChannel(guild);
  if (!ch) { logger.warn(`Salon boost introuvable sur ${guild.name}`); return; }

  const newWeather = computeWeather(msgCount24h);
  currentWeather = newWeather;

  const savedId = await getState(`weather_msg:${guild.id}`).catch(() => null);
  if (savedId) {
    const existing = await ch.messages.fetch(savedId).catch(() => null);
    if (existing) {
      await existing.edit({ embeds: [buildWeatherEmbed(newWeather, msgCount24h)] }).catch(() => {});
      return;
    }
  }

  // Post fresh message
  const msg = await ch.send({ embeds: [buildWeatherEmbed(newWeather, msgCount24h)] }).catch(() => null);
  if (msg) await setState(`weather_msg:${guild.id}`, msg.id).catch(() => {});
}

export async function updateWeather(client: Client): Promise<void> {
  const now = Date.now();
  if (now - periodStart > MSG_WINDOW) { msgCount24h = 0; periodStart = now; }
  currentWeather = computeWeather(msgCount24h);

  for (const [, guild] of client.guilds.cache) {
    await postOrUpdateWeather(guild).catch((err) =>
      logger.warn({ err }, `Erreur météo sur ${guild.name}`)
    );
  }
  logger.info(`🌤️ Météo mise à jour : ${WEATHER_TABLE[currentWeather].emoji} ${WEATHER_TABLE[currentWeather].label} (${msgCount24h} msgs/24h)`);
}

export async function initWeather(client: Client): Promise<void> {
  await updateWeather(client);

  // Mise à jour toutes les heures
  setInterval(() => updateWeather(client).catch(() => {}), 60 * 60 * 1000);

  // Réinitialiser le compteur toutes les 24h
  setInterval(() => {
    msgCount24h = 0;
    periodStart = Date.now();
  }, MSG_WINDOW);

  logger.info("🌤️ Weather system actif (mise à jour toutes les heures)");
}
