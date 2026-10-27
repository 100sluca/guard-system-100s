# 10 · Livraison, déploiement, dépendances (LIV)

Livrer, c'est faire passer le code de ton ordinateur aux utilisateurs. Deux idées tiennent tout le
domaine : **ce qui part en production est reproductible** (mêmes dépendances, même construction, à
chaque fois) et **chaque mise en ligne est réversible** en une minute. Docker, Kubernetes, Terraform
ou canary ne sont que des moyens, à prendre quand le projet en a besoin. Côté dépendances, chaque
paquet installé est du code écrit par un inconnu qui s'exécute avec tes droits : on en ajoute peu,
on vérifie d'où il vient, on fige sa version.

---

### LIV-01 · Chaque paquet ajouté existe vraiment, et c'est le bon
`bloquant` · `tout`

**Pourquoi** — Installer un paquet exécute souvent du code tout de suite (LIV-07) : un mauvais nom
suffit à se faire voler ses clés. Le **typosquatting** parie sur une faute de frappe (`expres`,
`reqeusts`). Le **slopsquatting** vise les IA : un modèle invente un nom plausible qui n'existe pas,
et des attaquants enregistrent ces noms avec du code malveillant. Une étude de 2025 sur 576 000
extraits de code générés a trouvé que près de 20 % des paquets recommandés n'existaient pas. En
2023, un chercheur a publié un paquet vide sous un nom inventé par une IA (`huggingface-cli`) : plus
de 30 000 téléchargements en trois mois.
**Vérifier** — Pour chaque nouvelle ligne de `package.json`, `requirements.txt` ou `pyproject.toml`,
surtout si une IA l'a proposée : la page existe sur npmjs.com ou pypi.org ; le nom est exactement
celui de la documentation officielle ; le dépôt lié est le bon ; le paquet a un passé (date de
création, versions, téléchargements). `npm view <nom> repository.url time.created` donne l'essentiel.
**Corriger** — Copier la commande d'installation depuis la documentation officielle de l'outil, pas
depuis une réponse d'IA ni un tutoriel. Si l'IA propose un paquet inconnu, demander le lien officiel
et l'ouvrir soi-même. Un paquet créé il y a quelques jours, sans dépôt, au nom proche d'un paquet
célèbre : ne pas l'installer. Socket (socket.dev) signale les paquets suspects avant installation.
**Piège** — Se fier à un nom « qui a l'air officiel ». `@supabase/supabase-js` l'est ; un
`supabase-js-client` ne l'est pas forcément. Un préfixe `@organisation/` n'est utilisable que par son
propriétaire : bon signal, à condition que ce soit le bon propriétaire.
**Notions** — Supply chain, Typosquatting, Slopsquatting

---

### LIV-02 · Aucun workflow n'exécute le code d'une PR avec des secrets, et chacun a des permissions minimales
`bloquant` · `tout` · `auto`

