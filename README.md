# guard-system-100s

Un plugin [Claude Code](https://claude.com/claude-code) qui veille, **en permanence**, à ce que ce
qu'on code marche, et soit optimal, cohérent, sûr et fluide : au niveau d'un architecte
expérimenté, sans rien oublier, et sans transformer un petit projet en usine à gaz.

L'ordre des priorités : **d'abord, ça marche**, et c'est prouvé (build, types, tests, parcours
réel essayé) ; **ensuite, c'est optimal et cohérent** (le code le plus court qui fait le travail,
rien d'inutile, rien de réinventé, les conventions du projet suivies) ; **enfin, chaque création
est relue** une fois qu'elle marche, pour voir si elle peut être plus simple.

Il travaille sur quatre étages :

| | Quand | Ce qui se passe |
|:-:|---|---|
| 1 | **Toujours**, sans rien demander | Des règles ajoutées à chaque session (ça marche, optimal et cohérent, relecture, puis secrets, entrées, accès, abus, erreurs, dépendances, fluidité). Un **garde** refuse l'écriture d'une clé d'API dans le code, arrête un `git commit` ou un `git push` qui emporterait un secret, signale à Claude le code à risque (injection SQL, XSS, CORS ouvert, TLS coupé…), et **le relance avant qu'il rende la main** si du code a changé sans preuve qu'il marche, ou pour relire un changement d'une certaine taille. |
| 2 | **Dans un projet en mode guard** | Allumé une fois par `/guard-system-100s -activer`, comme le mode recap : un bloc dans le `CLAUDE.md` du projet donne les règles propres à ses contextes et à sa phase ; après chaque réponse qui a écrit du code, le scanner **repasse seul**, et un nouveau point grave arrive dans la conversation ; un **journal** garde ce qui a été trouvé, corrigé et adapté, avec la notion à retenir. |
| 3 | **À la demande** | `/guard-system-100s` : un scanner qui détecte la stack du projet et ses contextes, puis vérifie ce qui s'applique. `-relire` : la relecture à froid de tout ce qui a changé. |
| 4 | **Aux grands moments** | La revue complète avec un référentiel de **15 domaines et 289 contrôles** : à la conception, avant la mise en ligne, et pour nettoyer le code. |

Un **bandeau** au-dessus de la saisie montre le dernier contrôle du projet et ce que le garde a vu
pendant la session.

## Installer

