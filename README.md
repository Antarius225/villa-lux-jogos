# ☀️ Jogos da Villa Lux

Page web statique pour compter les points de notre compétition multisports de vacances à la **Villa Lux, au Portugal**. Les scores sont **partagés en direct** : tout le monde ouvre le lien et voit le classement se mettre à jour, seuls les arbitres (qui connaissent le code) peuvent saisir.

## Disciplines

| | Discipline | Format | Meilleur résultat |
|---|---|---|---|
| 🤿 | Apnée | Nombre de longueurs de piscine (demi-longueurs acceptées) | Le plus grand nombre |
| ⚪ | Pastis-Pétanque | Matchs en 13 points (tête-à-tête, doublette, triplette) | Victoires, puis différence de points |
| 🏸 | Badminton | Matchs en 10 points (simple ou double) | Victoires, puis différence de points |
| 🏓 | Ping-pong | Matchs en 10 points (simple ou double) | Victoires, puis différence de points |
| 💍 | Chasse aux anneaux | Temps pour remonter tous les anneaux (chrono intégré) | Le plus rapide |

## Barème du classement général

Dans chaque discipline, le 1er marque **N points** (N = nombre d'inscrits), le 2e **N − 1**, etc.
Les ex æquo partagent la même place. Sans résultat dans une discipline : 0 point.
En cas d'égalité au total, on départage au nombre de disciplines gagnées.

## Utilisation

- **Spectateurs** : ouvrir le lien, c'est tout. Le point vert « En direct » indique la connexion.
- **Arbitres** : bouton **🔑 Arbitrer** puis le code arbitre. Le mode arbitre reste actif sur ce téléphone jusqu'à « Quitter ».
- Onglet **Inscriptions** : ajouter les participants (plusieurs à la fois en les séparant par des virgules).
- Saisir les résultats dans chaque onglet de discipline ; le classement se met à jour chez tout le monde.
- **Exporter** télécharge une sauvegarde JSON ; **Importer** la restaure.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Page et thème |
| `app.js` | Logique : inscriptions, scores, classements, synchro |
| `firebase-config.js` | Configuration Firebase (vide = mode local, scores sur l'appareil) |
| `database.rules.json` | Règles de sécurité de la Realtime Database |

## Mise en place de Firebase

1. Créer un projet sur [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication** → activer le fournisseur **Anonyme** ; ajouter le domaine GitHub Pages aux domaines autorisés.
3. **Realtime Database** → créer la base (mode verrouillé), coller `database.rules.json` dans l'onglet **Règles** et publier.
4. Onglet **Données** : créer `secret/code` = le code arbitre (de préférence avec des lettres). Ce nœud n'est lisible par personne.
5. **Paramètres du projet** → ajouter une application Web et recopier `firebaseConfig` (avec `databaseURL`) dans `firebase-config.js`.

La configuration Web de Firebase n'est pas secrète : la sécurité repose sur les règles. Les scores (`jogos`) sont lisibles par tous ceux qui ont le lien ; l'écriture exige d'avoir validé le code arbitre.

## Personnaliser

Les disciplines (nom, nombre de points d'un match, unité…) sont définies en haut de `app.js` dans le tableau `DISCIPLINES`, par exemple pour passer la pastis-pétanque en 11 points : `cible: 11`.

Boas férias ! 🇵🇹