**Pourquoi** — Un workflow GitHub Actions tourne avec un jeton (`GITHUB_TOKEN`) et souvent tes
secrets. Le déclencheur `pull_request_target` s'exécute dans le contexte de **ton** dépôt, avec ses
secrets et un jeton qui peut écrire, même pour une PR venue d'un inconnu. Si le workflow récupère et
lance le code de la PR (checkout de `github.event.pull_request.head.sha`, puis `npm install` ou
`npm test`), l'inconnu exécute ce qu'il veut avec tes secrets.
**Vérifier** — `node audit.mjs` (signale `pull_request_target`). Dans `.github/workflows/*.yml` :
`pull_request_target` ou `workflow_run` suivis d'un checkout du code de la PR ; pas de bloc
`permissions:` (selon l'ancienneté du compte ou de l'organisation, le jeton par défaut peut écrire) ;
`permissions: write-all` ; `${{ github.event.* }}` (titre, corps, nom de branche) collé dans un
`run:`, qui permet d'injecter une commande. Réglage : Settings → Actions → General → Workflow
permissions → lecture seule.
**Corriger** — Tester les PR avec `pull_request` (les forks n'y reçoivent pas les secrets). Garder
`pull_request_target` pour ce qui ne touche pas au code de la PR (étiqueter, commenter).
```yaml
permissions:
  contents: read          # en tête du fichier ; un job qui doit écrire le déclare lui-même
steps:
  - run: echo "$TITRE"    # une valeur venue de l'extérieur passe par env, jamais dans le script
    env:
      TITRE: ${{ github.event.pull_request.title }}
```
`zizmor` (analyseur de workflows) repère ces défauts en une commande.
**Piège** — Croire le sujet clos depuis décembre 2025 : GitHub prend désormais toujours le workflow
de la branche par défaut pour `pull_request_target`, ce qui ferme une variante, pas le danger
principal.
**Notions** — CI/CD, Supply chain, Principe du moindre privilège

---

### LIV-03 · Le lockfile est commité, et la CI comme le déploiement installent exactement ce qu'il contient
`important` · `tout` · `auto`

**Pourquoi** — `package.json` dit « Express 5.1 ou plus récent dans la même version majeure ». Le
**lockfile** note la version exacte de chaque paquet, dépendances des dépendances comprises, avec une
empreinte de contrôle. Sans lui, deux installations à une heure d'écart donnent deux applications
différentes : un bug « qui marche chez moi », ou une version piégée publiée entre-temps qui part en
prod.
**Vérifier** — `node audit.mjs` (absence de lockfile). Un lockfile commité (`package-lock.json`,
`pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `uv.lock`, `poetry.lock`) et absent du `.gitignore` ; un
seul gestionnaire par projet (pas de `package-lock.json` à côté d'un `pnpm-lock.yaml`) ; la CI et le
Dockerfile utilisent la commande stricte.
**Corriger** — Sur sa machine, on ajoute un paquet ; partout ailleurs, on installe en mode strict :
| Outil | Installation reproductible |
|---|---|
| npm | `npm ci` (échoue si lockfile et `package.json` divergent) |
| pnpm | `pnpm install --frozen-lockfile` |
| Yarn 2+ | `yarn install --immutable` |
| Bun | `bun install --frozen-lockfile` |
| uv | `uv sync --locked` |
| pip | `requirements.txt` aux versions exactes (`uv pip compile` ou `pip-compile`), installé avec `--require-hashes` si les empreintes sont générées |

**Piège** — Supprimer le lockfile pour « réparer » une installation qui coince : on remplace d'un
coup des centaines de versions testées par les dernières parues. On règle le conflit (LIV-14).
**Notions** — Lockfile, Supply chain, Dependency Hell

---

### LIV-04 · Aucune dépendance en version `*`, `latest` ou sans borne supérieure
`important` · `tout` · `auto`

**Pourquoi** — `"lodash": "*"` ou `"latest"` accepte toute future version : une version majeure qui
casse l'API, ou une version piégée. Même avec un lockfile, la prochaine mise à jour ou une
installation sans lockfile prend ce qui vient de sortir.
**Vérifier** — `node audit.mjs`. Dans `package.json` : `"*"`, `"latest"`, `"x"`, `">=1.0.0"` sans
borne, dépendance git sans commit (`github:user/repo`). En Python : lignes sans version dans
`requirements.txt`, `>=` seul pour une application. Images `:latest` (LIV-12), actions `@main`
(LIV-06).
**Corriger** — Plages bornées dans `package.json` (`^5.1.0`, voir LIV-14) et versions exactes dans
le lockfile ; dépendance git épinglée (`github:user/repo#<sha>`). Une application Python fige ses
versions (`==`) par le lockfile ; seule une bibliothèque publiée garde des plages larges, mais
bornées.
**Notions** — Semantic Versioning, Lockfile

---

### LIV-05 · Les vulnérabilités connues des dépendances sont détectées et traitées
`important` · `tout` · `auto`

**Pourquoi** — Une vulnérabilité publiée (une CVE) dans une dépendance est une porte d'entrée
documentée : les attaquants lisent les mêmes bulletins que toi et cherchent les sites qui utilisent
la version touchée.
**Vérifier** — `node audit.mjs` (lance `npm audit`). Selon la stack : `npm audit --omit=dev` (ce qui
part en prod d'abord), `pnpm audit`, `pip-audit`, ou `osv-scanner scan source -r .` (tous langages,
lit les lockfiles du dépôt, `uv.lock` compris). Sur GitHub : Settings → Code security → Dependabot
alerts.
**Corriger** — Activer les alertes Dependabot et les « security updates » (PR de correctif
automatiques). Pour chaque alerte : la version corrigée est-elle compatible (`npm audit fix`) ? Le
code vulnérable est-il vraiment exécuté ? Une faille critique dans du code exécuté en prod se traite
comme `bloquant` ; une faille dans un outil de développement attend la prochaine mise à jour. Sans
correctif disponible : `overrides` (npm, pnpm) ou `resolutions` (Yarn) pour forcer une
sous-dépendance corrigée, ou changer de paquet. Dans la CI (LIV-08) :
```yaml
- run: npm audit --omit=dev --audit-level=high
```
**Piège** — `npm audit fix --force` installe des versions majeures sans prévenir et casse
l'application. C'est une proposition à lire, pas un bouton.
**Notions** — Supply chain, Semantic Versioning

---

### LIV-06 · Les actions GitHub tierces sont épinglées par SHA de commit
`important` · `tout` · `auto`

**Pourquoi** — `uses: auteur/action@v4` pointe vers une étiquette (tag) que son auteur, ou un
attaquant qui a pris son compte, peut déplacer à tout moment vers un autre code. En mars 2025, les
étiquettes de `tj-actions/changed-files` ont été déplacées vers un commit malveillant qui écrivait
les secrets des workflows dans leurs journaux, publics pour les dépôts publics. Un SHA de commit
(40 caractères) désigne un code précis, qui ne peut plus changer.
**Vérifier** — `node audit.mjs`. Dans `.github/workflows/` : chaque `uses:` finit par un SHA
complet, pas par `@v4`, `@main` ou `@master`.
**Corriger** —
```yaml
- uses: tj-actions/changed-files@<SHA de 40 caractères>  # v46.0.1
```
Le commentaire garde la version lisible ; Dependabot (`package-ecosystem: github-actions`) et
Renovate mettent à jour SHA et commentaire ; `pinact run` épingle tout un dossier d'un coup. Les
actions officielles `actions/*` sont moins exposées ; les épingler aussi reste la règle la plus
simple. Depuis août 2025, la politique d'actions autorisées (Settings → Actions → General) peut
exiger un SHA complet et faire échouer tout workflow non épinglé. Depuis octobre 2026, GitHub teste
en préversion publique un lockfile de workflow (`.github/workflows/actions.lock`, extension
`gh actions-lock`) qui fige aussi les actions appelées par tes actions.
**Piège** — Copier un SHA trouvé sur un fork : il doit venir des releases du dépôt d'origine.
**Notions** — Supply chain, CI/CD

---

### LIV-07 · Les scripts d'installation et les versions toutes fraîches ne passent pas sans contrôle
`important` · `tout`

**Pourquoi** — Un paquet peut déclarer des scripts (`preinstall`, `postinstall`) qui s'exécutent
pendant l'installation, sur ta machine ou dans la CI, avec accès à tes fichiers et à tes variables
d'environnement. C'est le moteur des grandes attaques récentes : en septembre 2025, le ver
« Shai-Hulud » ajoutait un `postinstall` aux paquets de mainteneurs piratés, volait les jetons
trouvés sur la machine et s'en servait pour infecter d'autres paquets. Ces versions piégées sont
le plus souvent repérées et retirées vite : ne pas installer une version publiée il y a une heure
en évite une grande partie.
**Vérifier** — `npm query ":attr(scripts, [postinstall])"` liste les paquets installés qui ont un
`postinstall`. Regarder `.npmrc` (`ignore-scripts`, `min-release-age`), `pnpm-workspace.yaml`
(`allowBuilds`, `minimumReleaseAge`), le `cooldown` de `dependabot.yml`.
**Corriger** —
- **pnpm 11 et Bun** n'exécutent pas les scripts des dépendances par défaut : n'autoriser que ceux
  qui en ont besoin (`pnpm approve-builds`, qui remplit `allowBuilds` ; `trustedDependencies` pour
  Bun).
- **npm** les exécute : `ignore-scripts=true` dans `.npmrc`, puis reconstruire à la main les rares
  paquets qui compilent du code natif (`npm rebuild sharp --ignore-scripts=false`).
- **Quarantaine des nouvelles versions** : `min-release-age=3` dans `.npmrc` (en jours, npm 11.10 et
  plus) ; `minimumReleaseAge` pour pnpm (en minutes, un jour par défaut depuis pnpm 11) ; `cooldown`
  pour Dependabot, `minimumReleaseAge` pour Renovate. Un correctif de sécurité urgent passe outre, à
  la main.
- **Si tu publies un paquet** (serveur MCP, plugin) : publication depuis la CI par « trusted
  publishing » (OIDC, sur npm et PyPI) plutôt qu'avec un jeton longue durée, et double
  authentification sur le compte.

**Piège** — Croire que le danger vient seulement des petits paquets obscurs : en septembre 2025,
`chalk` et `debug`, téléchargés des centaines de millions de fois par semaine, ont été piégés après
l'hameçonnage de leur mainteneur.
**Notions** — Supply chain

---

### LIV-08 · Une CI vérifie lint, types, tests et build à chaque push et à chaque PR
`important` · `prod`

**Pourquoi** — La CI (intégration continue) est un robot qui relance les vérifications sur une
machine propre à chaque envoi. Elle attrape ce qu'on a oublié de lancer et ce qui « marche chez
moi » grâce à un fichier non commité ; c'est aussi la condition pour protéger la branche principale
(LIV-15). Le CD (déploiement continu) met ensuite en ligne ce qui a passé : Vercel, Netlify et
Cloudflare le font à chaque push.
**Vérifier** — Un workflow déclenché sur `push` et `pull_request` ; il lance les scripts de
`package.json` ; il dure quelques minutes ; il est vert sur la branche principale.
**Corriger** — Le minimum utile, sans plus :
```yaml
name: CI
on: [push, pull_request]
permissions: { contents: read }
jobs:
  verifier:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<SHA>      # vX.Y.Z (LIV-06)
        with: { persist-credentials: false }
      - uses: actions/setup-node@<SHA>    # vX.Y.Z
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test
      - run: npm run build
```
Python : même schéma avec `uv sync --locked`, `ruff check`, `ruff format --check`, `pytest`. Le
**cache de build** garde d'un passage à l'autre ce qui n'a pas changé (`cache: npm`, `.next/cache`,
couches Docker en LIV-12) : il accélère, il ne remplace jamais `npm ci`.
**Piège** — Une CI laissée rouge « parce que c'est juste le lint » : en une semaine, plus personne
ne la regarde. Elle est verte, ou réparée tout de suite. À l'inverse, pas de matrice de douze
versions de Node pour une appli qui tourne sur une seule.
**Notions** — CI/CD, Build Caching

---

### LIV-09 · Dev, préversion et prod sont séparés, et chaque branche a sa préversion
`important` · `prod`

**Pourquoi** — Un environnement est une copie de l'application avec sa propre configuration, ses
propres clés et, idéalement, ses propres données. Tester en prod, c'est faire payer ses erreurs aux
utilisateurs. Une **préversion** (preview deployment) met en ligne automatiquement chaque branche ou
PR sur une URL à part : on clique, on vérifie, puis on fusionne.
**Vérifier** — Quels environnements existent, et que partagent-ils ? La préversion écrit-elle dans
la base de prod ? Les préversions sont-elles publiques et indexées ? Les variables sont-elles
définies par environnement (SEC-07) ?
**Corriger** — Vercel et Netlify créent une préversion par push de branche ; Cloudflare Pages aussi,
et chaque version d'un Worker a sa propre URL (Version URL, renvoyée par
`wrangler versions upload`). Pour la base :
une base de dev à part et, pour les préversions, une branche de base (Supabase Branching, branches
Neon) ou une base de test remplie de fausses données (BDD). Protéger les préversions d'un projet non
public (Vercel Deployment Protection) et les exclure de l'indexation.
**Piège** — Brancher la préversion sur la base de prod « pour avoir de vraies données » : un test de
suppression efface de vrais comptes.
**Notions** — Environnements, Preview deployments

