# Le référentiel guard-system-100s

Quinze domaines, un fichier chacun, 289 contrôles (52 bloquants, 143 importants, 94 conseillés,
dont 21 réservés à l'`échelle`). Ensemble, ils couvrent ce qu'un architecte expérimenté vérifie
avant de dire « ça marche, c'est sûr, propre et prêt ». Chaque contrôle a un identifiant stable (préfixe du
domaine + numéro) que reprennent les rapports d'audit : on ne renumérote jamais, on ajoute à la fin.

| N° | Fichier | Préfixe | Domaine |
|:-:|---|---|---|
| 01 | `01-secrets.md` | SEC | Secrets et configuration |
| 02 | `02-identite-acces.md` | IAM | Identité, connexion, droits d'accès |
| 03 | `03-entrees-injections.md` | INJ | Entrées hostiles et injections |
| 04 | `04-navigateur-web.md` | WEB | Sécurité côté navigateur |
| 05 | `05-api-abus-couts.md` | API | API, abus, appels sortants et coûts |
| 06 | `06-donnees-bdd.md` | BDD | Base de données et intégrité |
| 07 | `07-chiffrement-reseau.md` | NET | Chiffrement, réseau et protocoles |
| 08 | `08-asynchrone-distribue.md` | ASY | Tâches de fond, files, systèmes distribués |
| 09 | `09-performance-interface.md` | PERF | Performance, montée en charge, fluidité de l'interface |
| 10 | `10-livraison-dependances.md` | LIV | Livraison, déploiement, dépendances |
| 11 | `11-observabilite-incidents.md` | OBS | Journaux, métriques, alertes, incidents |
| 12 | `12-resilience-reprise.md` | REP | Sauvegardes, reprise, tolérance aux pannes |
| 13 | `13-qualite-code.md` | QUA | Qualité, code mort, tests, lisibilité |
| 14 | `14-ia-llm.md` | IA | Applications qui utilisent une IA |
| 15 | `15-vie-privee-legal.md` | LEG | RGPD, cookies, obligations légales |

`../NOTIONS.md` est le glossaire : 318 notions, chacune en deux phrases simples, avec les contrôles
qui la mettent en pratique.

## Gravité

| Gravité | Ce que ça veut dire |
|---|---|
| `bloquant` | Faille exploitable, perte de données probable, ou code qui ne marche pas. On ne met pas en ligne avec. |
| `important` | À corriger avant d'avoir de vrais utilisateurs, ou tout de suite si on en a déjà. |
| `conseillé` | Pratique de pro qui évite les ennuis futurs. À faire quand c'est simple ou au prochain passage. |

## Contextes : quand un contrôle s'applique

Un contrôle ne vaut que pour les projets qui ont son contexte. Un site vitrine n'a ni comptes ni
base de données : les contrôles `comptes` et `bdd` ne le concernent pas. C'est ce qui évite de
transformer un petit projet en usine à gaz.

| Contexte | Le projet… |
|---|---|
| `tout` | n'importe quel projet de code |
| `web` | a une interface dans un navigateur |
| `api` | a un serveur ou des fonctions qui répondent à des requêtes (API, routes, Edge Functions, Workers, Apps Script publié) |
| `comptes` | a des utilisateurs qui se connectent |
| `bdd` | a une base de données |
| `perso` | manipule des données personnelles (e-mail, nom, adresse, téléphone, santé…) |
| `paiement` | encaisse de l'argent, ou appelle des services payants à l'usage |
| `ia` | appelle un modèle d'IA, ou expose un agent, des outils, un serveur MCP |
| `fichiers` | accepte des fichiers envoyés par des utilisateurs |
| `async` | a des tâches en arrière-plan : files de messages, cron, webhooks, workers |
| `prod` | est en ligne, ou va l'être |
| `équipe` | est développé à plusieurs, ou reçoit des contributions |
| `échelle` | a, ou vise, beaucoup de trafic, plusieurs serveurs ou plusieurs régions |

**`échelle` veut dire : savoir que ça existe, ne pas le mettre en place avant d'en avoir besoin.**
Kubernetes, sharding, multi-région ou élection de leader coûtent cher en complexité ; les
installer « au cas où » est une erreur d'architecte, pas une preuve de sérieux (YAGNI).

## Format d'un contrôle

```markdown
### SEC-01 · Ce qui doit être vrai, en une ligne
`bloquant` · `tout`

**Pourquoi** — le risque en mots simples, avec un exemple concret d'attaque ou de panne.
**Vérifier** — où regarder et quoi chercher : fichiers, motifs, commande, réglage du fournisseur.
**Corriger** — la bonne façon de faire, précise, avec un court extrait de code quand ça aide.
**Piège** — (facultatif) l'erreur classique, même chez les pros.
**Notions** — les notions du glossaire concernées, avec leur nom exact dans NOTIONS.md.
```

Un contrôle dont le scanner `audit.mjs` sait vérifier une partie porte la mention
`auto` dans sa ligne d'étiquettes : le scanner le signale, la revue humaine confirme.
