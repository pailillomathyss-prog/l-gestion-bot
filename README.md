# MAI•GESTION — Bot Discord

Bot Discord complet avec modération, XP, jeux, shop, giveaways, dons et plus.

## 🚀 Déploiement sur Railway

### Variables d'environnement requises
| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Token de ton bot Discord |
| `DATABASE_URL` | (Optionnel) URL PostgreSQL — fonctionne sans |

### Démarrage
Railway utilisera automatiquement le `Dockerfile` pour build et lancer le bot.

## ✨ Fonctionnalités

### 🛡️ Modération
- `!ban @membre [raison]` — Bannir
- `!unban [ID]` — Débannir
- `!mute @membre [minutes]` — Muter
- `!demute @membre` — Démuter
- `!lock [#salon]` — Verrouiller un salon
- `!unlock [#salon]` — Déverrouiller
- `!clear [1-100]` — Supprimer des messages
- `!pardon @membre` — Lever une sanction

### ⭐ XP & Niveaux
- Gain automatique sur les messages et en vocal
- 13 jalons de niveau (1, 5, 10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1000)
- Rôles créés automatiquement par le bot
- `!rank [@membre]` — Voir son profil (salon 🌐・cmds)
- `!leaderboard` — Top 10

### 👾 Jeux (salon 👾・jeux — boutons)
- 🪙 **Coin Flip** — Pile ou face (50/50)
- 🎰 **Slots** — Machine à sous (jusqu'à ×20)
- 🃏 **Blackjack** — Bats le croupier
- 🎲 **Duel 1v1** — Défie un membre
- 🎁 **Gacha** — Tire un rôle rare (11 rôles, 6 raretés)

### 🧸 Shop (salon 🧸・shop — boutons)
- Achète des rôles exclusifs avec tes pièces
- Boost d'XP à acheter

### 🎉 Giveaways
- `!giveaway [prix] [durée]` — Ex: `!giveaway Nitro 24h` ou `!giveaway "500 coins" 1h`
- Support des coins (donnés automatiquement) et Nitro

### ❤️ Dons (salon ❤️・dons — bouton)
- Envoie des pièces à n'importe quel membre via un formulaire

### 📅 Daily (salon avec "daily" dans le nom — bouton)
- Récompense quotidienne avec système de streak (×3 max)

### 🎯 Règlement (salon 🎯・règlement — bouton)
- Message interactif avec bouton d'acceptation
- Attribution automatique du rôle ✅・Membre

### 💎 Boosts (salon 💎・boost)
- Annonce automatique des boosts reçus

### 🔕 AFK (salon 🔕・AFK)
- Personne ne peut parler ni écouter (permissions automatiques)