---

### LIV-10 · On sait revenir à la version précédente en une minute, et on l'a déjà fait
`important` · `prod`

**Pourquoi** — Le **rollback** (retour arrière) est le premier geste quand une mise en ligne casse
(OBS-07) : on remet la version d'avant, puis on cherche au calme. Découvert le jour de la panne, il
prend une heure ; déjà répété, une minute.
**Vérifier** — Où est le bouton, qui peut l'utiliser, jusqu'où peut-on remonter ? L'a-t-on essayé ?
Qu'est-ce qui ne revient **pas** en arrière : base de données, variables d'environnement, fichiers
stockés, données des KV ?
**Corriger** — Connaître le geste de sa plateforme et l'écrire dans le runbook (OBS-12) :
| Plateforme | Retour arrière |
|---|---|
| Vercel | Instant Rollback (tableau de bord) ; en offre Hobby, seulement vers le déploiement précédent |
| Cloudflare Workers | `wrangler versions list`, puis `wrangler rollback <id>` (parmi les 100 dernières versions) |
| Cloudflare Pages, Netlify, Render, Railway | Republier un déploiement précédent depuis le tableau de bord |
| Fly.io | `fly deploy --image <image précédente>` |
| Docker sur un serveur | Relancer l'image précédente : d'où des images étiquetées par version ou par commit |
| Google Apps Script | Gérer les déploiements → modifier → choisir la version précédente |

