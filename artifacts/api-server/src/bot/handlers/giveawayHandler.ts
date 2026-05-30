import { MessageReaction, User, PartialMessageReaction, PartialUser } from "discord.js";
import { giveaways } from "../index";

export async function handleGiveawayReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  action: "add" | "remove"
) {
  if (user.bot) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }

  const gw = giveaways.get(reaction.message.id);
  if (!gw || gw.ended) return;

  if (action === "add") {
    gw.participants.add(user.id);
  } else {
    gw.participants.delete(user.id);
  }

  giveaways.set(reaction.message.id, gw);
}
