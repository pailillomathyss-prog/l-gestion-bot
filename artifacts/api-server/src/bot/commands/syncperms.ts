import {
    Message,
    EmbedBuilder,
    TextChannel,
    ChannelType,
  } from "discord.js";
  import { sendRulesMessage, ensureMembresRolePermissions } from "../modules/rulesGate";

  export async function syncpermsCommand(message: Message) {
    if (!message.guild) return;

    const progressMsg = await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle("⚙️ Synchronisation en cours...")
          .setDescription("Mise à jour des permissions et du règlement...")
          .setTimestamp(),
      ],
    });

    const guild = message.guild;
    let rulesChannel: TextChannel | null = null;

    // Trouver le salon règles existant
    for (const [, ch] of guild.channels.cache) {
      const name = ch.name.toLowerCase();
      if (
        ch.type === ChannelType.GuildText &&
        (name.includes("règles") || name.includes("regles") ||
         name.includes("règlement") || name.includes("reglement"))
      ) {
        rulesChannel = ch as TextChannel;
        break;
      }
    }

    // Mettre à jour toutes les permissions
    const randomRole = await ensureMembresRolePermissions(guild);

    // Envoyer le règlement dans le salon règles
    let rulesStatus = "❌ Aucun salon contenant \"règles\" dans son nom n'a été trouvé";
    if (rulesChannel) {
      await sendRulesMessage(rulesChannel);
      rulesStatus = `✅ Message envoyé dans ${rulesChannel}`;
    }

    await progressMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(randomRole ? 0x57f287 : 0xffa500)
          .setTitle("✅ Synchronisation terminée")
          .addFields(
            { name: "🔒 Permissions", value: `@everyone bloqué, @Random autorisé sur ${guild.channels.cache.size} salon(s)`, inline: false },
            { name: "📜 Règlement", value: rulesStatus, inline: false },
            { name: "🎭 Rôle @Random", value: randomRole ? "Prêt — les membres l'obtiennent en acceptant le règlement ✅" : "❌ Impossible de créer/trouver le rôle", inline: false },
          )
          .setFooter({ text: "Fais !syncperms à nouveau si tu renommes le salon règles" })
          .setTimestamp(),
      ],
    });

    await message.delete().catch(() => {});
  }
  