**Piège** — Après un Instant Rollback, Vercel coupe l'attribution automatique des domaines de prod :
les pushes suivants ne partent plus en ligne tant qu'on n'a pas fait « Undo Rollback » ou
`vercel promote`. Et aucun rollback ne défait une migration de base : d'où LIV-11.
**Notions** — Rollbacks

---

### LIV-11 · Une migration de base reste compatible avec la version du code encore en ligne
`important` · `bdd`

**Pourquoi** — Pendant un déploiement, ancien et nouveau code tournent en même temps : requêtes en
cours, serveurs remplacés un par un (LIV-17), navigateurs restés ouverts sur l'ancien JavaScript.
En cas de rollback, l'ancien code revient. Si la migration renomme ou supprime une colonne que
l'ancien code lit, il plante, et le rollback devient impossible.
**Vérifier** — Dans les migrations (`supabase/migrations/`, `prisma/migrations/`, `drizzle/`,
`alembic/versions/`) : `DROP COLUMN`, `RENAME`, `SET NOT NULL` ou changement de type livrés dans le
même déploiement que le code qui en dépend.
**Corriger** — Procéder en deux déploiements (« étendre puis contracter ») : 1) ajouter la nouvelle
colonne, le code écrit dans les deux et lit la nouvelle ; 2) quand l'ancien code a disparu et que
les données sont recopiées, supprimer l'ancienne. Pour les navigateurs restés sur l'ancienne
version, Vercel propose la Skew Protection. Détails et autres cas : BDD.
**Notions** — Rollbacks, Rolling Deployments