Sous Windows, macOS ou Linux, il faut [Claude Code](https://claude.com/claude-code) à jour,
[Node.js](https://nodejs.org) 20 ou plus et git.

Dans Claude Code :

```
/plugin marketplace add 100sluca/guard-system-100s
/plugin install guard-system-100s@guard-system-100s
```

Ou dans un terminal :

```bash
claude plugin marketplace add 100sluca/guard-system-100s
claude plugin install guard-system-100s@guard-system-100s
```

Redémarre Claude Code (ou tape `/reload-plugins`). Le garde et les règles marchent tout de suite,
dans tous les projets. Dans un projet qui va durer, `/guard-system-100s -activer` allume son suivi.

## Les commandes

| Tu tapes | Ce que ça fait |
|---|---|
| `/guard-system-100s` | le contrôle rapide : le scanner, puis les corrections proposées |
| `/guard-system-100s -activer` | allume le mode guard du projet : bloc du `CLAUDE.md`, suivi automatique, journal, premier contrôle |
| `/guard-system-100s -phase <phase>` | `conception`, `en cours` ou `en ligne` : les règles du bloc suivent |
| `/guard-system-100s -journal` | le résumé du journal : ce qui a été trouvé, corrigé, adapté, et les notions qui reviennent |
| `/guard-system-100s -desactiver` | éteint le mode : retire le bloc, garde le journal |
| `/guard-system-100s -relire` | la relecture de ce qui a changé : ça marche (prouvé), puis plus simple, plus court, cohérent, sans déchet |
| `/guard-system-100s -audit` | la revue complète, domaine par domaine → `__guard-system-100s/AUDIT.md` |
| `/guard-system-100s -concevoir` | la sécurité dès la conception d'un projet ou d'une fonctionnalité → `CONCEPTION.md` |
| `/guard-system-100s -prod` | la liste avant la mise en ligne, avec un verdict |
| `/guard-system-100s -nettoyer` | le code mort, les dépendances inutiles, la propreté et la fluidité |
| `/guard-system-100s -notion <nom>` | une notion expliquée simplement (rate limiting, idempotency, CSRF…) |
| `/guard-system-100s -installer` | le garde `pre-commit` du projet et les outils facultatifs |

Le dossier `__guard-system-100s/` de chaque projet est ajouté à son `.gitignore` : le rapport liste
les points faibles du projet, il ne doit pas partir dans un dépôt public.

## Le journal d'un projet

En mode guard, `__guard-system-100s/JOURNAL.md` est fait pour être lu : on y comprend ce qui s'est
passé dans le projet et on y apprend les notions une à une. En tête, l'état du jour ; puis les
entrées, la plus récente en bas :

- **Trouvé** (écrit par le scanner) : où, le risque en deux phrases, la correction, et la notion à
  retenir, tirés du référentiel et du glossaire ;
- **Résolu** (le scanner) : le point n'apparaît plus ;
- **Corrigé** (Claude) : une faille réparée, et comment ;
- **Adapté** (Claude) : une règle appliquée en codant, et pourquoi.

Le contrôle automatique n'y note que les bloquants et les importants ; un contrôle lancé à la main
note aussi les conseillés.

## Ce que le garde bloque

- **À l'écriture d'un fichier** : une clé au format connu (Stripe, OpenAI, Anthropic, Google,
  AWS, GitHub, Supabase `service_role` ou `sb_secret_`, Slack, Discord, Shopify, Hugging Face…), un
  mot de passe dans une URL de base de données, un secret affecté en dur à une variable ; une
  variable publique (`VITE_`, `NEXT_PUBLIC_`…) au nom de secret ; la clé admin de Supabase dans du
  code navigateur ; un `.env` que git n'ignore pas.
- **Avant `git commit`** : les secrets de ce qui est indexé (y compris avec `git commit -a` ou
  `git add … && git commit`), et tout fichier de secrets indexé.
- **Avant `git push`** : les secrets des commits pas encore poussés.
- **`git add .env`**, nommément.

Il **signale** à Claude, sans bloquer, le code à risque : requête SQL construite avec des
variables, commande shell construite avec des variables, `eval`, HTML inséré tel quel, TLS
désactivé, md5 pour un mot de passe, `Math.random` pour un jeton, JWT non vérifié, CORS ouvert,
mode debug, cookie lisible par JavaScript, secret dans les journaux, erreur avalée en silence,
URL en `http://`.

**Avant de rendre la main**, si du code a changé pendant le tour, il relance Claude une fois :
pour prouver que ça marche quand rien n'a tourné depuis la dernière modification (build, types,
tests, script lancé, page ouverte), et pour relire le diff en architecte quand le changement
dépasse une trentaine de lignes. La documentation et les brouillons du dossier temporaire ne
comptent pas.

**Une fausse alerte ?** Une valeur publique ou factice se marque `guard:ignore` en commentaire sur
sa ligne. Claude ne le fait qu'avec ton accord. Les marques des outils voisins (`nosec`,
`noqa: S…`, `gitleaks:allow`, `pragma: allowlist secret`) valent aussi.

## Le référentiel

`plugin/skills/guard-system-100s/references/` : chaque contrôle dit pourquoi il compte, où
regarder, comment corriger, et à partir de quand il vaut le coup.

| Préfixe | Domaine |
|---|---|
| SEC | Secrets et configuration |
| IAM | Identité, connexion, droits d'accès |
| INJ | Entrées hostiles et injections |
| WEB | Sécurité côté navigateur |
| API | API, abus, appels sortants et coûts |
| BDD | Base de données et intégrité |
| NET | Chiffrement, réseau et protocoles |
| ASY | Tâches de fond, files, systèmes distribués |
| PERF | Performance, montée en charge, fluidité de l'interface |
| LIV | Livraison, déploiement, dépendances |
| OBS | Journaux, métriques, alertes, incidents |
| REP | Sauvegardes, reprise, tolérance aux pannes |
| QUA | Qualité, code mort, tests, lisibilité |
| IA | Applications qui utilisent une IA |
| LEG | RGPD, cookies, obligations légales |

`plugin/skills/guard-system-100s/NOTIONS.md` est le glossaire : 318 notions, chacune en deux
phrases simples, avec les contrôles qui la mettent en pratique.

## Le scanner seul

```bash
node plugin/skills/guard-system-100s/audit.mjs <projet>
```

Options : `--json`, `--ecrire` (écrit `__guard-system-100s/audit.json`), `--historique` (tout
l'historique git), `--sans-reseau` (sans `npm audit`), `--staged` / `--push` (le contrôle d'avant
commit ou push), `--installer-git` (le pose en `pre-commit` dans le dépôt). Code de sortie 1 s'il
y a un bloquant.

## Mettre à jour, retirer

```
/plugin marketplace update guard-system-100s
/plugin update guard-system-100s@guard-system-100s
/plugin uninstall guard-system-100s@guard-system-100s
```

Une session déjà ouverte garde la version qu'elle a chargée à son ouverture : la mise à jour vaut
pour les sessions suivantes.

Pour modifier le plugin, clone le dépôt et ajoute le dossier comme marketplace
(`claude plugin marketplace add <dossier du clone>`) : Claude Code le lit alors directement, et
une modification s'applique après `/reload-plugins`.

## Licence

MIT
