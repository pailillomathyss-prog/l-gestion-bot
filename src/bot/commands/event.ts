import { Message, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { launchCustomQuest } from "../modules/questSystem";

const TYPES: Record<string, { type: "messages" | "xp" | "voice_minutes"; unit: string }> = {
  messages: { type: "messages",      unit: "messages" },
  message:  { type: "messages",      unit: "messages" },
  msg:      { type: "messages",      unit: "messages" },
  xp:       { type: "xp",           unit: "XP" },
  vocal:    { type: "voice_minutes", unit: "minutes en vocal" },
  voice:    { type: "voice_minutes", unit: "minutes en vocal" },
  voc:      { type: "voice_minutes", unit: "minutes en vocal" },
};

export async function eventCommand(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;

  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("❌ Tu n'as pas la permission de lancer un événement.").catch(() => {});
    return;
  }

  const usage = [
    "**Usage :** `!event [type] [cible] [récompense] [durée_jours]`",
    "",
    "**Types disponibles :**",
    "• `messages` — nombre de messages à envoyer",
    "• `xp` — XP à gagner",
    "• `vocal` — minutes en vocal",
    "",
    "**Exemple :**",
    "`!event messages 500 1000 7` → Envoie 500 messages, gagne 1000 🪙, durée 7 jours",
    "`!event xp 2000 800 14` → Gagne 2000 XP, gagne 800 🪙, durée 14 jours",
    "`!event vocal 120 600 5` → Passe 120 min en vocal, gagne 600 🪙, durée 5 jours",
  ].join("\n");

  if (args.length < 3) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle("🎯 Lancer un événement").setDescription(usage).setFooter({ text: "MAI•GESTION" })] }).catch(() => {});
    return;
  }

  const typeKey = args[0].toLowerCase();
  const typeInfo = TYPES[typeKey];
  if (!typeInfo) {
    await message.reply(`❌ Type invalide : \`${args[0]}\`\nTypes valides : \`messages\`, \`xp\`, \`vocal\``).catch(() => {});
    return;
  }

  const target = parseInt(args[1]);
  const reward = parseInt(args[2]);
  const duration = args[3] ? parseInt(args[3]) : 7;

  if (isNaN(target) || target <= 0) { await message.reply("❌ La cible doit être un nombre positif.").catch(() => {}); return; }
  if (isNaN(reward) || reward <= 0) { await message.reply("❌ La récompense doit être un nombre positif.").catch(() => {}); return; }
  if (isNaN(duration) || duration <= 0 || duration > 30) { await message.reply("❌ La durée doit être entre 1 et 30 jours.").catch(() => {}); return; }

  const labels: Record<string, string> = {
    messages: `Envoie **${target} messages**`,
    xp:       `Gagne **${target} XP**`,
    voice_minutes: `Passe **${target} minutes en vocal**`,
  };
  const label = labels[typeInfo.type];

  const loading = await message.reply("⏳ Lancement de l'événement...").catch(() => null);

  try {
    await launchCustomQuest(message.guild, typeInfo.type, label, target, reward, duration);
    await loading?.edit(`✅ Événement lancé ! **${label}** — Récompense : **${reward} 🪙** — Durée : **${duration} jour(s)**`).catch(() => {});
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await loading?.edit(`❌ Erreur : ${errMsg}`).catch(() => {});
  }
}