---

### LIV-12 · L'image Docker est petite, épinglée, multi-étapes, et ne tourne pas en root
`important` · `prod` · `auto`

**Pourquoi** — Une image Docker emporte un système complet : plus elle est grosse, plus elle contient
de failles et d'outils utiles à un attaquant. `FROM node:latest` change sans prévenir d'un build à
l'autre. Un processus root dans le conteneur transforme une faille de l'application en contrôle
total du conteneur.
**Vérifier** — `node audit.mjs` (Dockerfile sans `USER`, image `:latest` ou sans étiquette).
`.dockerignore` présent et qui exclut `.env*`, `.git`, `node_modules` (SEC-13) ; une application par
image ; taille avec `docker images` ; le reste avec `hadolint Dockerfile`.
**Corriger** —
```dockerfile
FROM node:24-slim AS build                 # étape 1 : construire, avec tous les outils
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci                                 # couche réutilisée tant que les dépendances ne changent pas
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim                          # étape 2 : exécuter, avec le strict nécessaire
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node                                  # utilisateur fourni par l'image officielle Node
CMD ["node", "dist/server.js"]
```
Épinglage complet : `FROM node:24-slim@sha256:…`, tenu à jour par Dependabot ou Renovate. Python :
`python:3.13-slim`, un utilisateur créé (`RUN useradd --create-home app`, puis `USER app`). Plus
réduit encore : images distroless ou Chainguard. Une image par application (front, API, worker) :
chacune se met à jour et redémarre seule.
**Piège** — `COPY . .` avant `npm ci` : chaque modification du code réinstalle toutes les
dépendances, le cache ne sert plus. Et sans `.dockerignore`, le `.env` local part dans l'image.
**Notions** — Docker, Build Caching, Supply chain

---

### LIV-13 · Chaque dépendance ajoutée est nécessaire, maintenue et proportionnée
`conseillé` · `tout`

