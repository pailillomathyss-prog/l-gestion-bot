import { Message, EmbedBuilder, TextChannel, ChannelType } from "discord.js";
import { sendRulesMessage, ensureMembresRolePermissions } from "../modules/rulesGate";

export async function syncpermsCommand(message: Message) {
  if (!message.guild) return;
  const guild = message.guild;

  const progressMsg = await message.channel.send({
    embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("⚙️ Synchronisation en cours...").setTimestamp()],
  });

  let rulesChannel: TextChannel | null = null;
  for (const [, ch] of guild.channels.cache) {
    const n = ch.name.toLowerCase();
    if (
      ch.type === ChannelType.GuildText &&
      (n.includes("regles") || n.includes("reglements") || n.includes("rules"))
    ) {
      rulesChannel = ch as TextChannel;
      break;
    }
  }

  const randomRole = await ensureMembresRolePermissions(guild);

  let rulesStatus = "Aucun salon contenant regles/rules trouve";
  if (rulesChannel) {
    await sendRulesMessage(rulesChannel);
    rulesStatus = "Message envoye dans #" + rulesChannel.name;
  }

  await progressMsg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(randomRole ? 0x57f287 : 0xffa500)
        .setTitle("✅ Synchronisation terminee")
        .addFields(
          { name: "🔒 Permissions", value: "@everyone bloque, @Random autorise sur tous les salons", inline: false },
          { name: "📜 Reglement", value: rulesStatus, inline: false },
          { name: "🎭 Role @Random", value: randomRole ? "Pret" : "Erreur creation role", inline: false }
        )
        .setTimestamp(),
    ],
  });

  await message.delete().catch(() => {});
}