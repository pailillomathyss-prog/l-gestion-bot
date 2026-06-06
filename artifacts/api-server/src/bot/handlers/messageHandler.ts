import { Message } from "discord.js";
import { antiLink } from "../modules/antiLink";

export async function handleMessage(message: Message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  await antiLink(message);
}