**Pourquoi** — Chaque paquet est du code à croire sur parole, à mettre à jour, à auditer, et du poids
en plus pour l'utilisateur s'il part au navigateur (PERF). En 2016, le retrait de `left-pad`, onze
lignes de code, a cassé l'installation de milliers de projets.
**Vérifier** — Pour un nouveau paquet, quatre questions. **Besoin** : la plateforme le fait-elle déjà
(`fetch`, `crypto.randomUUID()`, `structuredClone`, `Intl`, `node:test`, `toSorted`) ?
**Entretien** : dernière version récente, issues traitées, plus d'un mainteneur ? **Adoption** :
téléchargements, projets connus qui l'utilisent (deps.dev affiche aussi un score de santé) ?
**Poids** : taille ajoutée (bundlephobia.com, pkg-size.dev) et dépendances qu'il tire
(`npm view <paquet> dependencies`).
**Corriger** — Une fonction de dix lignes s'écrit et se teste : elle n'a pas besoin d'un paquet.
Préférer le natif, puis un petit paquet sans dépendances, puis seulement un gros. Une grosse
bibliothèque pour une seule fonction (Moment.js pour formater une date) se remplace par l'API native
(`Intl.DateTimeFormat`). Retirer les dépendances devenues inutiles (QUA-03, `knip`).
**Piège** — Réécrire soi-même ce qui est difficile et dangereux : cryptographie, dates et fuseaux
horaires, nettoyage de HTML, authentification. Là, une bibliothèque reconnue vaut mieux que dix
lignes maison.
**Notions** — Supply chain, KISS, YAGNI

---

### LIV-14 · Les mises à jour arrivent souvent, par petites étapes, et SemVer est compris
`conseillé` · `tout`

