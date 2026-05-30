# Déploiement du bot L-Gestion sur Railway

Railway offre **$5/mois de crédit gratuit** — largement suffisant pour faire tourner un bot Discord 24h/24.

---

## Étape 1 — Pousser le code sur GitHub

1. Va sur [github.com](https://github.com) → **New repository** → Crée un dépôt (ex: `l-gestion-bot`)
2. Dans Replit, ouvre l'onglet **Git** (icône branche en haut à gauche)
3. Connecte ton compte GitHub et pousse le code sur ton nouveau dépôt

---

## Étape 2 — Créer un projet Railway

1. Va sur [railway.app](https://railway.app) → **Login with GitHub**
2. Clique **New Project** → **Deploy from GitHub repo**
3. Sélectionne ton dépôt `l-gestion-bot`
4. Railway détecte automatiquement le `Dockerfile` ✅

---

## Étape 3 — Ajouter la variable d'environnement

Dans Railway, ouvre ton service → onglet **Variables** → ajoute :

| Clé | Valeur |
|-----|--------|
| `DISCORD_TOKEN` | *(ton token Discord)* |

---

## Étape 4 — Déployer

1. Clique **Deploy** → Railway build et lance le bot automatiquement
2. Va dans l'onglet **Logs** pour voir le bot se connecter :
   ```
   Bot connecté en tant que L-Gestion#1523
   Slash commands enregistrées (8 commandes) ✅
   ```

---

## Infos importantes

- **Redémarrage automatique** : si le bot plante, Railway le relance tout seul
- **Mises à jour** : à chaque `git push`, Railway redéploie automatiquement
- **Logs** : accessibles en temps réel dans l'onglet Logs de Railway
- **bot-state.json** : les IDs des messages règlement/rôles sont sauvegardés — le bot ne renvoie pas de doublons entre les redémarrages. Un redéploiement complet (nouveau push) réinitialise le fichier, supprime manuellement les anciens messages du bot avant de redéployer si besoin.
