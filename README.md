# ☀️ Jogos da Villa Lux

Page web statique pour compter les points de notre compétition multisports de vacances à la **Villa Lux, au Portugal**.

## Disciplines

| | Discipline | Format | Meilleur résultat |
|---|---|---|---|
| 🤿 | Apnée | Nombre de longueurs de piscine (demi-longueurs acceptées) | Le plus grand nombre |
| ⚪ | Pétanque | Matchs en 13 points (tête-à-tête, doublette, triplette) | Victoires, puis différence de points |
| 🏸 | Badminton | Matchs en 10 points (simple ou double) | Victoires, puis différence de points |
| 🏓 | Ping-pong | Matchs en 10 points (simple ou double) | Victoires, puis différence de points |
| 💍 | Chasse aux anneaux | Temps pour remonter tous les anneaux (chrono intégré) | Le plus rapide |

## Barème du classement général

Dans chaque discipline, le 1er marque **N points** (N = nombre d'inscrits), le 2e **N − 1**, etc.
Les ex æquo partagent la même place. Sans résultat dans une discipline : 0 point.
En cas d'égalité au total, on départage au nombre de disciplines gagnées.

## Utilisation

- Ouvrir `index.html` dans un navigateur (ou la version GitHub Pages du dépôt).
- Onglet **Inscriptions** : ajouter les participants (plusieurs à la fois en les séparant par des virgules).
- Saisir les résultats dans chaque onglet de discipline ; le classement se met à jour tout seul.
- Les données sont enregistrées dans le navigateur (`localStorage`). Utiliser **Exporter / Importer** pour sauvegarder ou transférer les scores vers un autre téléphone. Idéalement, un seul appareil « arbitre » fait foi.

## Personnaliser

Tout tient dans un seul fichier, `index.html`. Les disciplines (nom, nombre de points d'un match, unité…) sont définies en haut du script dans le tableau `DISCIPLINES`, par exemple pour passer la pétanque en 11 points : `cible: 11`.

Boas férias ! 🇵🇹