**Pourquoi** — Le **Semantic Versioning** (SemVer) numérote `MAJEUR.MINEUR.CORRECTIF` : `5.1.3` →
`5.1.4` corrige sans rien changer à l'usage, `5.2.0` ajoute sans casser, `6.0.0` peut casser. Deux
ans sans mise à jour préparent le **dependency hell** (l'enfer des dépendances) : plusieurs versions
majeures à monter d'un coup, des paquets qui exigent des versions incompatibles entre elles, et plus
rien qui ne s'installe proprement.
**Vérifier** — `npm outdated` (ou `pnpm outdated`, `uv tree --outdated`) : combien de majeures de
retard ? Un `.github/dependabot.yml` ou `renovate.json` existe-t-il ? Des `--legacy-peer-deps` ou
`--force` traînent-ils dans les scripts ou la documentation ?
**Corriger** — Ce qu'acceptent les plages de `package.json` :
| Écriture | Accepte | 5.1.9 ? | 5.2.0 ? | 6.0.0 ? |
|---|---|:-:|:-:|:-:|
| `5.1.3` | cette version exacte | non | non | non |
| `~5.1.3` | les correctifs : `>=5.1.3 <5.2.0` | oui | non | non |
| `^5.1.3` | mineures et correctifs : `>=5.1.3 <6.0.0` | oui | oui | non |

En `0.x`, `^` est aussi prudent que `~` : `^0.4.2` veut dire `>=0.4.2 <0.5.0`. Pour avancer par
petites étapes :
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    cooldown: { default-days: 3 }          # LIV-07
    groups:
      mineures: { update-types: [minor, patch] }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
```
Mineures et correctifs groupés, fusionnés si la CI est verte ; chaque majeure à part, notes de
version lues. Un conflit se règle en montant le paquet qui bloque, ou par un `overrides` commenté et
provisoire, pas par `--force`.
**Piège** — Croire `^` sans danger : SemVer est une promesse de l'auteur, pas une garantie. D'où le
lockfile (LIV-03) et la CI qui teste chaque mise à jour.
**Notions** — Semantic Versioning, Dependency Hell, Lockfile

---

### LIV-15 · La branche principale est protégée
`conseillé` · `prod`

**Pourquoi** — La **protection de branche** empêche qu'un `git push --force` réécrive l'historique,
qu'une branche soit supprimée par erreur, ou qu'un code qui ne passe pas la CI arrive sur la branche
qui se déploie.
**Vérifier** — GitHub → Settings → Rules → Rulesets (ou Branches → Branch protection rules) : une
règle couvre-t-elle `main` ? Bloque-t-elle force-push et suppression ? Exige-t-elle la CI ?
**Corriger** — Seul : bloquer force-push et suppression, exiger la CI verte (LIV-08) avant fusion,
passer par une branche et une PR pour tout changement non trivial (on profite de la préversion,
LIV-09). En `équipe` : PR obligatoire, au moins une approbation (QUA-20), conversations résolues,
règles appliquées aussi aux administrateurs. Sur un dépôt privé, ces règles demandent une offre
payante (GitHub Pro ou Team) : vérifier selon son compte.
**Notions** — Protection de branche, CI/CD, Revue de code

---

### LIV-16 · Les feature flags servent à livrer sans exposer, et sont retirés ensuite
`conseillé` · `prod`

**Pourquoi** — Un **feature flag** (interrupteur de fonctionnalité) est une condition du code
(`if (flags.nouveauPaiement)`) dont la valeur change sans redéployer. Il permet de fusionner tôt un
travail inachevé sans le montrer, d'ouvrir une nouveauté à soi seul ou à 5 % des utilisateurs, et de
la couper en une seconde si elle pose problème. Mais chaque flag double les chemins du code : oublié,
il devient du code mort (QUA-03) et une source de bugs.
**Vérifier** — Liste des flags avec date de création et raison ; flags à 100 % depuis des semaines ;
flags lus seulement côté navigateur pour cacher une fonction que le serveur ne protège pas.
**Corriger** — Commencer simple : une variable d'environnement ou une ligne d'une table de config.
Passer à un service (PostHog, GrowthBook, Unleash, le Flags SDK de Vercel) quand il faut cibler des
utilisateurs ou des pourcentages. Chaque flag naît avec une date de retrait ; une fois la
fonctionnalité à 100 %, on supprime le flag **et** la branche morte du `if`.
**Piège** — Prendre un flag pour un contrôle d'accès : cacher un bouton ne protège pas la route
(IAM).
**Notions** — Feature Flags, Dette technique, Code mort

---

### LIV-17 · Blue-green, canary, rolling : on sait ce que fait la plateforme, on n'en construit pas
`conseillé` · `échelle`

**Pourquoi** — Trois façons de remplacer une version par une autre sans coupure :
- **Blue-green** : deux environnements complets ; « bleu » sert le trafic, on déploie sur « vert »,
  on vérifie, puis on bascule tout d'un coup. Revenir, c'est rebasculer.
- **Canary** (le canari des mineurs, qui prévenait du gaz) : la nouvelle version reçoit d'abord une
  petite part du trafic ; si les erreurs n'augmentent pas, on élargit.
- **Rolling** (progressif) : les serveurs sont remplacés un par un ; pendant ce temps, une partie
  tourne encore sur l'ancienne version (d'où LIV-11).

**Vérifier** — Quelle stratégie la plateforme applique-t-elle déjà ? Le trafic est-il suffisant pour
qu'un canary à 5 % mesure quelque chose ?
**Corriger** — Utiliser l'existant. Vercel et Cloudflare basculent d'un coup vers la nouvelle
version, avec retour instantané (l'esprit du blue-green). Cloudflare Workers fait du canary par
pourcentages (`wrangler versions deploy`). Vercel propose des Rolling Releases (canary par étapes)
sur ses offres payantes. Fly.io choisit avec `fly deploy --strategy rolling|bluegreen|canary`.
Kubernetes fait du rolling par défaut. Construire son propre blue-green ne vaut le coup qu'avec
plusieurs serveurs à soi et des mises en ligne fréquentes.
**Piège** — Un canary sans métriques (OBS-11) ne sert à rien : avant d'élargir, on compare le taux
d'erreur de la nouvelle version à celui de l'ancienne.
**Notions** — Blue-Green Deployment, Canary Releases, Rolling Deployments, Rollbacks

---

### LIV-18 · Pas de Kubernetes ni de Helm tant qu'un PaaS suffit
`conseillé` · `échelle`

**Pourquoi** — **Kubernetes** orchestre des conteneurs sur un groupe de machines : il les place, les
redémarre, les multiplie selon la charge, les met à jour progressivement. **Helm** est son
gestionnaire de paquets : un « chart » regroupe les fichiers de description d'une application, avec
des valeurs par environnement. C'est puissant, et c'est un métier : réseau, stockage, mises à jour du
cluster, sécurité, machines payées en permanence. Pour la grande majorité des projets, un PaaS
(plateforme qui héberge le code pour toi : Vercel, Cloudflare, Fly.io, Render, Railway) fournit
déploiement, HTTPS, rollback et montée en charge sans rien de tout cela.
**Vérifier** — Le projet contient-il `k8s/`, `helm/`, `Chart.yaml`, `kustomization.yaml` ? Qui les
maintient ? Quel besoin concret un PaaS ne couvrirait-il pas ?
**Corriger** — Rester sur un PaaS tant que possible. Envisager Kubernetes, de préférence géré,
quand plusieurs de ces conditions sont réunies : des dizaines de services, quelqu'un dont l'infra
est le travail, des contraintes qu'aucun PaaS ne couvre (matériel, réseau, hébergement imposé), ou
une facture PaaS devenue nettement plus chère qu'un cluster bien tenu. Si Kubernetes est là : des
`resources` (requests et limits) par conteneur, des sondes liveness et readiness (OBS-16), un chart
Helm par application avec ses valeurs par environnement, des images épinglées (LIV-12).
**Piège** — Installer Kubernetes « pour apprendre » sur un projet en production : on apprend sur un
projet jetable, on livre sur ce qui est simple.
**Notions** — Kubernetes, Helm Charts, Docker

---

### LIV-19 · L'infrastructure se décrit en code quand elle devient trop grande pour se cliquer
`conseillé` · `échelle`

**Pourquoi** — L'**Infrastructure as Code** (IaC) décrit dans des fichiers versionnés ce qu'on clique
d'habitude dans les tableaux de bord : DNS, buckets, bases, Workers, variables, droits.
**Terraform** (ou son équivalent libre OpenTofu, ou Pulumi en TypeScript ou Python) compare ces
fichiers à l'existant et applique la différence. On gagne un historique, une relecture avant
application (`terraform plan`) et la capacité de recréer un environnement à l'identique.
**Vérifier** — Combien de ressources créées à la main ? Saurait-on recréer la prod si le compte
disparaissait ? Plusieurs personnes touchent-elles l'infra ? Si Terraform est là : le fichier d'état
(`terraform.tfstate`) est-il commité ? Il ne doit pas l'être : il contient des secrets en clair.
**Corriger** — Sur un PaaS, la config versionnée de la plateforme suffit souvent (`vercel.json`,
`wrangler.jsonc`, `fly.toml`, `supabase/config.toml` et les migrations). Passer à Terraform ou
OpenTofu quand l'infra dépasse une poignée de ressources, qu'on la reproduit pour plusieurs
environnements, ou qu'on travaille à plusieurs (`équipe`) ; Cloudflare, Vercel et Supabase ont leur
fournisseur Terraform. L'état va dans un stockage distant chiffré avec verrou, jamais dans git ;
chaque `apply` est précédé d'un `plan` relu.
**Piège** — Mélanger clics et code : une modification faite à la main sera écrasée au prochain
`apply`, ou fera diverger l'état de la réalité.
**Notions** — Infrastructure as Code, Terraform, Environnements

---

### LIV-20 · Une SBOM liste ce que contient le logiciel livré, quand on livre à d'autres
`conseillé` · `échelle`

**Pourquoi** — La **SBOM** (Software Bill of Materials, « nomenclature logicielle ») est la liste
complète des composants d'un logiciel livré, avec versions et licences, dans un format standard
(CycloneDX ou SPDX). Le jour où une faille majeure sort (comme Log4Shell fin 2021), elle répond en
une minute à « sommes-nous touchés ? ». Des clients professionnels l'exigent, et le Cyber Resilience
Act européen l'impose aux fabricants de produits numériques vendus dans l'UE à partir du
11 décembre 2027 ; les services purement en ligne relèvent en général d'autres textes (LEG).
**Vérifier** — Le projet est-il livré à d'autres (application installable, extension de navigateur,
paquet, image Docker, client professionnel) ? Un contrat ou une réglementation demande-t-il une
SBOM ?
**Corriger** — La générer en CI depuis le lockfile, à chaque version, et la joindre à la release :
`npm sbom --sbom-format cyclonedx > sbom.json` (ou `pnpm sbom`), `syft` pour une image Docker ou un
projet Python, ou l'export du graphe de dépendances GitHub (Insights → Dependency graph → Export
SBOM). Pour un site perso ou un petit SaaS : inutile, le lockfile et l'audit (LIV-05) suffisent.
**Notions** — SBOM, Supply chain
