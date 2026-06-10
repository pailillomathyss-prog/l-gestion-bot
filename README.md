# MAI•GESTION — Bot Discord

Bot Discord complet : modération, XP/niveaux, jeux, shop, giveaways, dons, AFK, boosts.

## 🚀 Déploiement Railway

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Token de ton bot Discord |
| `DATABASE_URL` | (Optionnel) PostgreSQL — fonctionne en RAM sans |

## ✨ Fonctionnalités

### 🛡️ Modération (admins, prefix `!`)
`!ban`, `!unban`, `!mute [minutes]`, `!demute`, `!lock`, `!unlock`

### 🎯 Règlement (bouton dans 🎯・règlement)
Message automatique avec bouton "J'accepte" → rôle ✅ Membre (créé automatiquement)

### ⭐ XP & Niveaux (automatique)
- Messages : 10–20 XP/min, Voice : 15 XP/5min
- Niveaux 1–1000 avec 14 rôles jalons créés automatiquement
- `!rank [@membre]` — uniquement dans 🌐・cmds

### 👾 Jeux (boutons dans 👾・jeux)
🪙 Coin Flip | 🎰 Slots (×20 max) | 🃏 Blackjack | 🎲 Duel 1v1 | 🎁 Gacha (11 rôles, 6 raretés)

### 🧸 Shop (boutons dans le salon shop/boutique)
Rôles exclusifs (500–20 000 🪙) + boosts XP

### 🎉 Giveaways (`!giveaway [durée] [prix]`)
Coins → donnés automatiquement | Nitro → annoncé, à remettre manuellement

### ❤️ Dons (bouton dans ❤️・dons)
Transfert de pièces via modal (ID destinataire + montant)

### 🔕 AFK
Personne ne peut parler ni écouter (configuré automatiquement)

### 💎 Boost
Annonces automatiques dans 💎・boost
