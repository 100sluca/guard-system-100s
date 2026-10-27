#!/usr/bin/env node
// Le scanner de guard-system-100s : ce qu'une machine peut vérifier seule dans un projet.
//
//   node audit.mjs <racine>                 le rapport, en clair (code 1 s'il y a un bloquant)
//   node audit.mjs <racine> --json          le même, en JSON
//   node audit.mjs <racine> --ecrire        écrit aussi __guard-system-100s/audit.json (le bandeau le lit)
//   node audit.mjs <racine> --historique    cherche aussi les secrets dans tout l'historique git
//   node audit.mjs <racine> --sans-reseau   sans npm audit
//   node audit.mjs <racine> --staged        avant un commit : les secrets de ce qui est indexé (--commit-a : de git commit -a)
//   node audit.mjs <racine> --push          avant un push : les secrets des commits pas encore poussés
//   node audit.mjs <racine> --installer-git installe le contrôle --staged en pre-commit dans le dépôt
//
// Le mode guard d'un projet (le suivi pendant qu'il se construit) :
//   node audit.mjs <racine> --activer [--phase <conception|en cours|en ligne>] [--nom "<nom>"]
//                                           allume le mode : bloc du CLAUDE.md, mode.json, JOURNAL.md, premier contrôle
//   node audit.mjs <racine> --phase "<phase>"  change la phase (et le bloc du CLAUDE.md)
//   node audit.mjs <racine> --desactiver    éteint le mode (retire le bloc, garde le journal)
//   node audit.mjs <racine> --auto          le contrôle automatique du garde : écrit, journalise, répond en JSON
// En mode allumé, chaque contrôle écrit (--ecrire) note dans JOURNAL.md ce qui est apparu ou a disparu.
//
// Le scanner trouve des indices ; la revue (/guard-system-100s -audit) confirme et va plus loin.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync, readdirSync, chmodSync } from 'node:fs'
import { join, resolve, relative, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  chercherSecrets, chercherMotifs, variablesPubliquesSecretes, fuiteAdminSupabase, estCoteClient,
  estFichierSecrets, estModeleEnv, estFichierTest, MARQUE_IGNORER,
} from './regles.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const DOSSIER = '__guard-system-100s'
const args = process.argv.slice(2)
const option = nom => args.includes(nom)
// La valeur qui suit une option (`--phase "en cours"`), sinon null.
const valeur = nom => {
  const i = args.indexOf(nom)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null
}
const AVEC_VALEUR = new Set(['--phase', '--nom'])
const racine = resolve(args.find((a, i) => !a.startsWith('--') && !AVEC_VALEUR.has(args[i - 1])) ?? '.')

// ─── Les contrôles du scanner, et le contrôle du référentiel que chacun met en pratique ───

const CONTROLES = {
  'secret': { ref: 'SEC-01', gravite: 'bloquant', titre: 'Secret écrit en dur dans le code',
    conseil: 'Le mettre dans une variable d’environnement (.env ignoré par git en local, coffre de la plateforme en prod) et la lire côté serveur. S’il a déjà été commité ou poussé : le révoquer chez le fournisseur (SEC-06).' },
  'secret-alerte': { ref: 'SEC-01', gravite: 'important', titre: 'Valeur qui ressemble à un secret (à vérifier)',
    conseil: 'Si c’est un vrai secret : variable d’environnement. Si c’est une valeur publique ou factice : ajouter `guard:ignore` sur la ligne.' },
  'env-public-secret': { ref: 'SEC-02', gravite: 'bloquant', titre: 'Secret dans une variable publique, recopiée dans le code du navigateur',
    conseil: 'Retirer le préfixe public (VITE_, NEXT_PUBLIC_…) et appeler le service depuis le serveur (route API, Edge Function, Worker), qui garde la clé.' },
  'admin-supabase-client': { ref: 'SEC-02', gravite: 'bloquant', titre: 'Clé admin Supabase (service_role / secret) dans du code navigateur',
    conseil: 'Cette clé contourne toute la Row Level Security. Elle ne sert que côté serveur ; le navigateur utilise la clé publishable/anon.' },
  'ia-client': { ref: 'SEC-02', gravite: 'bloquant', titre: 'Appel direct à une API d’IA depuis le navigateur',
    conseil: 'La clé d’IA serait publique. Passer par une route serveur qui garde la clé, vérifie l’utilisateur et limite le débit.' },
  'fichier-secrets-suivi': { ref: 'SEC-03', gravite: 'bloquant', titre: 'Fichier de secrets suivi par git',
    conseil: '`git rm --cached <fichier>`, l’ajouter à .gitignore, puis révoquer les clés qu’il contenait (elles sont dans l’historique).' },
  'gitignore-env': { ref: 'SEC-03', gravite: 'bloquant', titre: '.env n’est pas ignoré par git',
    conseil: 'Ajouter `.env`, `.env.*` et `!.env.example` à .gitignore.' },
  'env-example': { ref: 'SEC-04', gravite: 'conseillé', titre: 'Pas de .env.example alors que le code lit des variables d’environnement',
    conseil: 'Créer .env.example avec chaque variable lue par le code, sans valeur.' },
  'historique': { ref: 'SEC-05', gravite: 'bloquant', titre: 'Secret présent dans l’historique git',
    conseil: 'D’abord révoquer la clé chez le fournisseur (SEC-06), ensuite seulement nettoyer l’historique si le dépôt est partagé.' },
  'lecture-env-claude': { ref: 'SEC-15', gravite: 'conseillé', titre: 'L’assistant de code peut lire le .env',
    conseil: 'Dans .claude/settings.json : "permissions": { "deny": ["Read(./.env)", "Read(./.env.*)"] }.' },
  'rls-absente': { ref: 'BDD-01', gravite: 'bloquant', titre: 'Table Supabase sans Row Level Security',
    conseil: '`alter table <table> enable row level security;` puis des policies fondées sur auth.uid(). Sans RLS, la clé publique du navigateur lit et modifie toute la table.' },
  'policy-ouverte': { ref: 'IAM-03', gravite: 'important', titre: 'Policy RLS qui laisse écrire sans condition (using (true) / with check (true))',
    conseil: 'Restreindre la policy au propriétaire (`auth.uid() = user_id`) ou au rôle voulu : `true` en écriture laisse chacun modifier les lignes des autres.' },
  'lecture-ouverte': { ref: 'IAM-03', gravite: 'conseillé', titre: 'Table lisible par tout Internet (policy select using (true) pour anon ou public)',
    conseil: 'Normal pour un catalogue public ; sinon, réserver la lecture à `authenticated` ou au propriétaire.' },
  'security-definer': { ref: 'BDD-03', gravite: 'important', titre: 'Fonction SECURITY DEFINER sans search_path fixé',
    conseil: "Ajouter `set search_path = ''` (et qualifier les tables) : sinon la fonction, qui tourne avec les droits de son créateur, peut être détournée." },
  'regles-firebase': { ref: 'IAM-01', gravite: 'bloquant', titre: 'Règles Firebase ouvertes à tous (if true)',
    conseil: 'Écrire des règles qui vérifient request.auth et la propriété du document ; tester avec l’émulateur.' },
  'apps-script-public': { ref: 'IAM-16', gravite: 'important', titre: 'Web app Apps Script ouverte à tous et exécutée avec ton compte',
    conseil: 'N’importe qui peut l’appeler avec tes droits : vérifier un secret partagé ou un jeton dans doPost/doGet, valider chaque paramètre, limiter ce que le script peut toucher.' },
  'webhook-signature': { ref: 'API-04', gravite: 'important', titre: 'Route de webhook sans vérification de signature',
    conseil: 'Vérifier la signature du fournisseur sur le corps brut (Stripe : stripe.webhooks.constructEvent ; sinon HMAC comparé en temps constant) et refuser les vieux horodatages.' },
  'rate-limit': { ref: 'API-01', gravite: 'important', titre: 'Aucun rate limiting repéré alors que le projet expose une API',
    conseil: 'Limiter le débit par utilisateur et par IP sur la connexion, les formulaires et tout ce qui coûte (IA, e-mail, SMS) : Cloudflare Rate Limiting, @upstash/ratelimit, express-rate-limit, slowapi…' },
  'rate-limit-ia': { ref: 'IA-05', gravite: 'important', titre: 'Appels d’IA sans aucun rate limiting repéré (risque de facture)',
    conseil: 'Limite par utilisateur, max_tokens, taille d’entrée bornée et plafond de dépense chez le fournisseur.' },
  'timeout': { ref: 'API-03', gravite: 'conseillé', titre: 'Appels sortants sans timeout',
    conseil: 'fetch n’a aucun délai par défaut : `fetch(url, { signal: AbortSignal.timeout(10_000) })` ; en Python, `timeout=` sur chaque requête.' },
  'validation': { ref: 'INJ-01', gravite: 'conseillé', titre: 'Aucune bibliothèque de validation repérée pour les entrées de l’API',
    conseil: 'Valider chaque entrée côté serveur avec un schéma (zod, valibot, pydantic) : type, longueur, format, valeurs permises.' },
  'en-tetes': { ref: 'WEB-05', gravite: 'important', titre: 'Aucune configuration d’en-têtes de sécurité repérée',
    conseil: 'Poser Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy et frame-ancestors (next.config headers(), vercel.json, _headers, helmet, secureHeaders).' },
  'source-maps': { ref: 'WEB-16', gravite: 'conseillé', titre: 'Source maps publiées en production',
    conseil: 'Les désactiver en build de prod, ou les envoyer au service de suivi d’erreurs sans les publier.' },
  'extension-permissions': { ref: 'WEB-14', gravite: 'important', titre: 'Extension de navigateur aux permissions très larges',
    conseil: 'Limiter host_permissions aux sites nécessaires et retirer les permissions inutilisées ; préférer activeTab.' },
  'cron-secret': { ref: 'ASY-04', gravite: 'important', titre: 'Tâche planifiée appelable par n’importe qui',
    conseil: 'Vérifier un secret (Vercel : en-tête Authorization: Bearer ${CRON_SECRET}) au début de la route du cron.' },
  'lockfile': { ref: 'LIV-03', gravite: 'important', titre: 'Pas de lockfile commité',
    conseil: 'Commiter package-lock.json (ou pnpm-lock.yaml, yarn.lock, bun.lock) et installer avec `npm ci` en CI.' },
  'versions-flottantes': { ref: 'LIV-04', gravite: 'important', titre: 'Dépendance en version * ou latest',
    conseil: 'Fixer une plage de version (`^1.2.3`) : `latest` peut installer demain une version cassée ou piégée.' },
  'vulnerabilites': { ref: 'LIV-05', gravite: 'important', titre: 'Dépendances avec des vulnérabilités connues',
    conseil: '`npm audit fix` pour les corrections compatibles ; sinon mettre à jour la dépendance ou la remplacer.' },
  'vulnerabilites-dev': { ref: 'LIV-05', gravite: 'conseillé', titre: 'Vulnérabilités dans les dépendances de développement',
    conseil: 'Moins urgent (rien de cela ne part en prod), mais à mettre à jour au prochain passage.' },
  'docker-root': { ref: 'LIV-12', gravite: 'important', titre: 'Conteneur exécuté en root (pas d’instruction USER)',
    conseil: 'Ajouter un utilisateur non root et `USER app` avant le CMD.' },
  'docker-latest': { ref: 'LIV-12', gravite: 'conseillé', titre: 'Image de base non épinglée (:latest ou sans tag)',
    conseil: 'Épingler une version précise (`node:22-alpine`, voire son digest).' },
  'docker-secret': { ref: 'SEC-13', gravite: 'important', titre: 'Secret passé par ENV ou ARG dans un Dockerfile',
    conseil: 'Les fournir à l’exécution (variables de la plateforme) ou par `--secret` de BuildKit : ENV et ARG restent lisibles dans l’image.' },
  'dockerignore': { ref: 'SEC-13', gravite: 'important', titre: '.dockerignore absent ou qui n’exclut pas .env',
    conseil: 'Créer .dockerignore avec `.env*`, `.git`, `node_modules`.' },
  'actions-epinglage': { ref: 'LIV-06', gravite: 'conseillé', titre: 'Action GitHub tierce non épinglée par SHA',
    conseil: 'Remplacer `@v3` ou `@main` par le SHA complet du commit (commentaire avec la version à côté).' },
  'actions-prt': { ref: 'LIV-02', gravite: 'important', titre: 'Workflow déclenché par pull_request_target',
    conseil: 'Il tourne avec les secrets du dépôt sur du code venant d’une PR externe : à éviter, ou sans jamais exécuter le code de la PR.' },
  'actions-injection': { ref: 'LIV-02', gravite: 'important', titre: 'Texte contrôlé par l’extérieur injecté dans un script de workflow',
    conseil: 'Passer `${{ github.event.* }}` par une variable d’environnement (`env: TITRE: ...` puis `"$TITRE"`), jamais directement dans `run:`.' },
  'actions-permissions': { ref: 'LIV-02', gravite: 'conseillé', titre: 'Workflow sans `permissions:` minimales',
    conseil: 'Ajouter `permissions: contents: read` en tête, et n’élargir que pour le job qui en a besoin.' },
  'traceurs': { ref: 'LEG-02', gravite: 'important', titre: 'Traceurs tiers sans gestion du consentement repérée',
    conseil: 'Ne charger Google Analytics, Meta Pixel, Hotjar… qu’après consentement (bandeau où refuser est aussi simple qu’accepter).' },
  'images-lourdes': { ref: 'PERF-02', gravite: 'conseillé', titre: 'Images lourdes servies telles quelles',
    conseil: 'Convertir en AVIF/WebP, redimensionner à la taille d’affichage, ou passer par le composant d’image du framework.' },
  'gros-fichiers': { ref: 'QUA-03', gravite: 'conseillé', titre: 'Gros fichiers ou dossiers générés suivis par git',
    conseil: 'Les retirer du dépôt (`git rm --cached`) et les ignorer ; pour des médias, un stockage dédié.' },
  'console-log': { ref: 'QUA-05', gravite: 'conseillé', titre: 'console.log / print de débogage laissés',
    conseil: 'Les retirer, ou passer par un logger avec niveaux (OBS).' },
  'code-commente': { ref: 'QUA-10', gravite: 'conseillé', titre: 'Blocs de code commenté',
    conseil: 'Les supprimer : git garde l’ancienne version si on en a besoin.' },
  'todo': { ref: 'QUA-11', gravite: 'conseillé', titre: 'TODO / FIXME en attente',
    conseil: 'Les traiter, ou les noter dans une liste de suivi datée, puis les retirer du code.' },
  'typage-lache': { ref: 'QUA-06', gravite: 'conseillé', titre: '@ts-ignore et any qui désactivent le typage',
    conseil: 'Typer correctement ; @ts-expect-error avec une raison si c’est vraiment nécessaire.' },
  'ts-strict': { ref: 'QUA-06', gravite: 'conseillé', titre: 'TypeScript sans "strict": true',
    conseil: 'Activer "strict": true dans tsconfig.json et corriger ce qu’il révèle.' },
  'sans-tests': { ref: 'QUA-08', gravite: 'conseillé', titre: 'Aucun test automatisé',
    conseil: 'Commencer par les parcours qui coûtent s’ils cassent : argent, droits d’accès, calculs, parsing.' },
  'readme': { ref: 'QUA-19', gravite: 'conseillé', titre: 'Pas de README',
    conseil: 'Quelques lignes : à quoi sert le projet, comment l’installer et le lancer.' },
  'fuite-memoire': { ref: 'PERF-09', gravite: 'conseillé', titre: 'Intervalle ou écouteur posé dans un composant sans être retiré (fuite de mémoire possible)',
    conseil: 'Retirer ce qu’on pose quand le composant disparaît : `return () => clearInterval(id)` dans le useEffect, removeEventListener, ou { signal } d’un AbortController.' },
}

// Les motifs ligne à ligne de regles.mjs portent leur gravité et leur message ; leur titre ici.
const TITRES_MOTIFS = {
  'injection-sql': 'Requête SQL construite avec des variables', 'injection-sql-py': 'Requête SQL construite avec des variables',
  'injection-commande': 'Commande shell construite avec des variables', 'eval': 'eval / new Function', 'exec-py': 'exec() en Python',
  'html-brut': 'HTML inséré tel quel (XSS possible)', 'tls-desactive': 'Vérification TLS désactivée',
  'hachage-faible': 'Mot de passe haché avec md5/sha1', 'aleatoire-faible': 'Math.random pour un jeton ou un secret',
  'jwt-non-verifie': 'JWT lu sans vérifier sa signature', 'jwt-none': 'JWT accepté sans signature', 'cors-ouvert': 'CORS ouvert à toutes les origines',
  'debug-actif': 'Mode debug actif', 'cookie-lisible': 'Cookie lisible par JavaScript', 'log-secret': 'Secret ou en-têtes écrits dans les journaux',
  'deserialisation': 'Désérialisation qui peut exécuter du code', 'erreur-exposee': 'Détail des erreurs renvoyé au client',
  'catch-vide': 'Erreur avalée en silence', 'http-clair': 'URL en http:// (non chiffrée)',
}

// ─── Outils ───

const git = (...a) => {
  try {
    return execFileSync('git', ['-C', racine, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}
const lire = chemin => {
  try {
    return readFileSync(join(racine, chemin), 'utf8')
  } catch {
    return null
  }
}
const existe = chemin => existsSync(join(racine, chemin))
const slash = chemin => chemin.replace(/\\/g, '/')

const BINAIRE = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|psd|svgz|mp[34]|m4a|wav|ogg|flac|webm|mov|avi|mkv|pdf|zip|gz|tgz|rar|7z|woff2?|ttf|otf|eot|exe|dll|so|dylib|bin|jar|class|pyc|wasm|db|sqlite3?|lockb|ttc|heic)$/i
const IGNORES = /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.nuxt|\.svelte-kit|\.output|coverage|\.venv|venv|__pycache__|\.turbo|\.vercel|\.wrangler|\.cache|\.parcel-cache|vendor|__guard-system-100s|__recap-system-100s)\//
const ILLISIBLE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock|poetry\.lock|Cargo\.lock|composer\.lock)$|\.min\.(js|css)$|\.map$/
const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?)$/i
const CODE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|py|rb|php|go|gs)$/i

function listerFichiers() {
  const suivis = git('ls-files', '-z')
  if (suivis !== null) {
    const autres = git('ls-files', '-z', '-o', '--exclude-standard') ?? ''
    const tous = [...suivis.split('\0'), ...autres.split('\0')].filter(Boolean).map(slash)
    return { estGit: true, suivis: new Set(suivis.split('\0').filter(Boolean).map(slash)), fichiers: [...new Set(tous)].filter(f => !IGNORES.test(`/${f}`)) }
  }
  const fichiers = []
  const parcourir = (dossier, profondeur) => {
    if (profondeur > 12 || fichiers.length > 20000) return
    for (const e of readdirSync(join(racine, dossier), { withFileTypes: true })) {
      const rel = slash(join(dossier, e.name))
      if (IGNORES.test(`/${rel}/`)) continue
      if (e.isDirectory()) parcourir(rel, profondeur + 1)
      else if (e.isFile()) fichiers.push(rel)
    }
  }
  parcourir('', 0)
  return { estGit: false, suivis: new Set(), fichiers }
}

const taille = chemin => {
  try {
    return statSync(join(racine, chemin)).size
  } catch {
    return 0
  }
}

// ─── Avant un commit ou un push : les secrets de ce qui va partir, rien d'autre ───

// Les lignes ajoutées d'un diff unifié (git diff, git log -p) : fichiers de secrets et secrets.
function problemesDuDiff(diff) {
  const problemes = []
  let fichier = ''
  let ligne = 0
  let commit = ''
  for (const l of diff.split('\n')) {
    if (l.startsWith('commit ')) commit = ` (commit ${l.slice(7, 14)})`
    else if (l.startsWith('+++ ')) {
      fichier = l.replace(/^\+\+\+ (b\/)?/, '')
      if (fichier !== '/dev/null' && estFichierSecrets(fichier)) problemes.push(`${fichier}${commit} : fichier de secrets (à ignorer, pas à commiter)`)
    } else if (l.startsWith('@@')) ligne = Number(/\+(\d+)/.exec(l)?.[1] ?? 1) - 1
    else if (l.startsWith('+') && fichier && !estFichierSecrets(fichier)) {
      ligne++
      for (const s of chercherSecrets(l.slice(1), fichier)) {
        if (s.bloque) problemes.push(`${fichier}:${ligne}${commit} : ${s.nom} (${s.extrait})`)
      }
      if (!/\.(md|mdx|txt|rst)$/i.test(fichier)) {
        for (const v of variablesPubliquesSecretes(l.slice(1))) problemes.push(`${fichier}:${ligne}${commit} : ${v} est une variable publique (recopiée dans le navigateur) au nom de secret`)
      }
    } else if (!l.startsWith('-')) ligne++
  }
  return problemes
}

// --staged : l'index ; avec --commit-a, tout ce que `git commit -a` emporterait ; --push : les commits pas encore poussés.
function controleSortant() {
  let diff
  let quoi = 'commit'
  if (option('--push')) {
    quoi = 'push'
    const amont = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}')
    diff = git('log', '-p', '-U0', '--no-color', '--format=commit %H', ...(amont ? ['@{u}..HEAD'] : ['HEAD', '--not', '--remotes']))
  } else if (option('--commit-a') && git('rev-parse', '--verify', '-q', 'HEAD')) {
    diff = git('diff', 'HEAD', '-U0', '--no-color', '--diff-filter=ACMR')
  } else {
    diff = git('diff', '--cached', '-U0', '--no-color', '--diff-filter=ACMR')
  }
  // `git add … && git commit` en une commande : ce que l'ajout emporte part aussi. --non-suivis :
  // un ajout large (`git add .`, `-A`) ; --fichiers=a|b : un ajout de chemins précis.
  const chemins = args.find(x => x.startsWith('--fichiers='))?.slice('--fichiers='.length).split('|').filter(Boolean)
  if (chemins?.length && git('rev-parse', '--verify', '-q', 'HEAD')) {
    diff += `\n${git('diff', 'HEAD', '-U0', '--no-color', '--diff-filter=ACMR', '--', ...chemins) ?? ''}`
  }
  if (option('--non-suivis') || chemins?.length) {
    for (const f of (git('ls-files', '-z', '-o', '--exclude-standard', ...(chemins?.length ? ['--', ...chemins] : [])) ?? '').split('\0').filter(Boolean)) {
      if (BINAIRE.test(f) || taille(f) > 1_000_000) continue
      const texte = estFichierSecrets(f) ? '' : (lire(f) ?? '')
      diff += `\n+++ b/${f}\n@@ -0,0 +1 @@\n${texte.split('\n').map(l => `+${l}`).join('\n')}`
    }
  }
  const problemes = problemesDuDiff(diff ?? '')
  if (!problemes.length) return 0
  console.error(`guard-system-100s : ${quoi} arrêté, un secret allait partir.\n`)
  for (const p of [...new Set(problemes)].slice(0, 20)) console.error(`  ✗ ${p}`)
  console.error('\nMets la valeur dans .env (ignoré par git) et lis-la depuis l’environnement.')
  if (quoi === 'push') console.error('Le secret est déjà dans un commit local : le retirer de ce commit (git commit --amend, ou rebase), et le révoquer s’il a pu fuiter ailleurs.')
  console.error('Une valeur publique ou factice ? `guard:ignore` en commentaire sur sa ligne, avec l’accord de l’utilisateur.')
  return 1
}

function installerGit() {
  const dossierGit = git('rev-parse', '--git-path', 'hooks')?.trim()
  if (!dossierGit) {
    console.log('Pas un dépôt git : rien à installer.')
    return 0
  }
  const crochets = resolve(racine, dossierGit)
  const fichier = join(crochets, 'pre-commit')
  const script = slash(join(ICI, 'audit.mjs'))
  const contenu = `#!/bin/sh
# guard-system-100s : arrête un commit qui contient un secret.
GUARD="${script}"
if [ -f "$GUARD" ] && command -v node >/dev/null 2>&1; then
  node "$GUARD" "$(git rev-parse --show-toplevel)" --staged || exit 1
else
  echo "guard-system-100s : contrôle des secrets indisponible (plugin déplacé ou Node absent), commit laissé passer."
fi
`
  if (existsSync(fichier) && !readFileSync(fichier, 'utf8').includes('guard-system-100s')) {
    console.log(`Un pre-commit existe déjà (${slash(fichier)}). Ajoute-lui cette ligne :\n  node "${script}" "$(git rev-parse --show-toplevel)" --staged || exit 1`)
    return 0
  }
  mkdirSync(crochets, { recursive: true })
  writeFileSync(fichier, contenu)
  try {
    chmodSync(fichier, 0o755)
  } catch {
    // Windows : git exécute le hook par son propre shell, le mode n'y compte pas.
  }
  console.log(`Garde pre-commit installé : ${slash(fichier)}`)
  return 0
}

// ─── Le profil du projet : ses stacks et ses contextes ───

function profil(fichiers) {
  const deps = new Set()
  const paquets = fichiers.filter(f => basename(f) === 'package.json' && f.split('/').length <= 3)
  for (const p of paquets) {
    try {
      const j = JSON.parse(lire(p))
      for (const champ of ['dependencies', 'devDependencies', 'peerDependencies']) Object.keys(j[champ] ?? {}).forEach(d => deps.add(d))
    } catch {
      // package.json illisible : on fait sans.
    }
  }
  const python = fichiers.filter(f => /(^|\/)(requirements[^/]*\.txt|pyproject\.toml|Pipfile)$/.test(f)).map(lire).join('\n').toLowerCase()
  const a = (...noms) => noms.some(n => (n.endsWith('*') ? [...deps].some(d => d.startsWith(n.slice(0, -1))) : deps.has(n)))
  const py = (...noms) => noms.some(n => new RegExp(`(^|[\\s"'\\[])${n}([\\s=<>~!\\[;"']|$)`, 'm').test(python))
  const f = re => fichiers.some(x => re.test(x))

  const stacks = []
  const ajoute = (cond, nom) => cond && stacks.push(nom)
  ajoute(a('next'), 'Next.js')
  ajoute(a('vite'), 'Vite')
  ajoute(a('react') && !a('next'), 'React')
  ajoute(a('vue', 'nuxt'), a('nuxt') ? 'Nuxt' : 'Vue')
  ajoute(a('svelte', '@sveltejs/kit'), 'Svelte')
  ajoute(a('astro'), 'Astro')
  ajoute(a('express'), 'Express')
  ajoute(a('fastify'), 'Fastify')
  ajoute(a('hono'), 'Hono')
  ajoute(a('@nestjs/core'), 'NestJS')
  ajoute(py('fastapi'), 'FastAPI')
  ajoute(py('flask'), 'Flask')
  ajoute(py('django'), 'Django')
  ajoute(a('@supabase/supabase-js', '@supabase/ssr') || f(/^supabase\/(config\.toml|migrations\/)/), 'Supabase')
  ajoute(a('firebase', 'firebase-admin') || f(/(^|\/)firebase\.json$/), 'Firebase')
  ajoute(f(/(^|\/)wrangler\.(toml|jsonc?)$/), 'Cloudflare Workers')
  ajoute(f(/(^|\/)vercel\.json$/) || a('@vercel/*'), 'Vercel')
  ajoute(f(/(^|\/)appsscript\.json$/), 'Google Apps Script')
  ajoute(a('stripe', '@stripe/stripe-js') || py('stripe'), 'Stripe')
  ajoute(f(/\.liquid$/), 'Shopify')
  ajoute(a('@modelcontextprotocol/sdk') || py('mcp', 'fastmcp'), 'Serveur MCP')
  ajoute(a('prisma', '@prisma/client'), 'Prisma')
  ajoute(a('drizzle-orm'), 'Drizzle')
  ajoute(a('electron'), 'Electron')
  ajoute(a('react-native', 'expo'), 'React Native')
  ajoute(f(/(^|\/)Dockerfile$/), 'Docker')
  const manifeste = fichiers.find(x => /(^|\/)manifest\.json$/.test(x) && /"manifest_version"/.test(lire(x) ?? ''))
  ajoute(Boolean(manifeste), 'Extension de navigateur')
  const ia = a('openai', '@anthropic-ai/sdk', '@google/genai', '@google/generative-ai', 'ai', '@ai-sdk/*', '@mistralai/mistralai', 'groq-sdk', 'replicate', 'ollama', '@langchain/*', 'langchain')
    || py('openai', 'anthropic', 'google-genai', 'google-generativeai', 'mistralai', 'langchain', 'litellm', 'groq')
  ajoute(ia, 'IA')

  const textes = () => fichiers.filter(x => CODE.test(x) && taille(x) < 400_000).slice(0, 3000)
  let codeCache = null
  const code = () => (codeCache ??= textes().map(x => [x, lire(x) ?? '']))
  const grep = re => code().some(([, t]) => re.test(t))

  const web = f(/\.(html?|vue|svelte|astro|jsx|tsx|liquid)$/) || a('next', 'vite', 'react', 'vue', 'svelte', 'astro', 'nuxt') || Boolean(manifeste)
  const api = a('express', 'fastify', 'hono', 'koa', '@nestjs/core', '@modelcontextprotocol/sdk') || py('fastapi', 'flask', 'django', 'mcp')
    || f(/(^|\/)(app|src\/app)\/.*route\.[jt]s$|(^|\/)pages\/api\/|^supabase\/functions\/|(^|\/)wrangler\.(toml|jsonc?)$|(^|\/)api\/.*\.[jt]s$/)
    || grep(/['"]use server['"]|function\s+do(?:Get|Post)\s*\(/)
  const comptes = a('next-auth', '@auth/*', '@clerk/*', 'better-auth', 'lucia', 'passport', '@kinde-oss/*', '@auth0/*', 'firebase', 'firebase-admin')
    || grep(/auth\.(signInWith|signUp|getUser|getSession|getClaims)|signInWithPassword|onAuthStateChanged|login_required|@login_required/)
  const bdd = stacks.some(s => ['Supabase', 'Firebase', 'Prisma', 'Drizzle'].includes(s)) || a('pg', 'postgres', 'mysql2', 'mongoose', 'mongodb', 'better-sqlite3', 'sqlite3', 'kysely', 'typeorm', 'sequelize', '@libsql/client')
    || py('sqlalchemy', 'psycopg', 'psycopg2', 'pymongo', 'peewee', 'django') || f(/\.sql$/) || /d1_databases|\[\[d1/.test(fichiers.filter(x => /wrangler/.test(x)).map(lire).join(''))
  const paiement = stacks.includes('Stripe') || stacks.includes('Shopify') || a('@paypal/*', '@lemonsqueezy/*', 'resend', '@sendgrid/mail', 'twilio') || ia
  const fichiersEnvoyes = a('multer', 'busboy', 'formidable', 'uploadthing', '@uploadthing/*') || grep(/type=["']file["']|storage\s*\.from\([^)]*\)\s*\.upload\(|\.upload\(\s*file/)
  const asynchrone = a('bullmq', 'bull', 'pg-boss', 'inngest', '@trigger.dev/*', '@upstash/qstash', 'node-cron', 'agenda') || py('celery', 'rq', 'dramatiq', 'apscheduler')
    || /"crons"/.test(lire('vercel.json') ?? '') || /\[triggers\]|"triggers"/.test(fichiers.filter(x => /wrangler/.test(x)).map(lire).join('')) || f(/webhook/i)
    || grep(/cron\.schedule|ScriptApp\.newTrigger/)
  const perso = comptes || grep(/type=["']email["']|\bemail\s+text|\bphone\b|\badresse\b|\baddress\b/) || stacks.includes('Shopify')
  const prod = f(/(^|\/)(vercel\.json|netlify\.toml|wrangler\.(toml|jsonc?)|fly\.toml|render\.yaml|railway\.json|Dockerfile|Procfile|app\.yaml|firebase\.json|\.clasp\.json)$|^\.github\/workflows\//)
  const auteurs = new Set((git('log', '--format=%ae', '-n', '500') ?? '').split('\n').filter(e => e && !/noreply|bot|claude|anthropic/i.test(e)))

  const contextes = ['tout']
  const met = (cond, nom) => cond && contextes.push(nom)
  met(web, 'web'); met(api, 'api'); met(comptes, 'comptes'); met(bdd, 'bdd'); met(perso, 'perso'); met(paiement, 'paiement')
  met(ia, 'ia'); met(fichiersEnvoyes, 'fichiers'); met(asynchrone, 'async'); met(prod, 'prod'); met(auteurs.size > 1, 'équipe')
  return { stacks, contextes, deps, code, grep, manifeste }
}

// ─── Les contrôles ───

function auditer() {
  const { estGit, suivis, fichiers } = listerFichiers()
  const p = profil(fichiers)
  const constats = []
  const constat = (cle, lieu = {}) => constats.push({ cle, ...CONTROLES[cle], ...lieu })
  const a = p.contextes.includes.bind(p.contextes)

  // Secrets et motifs, fichier par fichier.
  const lusEnClair = []
  for (const f of fichiers) {
    if (estGit && suivis.has(f) && estFichierSecrets(f)) constat('fichier-secrets-suivi', { fichier: f })
    if (BINAIRE.test(f) || ILLISIBLE.test(f) || taille(f) > 1_000_000) continue
    if (estFichierSecrets(f) && !suivis.has(f)) continue
    const texte = lire(f)
    if (texte === null || texte.includes('\0')) continue
    lusEnClair.push([f, texte])
    for (const s of chercherSecrets(texte, f)) {
      constat(s.bloque ? 'secret' : 'secret-alerte', { fichier: f, ligne: s.ligne, detail: `${s.nom} : ${s.extrait}` })
    }
    for (const v of variablesPubliquesSecretes(texte)) constat('env-public-secret', { fichier: f, detail: v })
    if (CODE.test(f) && !estFichierTest(f)) {
      if (fuiteAdminSupabase(f, texte)) constat('admin-supabase-client', { fichier: f })
      if (estCoteClient(f, texte) && /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|new\s+(?:OpenAI|Anthropic|GoogleGenAI)\s*\(/.test(texte)
        && !/dangerouslyAllowBrowser\s*:\s*false/.test(texte)) constat('ia-client', { fichier: f })
      for (const m of chercherMotifs(texte, f)) {
        // Le graphique de shadcn/ui injecte un CSS tiré de sa propre config, pas d'une entrée extérieure.
        if (m.id === 'html-brut' && /(^|\/)components\/ui\/chart\.[jt]sx$/.test(f)) continue
        constats.push({ cle: m.id, ref: m.ref, gravite: m.gravite, titre: TITRES_MOTIFS[m.id] ?? m.id, conseil: m.message, fichier: f, ligne: m.ligne })
      }
    }
  }

  // .gitignore et modèles d'environnement.
  if (estGit) {
    if (git('check-ignore', '-q', '.env') === null) constat('gitignore-env', { fichier: '.gitignore' })
  } else if (fichiers.some(x => basename(x) === '.env') && !/^\.env\b/m.test(lire('.gitignore') ?? '')) {
    constat('gitignore-env', { fichier: '.gitignore' })
  }
  if (p.grep(/process\.env\.|import\.meta\.env\.|os\.environ|os\.getenv|Deno\.env/) && !fichiers.some(estModeleEnv)) constat('env-example')
  if (existe('.env') && !/Read\(\.\/\.env/.test(lire('.claude/settings.json') ?? '') && !/Read\(\.\/\.env/.test(lire('.claude/settings.local.json') ?? '')) {
    constat('lecture-env-claude', { fichier: '.claude/settings.json' })
  }

  // Bases de données et règles d'accès.
  const sql = fichiers.filter(x => /\.sql$/i.test(x) && /(^|\/)(supabase\/migrations|migrations|db|sql|schema)/i.test(x))
  if (sql.length && p.stacks.includes('Supabase')) {
    const tout = sql.map(x => [x, lire(x) ?? ''])
    const avecRls = new Set()
    let rlsPartout = false
    for (const [, t] of tout) {
      for (const m of t.matchAll(/alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?(?:"?public"?\.)?"?(\w+)"?\s+enable\s+row\s+level\s+security/gi)) avecRls.add(m[1].toLowerCase())
      // RLS activée en boucle : `foreach t in array array['a', 'b'] loop execute format('alter table %I enable row level security', t)`.
      for (const m of t.matchAll(/execute\s+format\(\s*'alter\s+table\s+%[IsL]\s+enable\s+row\s+level\s+security'/gi)) {
        const avant = t.slice(Math.max(0, m.index - 3000), m.index)
        const tableau = [...avant.matchAll(/array\s*\[([^\]]*)\]/gi)].pop()
        if (tableau) for (const n of tableau[1].matchAll(/'(\w+)'/g)) avecRls.add(n[1].toLowerCase())
        else if (/pg_tables|information_schema\.tables/i.test(avant)) rlsPartout = true
      }
    }
    for (const [x, t] of tout) {
      for (const m of t.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?((?:"?\w+"?\.)?)"?(\w+)"?/gi)) {
        const schema = m[1].replace(/[".]/g, '').toLowerCase()
        if ((schema === '' || schema === 'public') && !rlsPartout && !avecRls.has(m[2].toLowerCase())) {
          constat('rls-absente', { fichier: x, ligne: t.slice(0, m.index).split('\n').length, detail: m[2] })
        }
      }
      // `using (true)` en lecture d'un catalogue est normal ; en écriture, c'est une porte ouverte.
      for (const m of t.matchAll(/create\s+policy\b[\s\S]*?;/gi)) {
        const policy = m[0]
        if (!/(?:using|with\s+check)\s*\(\s*true\s*\)/i.test(policy) || MARQUE_IGNORER.test(policy)) continue
        const commande = /\bfor\s+(select|insert|update|delete|all)\b/i.exec(policy)?.[1]?.toLowerCase() ?? 'all'
        const role = /\bto\s+([\w\s,]+?)\s+(?:using|with)\b/i.exec(policy)?.[1]?.toLowerCase() ?? 'public'
        const lieu = { fichier: x, ligne: t.slice(0, m.index).split('\n').length }
        if (commande !== 'select') constat('policy-ouverte', lieu)
        else if (/\b(public|anon)\b/.test(role)) constat('lecture-ouverte', lieu)
      }
      for (const m of t.matchAll(/create\s+(?:or\s+replace\s+)?function[\s\S]*?(?:\$\$|\$\w+\$)/gi)) {
        const entete = m[0]
        if (/security\s+definer/i.test(entete) && !/search_path/i.test(entete)) {
          constat('security-definer', { fichier: x, ligne: t.slice(0, m.index).split('\n').length })
        }
      }
    }
  }
  for (const regles of fichiers.filter(x => /(^|\/)(firestore|storage|database)\.rules$/.test(x))) {
    const t = lire(regles) ?? ''
    if (/allow\s+[\w\s,]+:\s*if\s+true\s*;/.test(t)) constat('regles-firebase', { fichier: regles })
  }
  for (const as of fichiers.filter(x => /(^|\/)appsscript\.json$/.test(x))) {
    const t = lire(as) ?? ''
    if (/"access"\s*:\s*"ANYONE(_ANONYMOUS)?"/.test(t) && /"executeAs"\s*:\s*"USER_DEPLOYING"/.test(t)) constat('apps-script-public', { fichier: as })
  }

  // API : abus, webhooks, appels sortants, validation.
  const serveur = p.code().filter(([x, t]) => !estFichierTest(x) && !estCoteClient(x, t))
  const RATE = /rate[-_ ]?limit|ratelimit|RateLimiter|rateLimiter|slowapi|Limiter\(|throttle|express-slow-down|@upstash\/ratelimit|hono-rate-limiter/i
  const aRate = [...p.deps].some(d => /rate-?limit|ratelimit|throttler|slow-down|limiter/i.test(d))
    || serveur.some(([, t]) => RATE.test(t)) || /ratelimit/i.test(fichiers.filter(x => /wrangler/.test(x)).map(lire).join(''))
  if (a('api') && !aRate) constat(a('ia') ? 'rate-limit-ia' : 'rate-limit')
  for (const [x, t] of serveur) {
    if (/webhook/i.test(x) && !/constructEvent|signature|verify|hmac|createHmac|timingSafeEqual|svix|standardwebhooks|x-hub-signature|validateRequest/i.test(t)) {
      constat('webhook-signature', { fichier: x })
    }
  }
  const sansDelai = serveur.filter(([x, t]) => /\bfetch\s*\(/.test(t) && !/signal\s*:|AbortSignal\.timeout|AbortController|timeout/i.test(t) && /\.[cm]?[jt]sx?$/.test(x))
    .concat(serveur.filter(([x, t]) => /\.py$/.test(x) && /requests\.(get|post|put|patch|delete)\(/.test(t) && !/timeout\s*=/.test(t)))
  if (sansDelai.length) constat('timeout', { detail: `${sansDelai.length} fichier(s) : ${sansDelai.slice(0, 4).map(([x]) => x).join(', ')}${sansDelai.length > 4 ? '…' : ''}` })
  const VALIDATION = ['zod', 'valibot', 'yup', 'joi', 'ajv', '@sinclair/typebox', 'arktype', 'superstruct', '@hapi/joi', 'class-validator', '@effect/schema', 'effect']
  if (a('api') && !VALIDATION.some(v => p.deps.has(v)) && !p.stacks.some(s => ['FastAPI', 'Django'].includes(s))) constat('validation')

  // Navigateur : en-têtes, source maps, extensions.
  if (a('web') && a('prod') && !p.stacks.includes('Shopify')) {
    const config = fichiers.filter(x => /(^|\/)(next\.config\.[cm]?[jt]s|vercel\.json|netlify\.toml|_headers|nginx\.conf|Caddyfile|astro\.config\.[cm]?[jt]s|svelte\.config\.js|nuxt\.config\.[jt]s)$/.test(x)).map(lire).join('\n')
    const enTetes = /Content-Security-Policy|Strict-Transport-Security|X-Content-Type-Options|contentSecurityPolicy/i.test(config)
      || serveur.some(([, t]) => /\bhelmet\b|secureHeaders|Content-Security-Policy|Strict-Transport-Security/.test(t)) || p.deps.has('helmet')
    if (!enTetes && !p.stacks.includes('Extension de navigateur')) constat('en-tetes')
  }
  for (const c of fichiers.filter(x => /(^|\/)(next|vite)\.config\.[cm]?[jt]s$/.test(x))) {
    if (/productionBrowserSourceMaps\s*:\s*true|sourcemap\s*:\s*true/.test(lire(c) ?? '')) constat('source-maps', { fichier: c })
  }
  if (p.manifeste) {
    const m = lire(p.manifeste) ?? ''
    if (/<all_urls>|"\*:\/\/\*\/\*"|"https?:\/\/\*\/\*"/.test(m)) constat('extension-permissions', { fichier: p.manifeste })
  }

  // Tâches planifiées.
  if (/"crons"/.test(lire('vercel.json') ?? '') && !p.grep(/CRON_SECRET/)) constat('cron-secret', { fichier: 'vercel.json' })

  // Dépendances.
  for (const pj of fichiers.filter(x => basename(x) === 'package.json' && !x.includes('node_modules'))) {
    const dossier = dirname(pj) === '.' ? '' : `${dirname(pj)}/`
    const verrou = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'npm-shrinkwrap.json']
    let j = {}
    try {
      j = JSON.parse(lire(pj) ?? '{}')
    } catch {
      continue
    }
    const nbDeps = Object.keys({ ...j.dependencies, ...j.devDependencies }).length
    const racineVerrou = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'].some(v => existe(v))
    if (nbDeps && !verrou.some(v => fichiers.includes(`${dossier}${v}`)) && !(dossier && racineVerrou)) constat('lockfile', { fichier: pj })
    for (const [nom, v] of Object.entries({ ...j.dependencies, ...j.devDependencies })) {
      if (v === '*' || v === 'latest' || v === '') constat('versions-flottantes', { fichier: pj, detail: `${nom}@${v || '(vide)'}` })
    }
  }
  if (!option('--sans-reseau') && !option('--auto') && existe('package-lock.json')) {
    const vuln = npmAudit()
    if (vuln) {
      if (vuln.prod) constat('vulnerabilites', { detail: vuln.prod })
      if (vuln.dev) constat('vulnerabilites-dev', { detail: vuln.dev })
    }
  }

  // Conteneurs.
  for (const d of fichiers.filter(x => /(^|\/)Dockerfile[^/]*$/.test(x))) {
    const t = lire(d) ?? ''
    if (!/^\s*USER\s+(?!root\b)\S+/mi.test(t)) constat('docker-root', { fichier: d })
    for (const m of t.matchAll(/^\s*FROM\s+(\S+)/gmi)) {
      if (!/@sha256:|:[^:/]+$/.test(m[1]) || /:latest$/.test(m[1])) {
        if (!/^(scratch|\$\{?\w+\}?)$/.test(m[1]) && !t.match(new RegExp(`AS\\s+${m[1]}\\b`, 'i'))) constat('docker-latest', { fichier: d, detail: m[1] })
      }
    }
    if (/^\s*(ENV|ARG)\s+\w*(SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE)\w*\s*=?\s*\S/mi.test(t)) constat('docker-secret', { fichier: d })
    const ignore = lire(join(dirname(d), '.dockerignore')) ?? ''
    if (!/(^|\n)\s*\.env/.test(ignore)) constat('dockerignore', { fichier: slash(join(dirname(d), '.dockerignore')) })
  }

  // GitHub Actions.
  for (const w of fichiers.filter(x => /^\.github\/workflows\/.+\.ya?ml$/.test(x))) {
    const t = lire(w) ?? ''
    for (const m of t.matchAll(/uses:\s*['"]?([\w.-]+\/[\w./-]+)@([\w.-]+)/g)) {
      if (!/^(actions|github)\//.test(m[1]) && !/^[0-9a-f]{40}$/.test(m[2])) constat('actions-epinglage', { fichier: w, detail: `${m[1]}@${m[2]}` })
    }
    if (/pull_request_target/.test(t)) constat('actions-prt', { fichier: w })
    if (/run:[^\n]*\$\{\{\s*github\.(event\.(issue|pull_request|comment|review|head_commit|commits|discussion)|head_ref)/.test(t)
      || /run:\s*\|[\s\S]*?\$\{\{\s*github\.(event\.(issue|pull_request|comment|review|head_commit)|head_ref)/.test(t)) constat('actions-injection', { fichier: w })
    if (!/^permissions:/m.test(t)) constat('actions-permissions', { fichier: w })
  }

  // Vie privée.
  const TRACEURS = /googletagmanager\.com|google-analytics\.com|\bgtag\(|\bfbq\(|connect\.facebook\.net|static\.hotjar\.com|clarity\.ms|analytics\.tiktok\.com|snap\.licdn\.com|plausible\.io\/js\/script\.manual/
  const CONSENTEMENT = /tarteaucitron|axeptio|didomi|cookiebot|onetrust|klaro|cookieconsent|vanilla-cookieconsent|gtag\(\s*['"]consent['"]|usercentrics|iubenda|cookie-?banner|consentement/i
  const pages = lusEnClair.filter(([x]) => /\.(html?|[cm]?[jt]sx?|vue|svelte|astro|liquid)$/.test(x))
  if (pages.some(([, t]) => TRACEURS.test(t)) && !pages.some(([, t]) => CONSENTEMENT.test(t)) && ![...p.deps].some(d => CONSENTEMENT.test(d))) {
    constat('traceurs', { detail: pages.filter(([, t]) => TRACEURS.test(t)).slice(0, 3).map(([x]) => x).join(', ') })
  }

  // Performance et poids.
  const lourdes = fichiers.filter(x => IMAGE.test(x) && /(^|\/)(public|static|assets|src|images|img)\//.test(x) && taille(x) > 500_000)
  if (lourdes.length) constat('images-lourdes', { detail: `${lourdes.length} image(s) > 500 Ko : ${lourdes.slice(0, 4).join(', ')}${lourdes.length > 4 ? '…' : ''}` })
  const gros = [...suivis].filter(x => taille(x) > 5_000_000 || /(^|\/)node_modules\//.test(x))
  if (gros.length) constat('gros-fichiers', { detail: `${gros.length} fichier(s) : ${gros.slice(0, 3).join(', ')}${gros.length > 3 ? '…' : ''}` })

  // Qualité.
  const source = p.code().filter(([x]) => !estFichierTest(x) && !/(^|\/)(scripts?|bin|cli|tools|outils)\/|\.config\.|(^|\/)(audit|etat|reglages)\.mjs$/.test(x))
  const compter = re => source.map(([x, t]) => [x, t.split('\n').filter(l => re.test(l) && !MARQUE_IGNORER.test(l)).length]).filter(([, n]) => n)
  const resume = liste => {
    const total = liste.reduce((s, [, n]) => s + n, 0)
    return `${total} en tout · ${liste.sort((x, y) => y[1] - x[1]).slice(0, 3).map(([x, n]) => `${x} (${n})`).join(', ')}`
  }
  const logs = compter(/^\s*console\.(log|debug)\(|^\s*print\(/)
  if (logs.length) constat('console-log', { detail: resume(logs) })
  const todos = compter(/\b(TODO|FIXME|XXX|HACK)\b/)
  if (todos.length) constat('todo', { detail: resume(todos) })
  const lache = compter(/@ts-ignore|@ts-nocheck|:\s*any\b|\bas\s+any\b|<any>/)
  if (lache.length) constat('typage-lache', { detail: resume(lache) })
  const commente = source.map(([x, t]) => {
    let suite = 0
    let blocs = 0
    for (const l of t.split('\n')) {
      if (/^\s*(\/\/|#)\s*(const|let|var|function|return|if\s*\(|for\s*\(|import\s|export\s|await\s|def\s|class\s|print\(|console\.|\}|\w+\(.*\);?\s*$)/.test(l)) suite++
      else {
        if (suite >= 3) blocs++
        suite = 0
      }
    }
    return [x, blocs + (suite >= 3 ? 1 : 0)]
  }).filter(([, n]) => n)
  if (commente.length) constat('code-commente', { detail: resume(commente) })
  for (const ts of fichiers.filter(x => /(^|\/)tsconfig\.json$/.test(x) && x.split('/').length <= 2)) {
    const t = lire(ts) ?? ''
    if (!/"strict"\s*:\s*true/.test(t) && !/"extends"/.test(t)) constat('ts-strict', { fichier: ts })
  }
  const nbCode = source.length
  const aDesTests = fichiers.some(estFichierTest) || [...p.deps].some(d => /^(vitest|jest|mocha|ava|@playwright\/test|cypress|pytest)$/.test(d)) || /pytest/.test(fichiers.filter(x => /pyproject|requirements/.test(x)).map(lire).join(''))
  if (nbCode > 15 && !aDesTests) constat('sans-tests')
  if (!fichiers.some(x => /^readme(\.\w+)?$/i.test(x))) constat('readme')
  // Un composant qui pose un intervalle ou un écouteur sans jamais le retirer : il survit au composant.
  const fuites = source.filter(([x, t]) => /\.(jsx|tsx|vue|svelte)$/.test(x)
    && ((/\bsetInterval\s*\(/.test(t) && !/clearInterval/.test(t))
      || (/\.addEventListener\s*\(/.test(t) && !/removeEventListener|signal\s*:|once\s*:\s*true/.test(t))))
  if (fuites.length) constat('fuite-memoire', { detail: `${fuites.length} fichier(s) : ${fuites.slice(0, 4).map(([x]) => x).join(', ')}${fuites.length > 4 ? '…' : ''}` })

  return { p, constats, estGit }
}

function npmAudit() {
  const lancer = extra => {
    try {
      return execFileSync('npm', ['audit', '--json', ...extra], { cwd: racine, encoding: 'utf8', timeout: 60_000, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'ignore'] })
    } catch (e) {
      return e.stdout || null
    }
  }
  const resume = sortie => {
    try {
      const v = JSON.parse(sortie)?.metadata?.vulnerabilities
      if (!v || !v.total) return null
      const morceaux = ['critical', 'high', 'moderate', 'low'].filter(n => v[n]).map(n => `${v[n]} ${{ critical: 'critiques', high: 'élevées', moderate: 'moyennes', low: 'faibles' }[n]}`)
      return morceaux.join(', ')
    } catch {
      return null
    }
  }
  const tout = lancer([])
  if (tout === null) return null
  const prod = resume(lancer(['--omit=dev']))
  const total = resume(tout)
  return { prod, dev: total && total !== prod ? `${total} au total, dont dev` : null }
}

// ─── Historique git ───

function historique() {
  const sortie = git('log', '-p', '--all', '-U0', '--no-color', '--format=commit %h', '-n', '3000')
  if (!sortie) return []
  const vus = new Map()
  let commit = ''
  let fichier = ''
  for (const l of sortie.split('\n')) {
    if (l.startsWith('commit ')) commit = l.slice(7)
    else if (l.startsWith('+++ ')) fichier = l.replace(/^\+\+\+ (b\/)?/, '')
    else if (l.startsWith('+') && fichier && !estModeleEnv(fichier)) {
      for (const s of chercherSecrets(l.slice(1), fichier)) {
        if (!s.bloque) continue
        const cle = `${s.id}${s.extrait}`
        if (!vus.has(cle)) vus.set(cle, { fichier, detail: `${s.nom} : ${s.extrait}, commit ${commit}` })
      }
    }
  }
  return [...vus.values()]
}

// ─── Revue manuelle : ce qu'un audit complet a ajouté (revue.json) ───

function revue() {
  const r = lireJson(join(racine, DOSSIER, 'revue.json'))
  return (Array.isArray(r) ? r : r?.constats ?? []).filter(c => (c.statut ?? 'ouvert') === 'ouvert')
}

// ─── Le mode guard d'un projet : mode.json, le bloc du CLAUDE.md ───

const PHASES = ['conception', 'en cours', 'en ligne']
const DEBUT = '<!-- guard-system-100s:debut -->'
const FIN = '<!-- guard-system-100s:fin -->'
const FIN_RECAP = '<!-- recap-system-100s:fin -->'
const fichierMode = () => join(racine, DOSSIER, 'mode.json')
const fichierJournal = () => join(racine, DOSSIER, 'JOURNAL.md')
const phaseValide = texte => PHASES.find(p => p === String(texte ?? '').toLowerCase().replace(/[-_]/g, ' ').trim()) ?? null

function lireJson(chemin) {
  try {
    return JSON.parse(readFileSync(chemin, 'utf8'))
  } catch {
    return null
  }
}

function ecrireMode(mode) {
  mkdirSync(join(racine, DOSSIER), { recursive: true })
  writeFileSync(fichierMode(), `${JSON.stringify(mode, null, 2)}\n`)
}

function nomProjet() {
  return lireJson(join(racine, 'package.json'))?.name || basename(racine)
}

// Les règles du bloc, choisies selon ce que le projet contient : un site vitrine n'a pas celles des comptes.
function blocClaude(mode) {
  const c = new Set(mode.contextes)
  const regles = [
    c.has('bdd') && '- Une table est créée : sa Row Level Security et ses policies dans la même migration (BDD-01, IAM-03).',
    c.has('api') && '- Une route, une Server Action, une Edge Function ou un webhook est créé : entrées validées par un schéma, droit vérifié sur la ressource elle-même, rate limiting si elle coûte, timeout sur chaque appel sortant (INJ-01, IAM-01, API-01, API-03).',
    c.has('comptes') && "- Une donnée propre à un compte : le droit se vérifie côté serveur, jamais seulement dans l'interface (IAM-02).",
    c.has('ia') && "- Un appel d'IA : côté serveur, plafonné par utilisateur et par `max_tokens`, sa réponse traitée comme une entrée hostile (IA-04, IA-05).",
    c.has('paiement') && '- Un paiement ou un webhook : signature vérifiée sur le corps brut, traitement idempotent (API-04, API-05, API-09).',
    c.has('web') && "- Un contenu venu d'ailleurs (utilisateur, site collecté, IA) s'affiche en texte, et seules les URL `https://` vont dans un lien ou une image (WEB-01, WEB-02).",
    c.has('perso') && '- Une donnée personnelle de plus : un but, une durée de conservation, une ligne dans la politique de confidentialité (LEG-01, LEG-09).',
    "- Une dépendance, un service ou une clé arrive : nécessaire, maintenu, bien le bon paquet ; la clé dans l'environnement du serveur (LIV-01, SEC-01).",
    mode.phase === 'en ligne' && '- Avant chaque mise en ligne : `/guard-system-100s -prod` ; une migration reste compatible avec la version encore en ligne (LIV-11).',
  ].filter(Boolean)
  return [
    DEBUT,
    '## Mode guard-system-100s',
    '',
    `Ce projet est sous la garde de guard-system-100s. Son suivi est dans \`${DOSSIER}/\` (ignoré par git) ; \`${DOSSIER}/JOURNAL.md\` garde ce qui a été trouvé, corrigé et adapté, avec la notion à retenir à chaque fois.`,
    `Phase : ${mode.phase}`,
    `Contextes : ${mode.contextes.filter(x => x !== 'tout').join(', ') || 'aucun particulier'}`,
    '',
    "Tout au long du projet, sans attendre qu'on le demande :",
    ...regles,
    `- Une faille ou un point faible est corrigé, ou une règle est appliquée d'une façon qui n'est pas évidente : une entrée « Corrigé » ou « Adapté » à la fin de \`${DOSSIER}/JOURNAL.md\` (ce qui a été fait, et la notion à retenir, en deux ou trois lignes).`,
    `- Les décisions de \`${DOSSIER}/CONCEPTION.md\` sont suivies ; une décision qui change y est mise à jour.`,
    '- Un jalon : `/guard-system-100s` ; une fonctionnalité finie : `-relire`.',
    "Le contrôle automatique repasse seul quand le code change, et ses nouveaux constats arrivent dans la conversation : les traiter, ou dire à l'utilisateur pourquoi ils n'en sont pas.",
    '',
    'Commandes : `/guard-system-100s` · `-relire` · `-audit` · `-concevoir` · `-prod` · `-nettoyer` · `-notion <nom>` · `-phase <phase>` · `-desactiver`.',
    FIN,
  ].join('\n')
}

// Pose, remplace ou retire (bloc null) le bloc du CLAUDE.md du projet, après celui du mode recap s'il y en a un.
function poserBloc(bloc) {
  const fichier = join(racine, 'CLAUDE.md')
  const texte = existsSync(fichier) ? readFileSync(fichier, 'utf8').replace(/\r\n/g, '\n') : ''
  const present = new RegExp(`\\n*${DEBUT}[\\s\\S]*?${FIN}\\n?`)
  let neuf
  if (present.test(texte)) neuf = texte.replace(present, bloc ? `\n\n${bloc}\n` : '\n')
  else if (!bloc) return
  else if (texte.includes(FIN_RECAP)) {
    const i = texte.indexOf(FIN_RECAP) + FIN_RECAP.length
    neuf = `${texte.slice(0, i)}\n\n${bloc}\n${texte.slice(i)}`
  } else neuf = `${texte.trim()}${texte.trim() ? '\n\n' : ''}${bloc}\n`
  const propre = neuf.replace(/\n{3,}/g, '\n\n').trim()
  if (propre) writeFileSync(fichier, `${propre}\n`)
}

function activer(ancien, p) {
  const phase = phaseValide(valeur('--phase')) ?? ancien?.phase ?? (p.code().length ? 'en cours' : 'conception')
  const mode = {
    actif: true, nom: valeur('--nom') ?? ancien?.nom ?? nomProjet(), phase,
    contextes: p.contextes, depuis: ancien?.depuis ?? new Date().toISOString(),
  }
  ecrireMode(mode)
  poserBloc(blocClaude(mode))
  return mode
}

// Le projet grandit (une IA, des paiements arrivent) : le bloc ajoute les règles qui vont avec.
function suivreContextes(mode, p) {
  const ajout = p.contextes.filter(c => !mode.contextes.includes(c))
  if (!ajout.length) return []
  mode.contextes = [...mode.contextes, ...ajout]
  ecrireMode(mode)
  poserBloc(blocClaude(mode))
  return ajout
}

function changerPhase(texte) {
  const phase = phaseValide(texte)
  const mode = lireJson(fichierMode())
  if (!phase) return console.error(`Phase inconnue : « ${texte ?? ''} ». Phases : ${PHASES.join(', ')}.`), 2
  if (!mode?.actif) return console.error('Le mode guard n’est pas allumé dans ce projet : --activer d’abord.'), 2
  const avant = mode.phase
  mode.phase = phase
  ecrireMode(mode)
  poserBloc(blocClaude(mode))
  noterAuJournal([`### ${horodatage()} · Phase : ${phase}\nAvant : ${avant}. Le bloc du CLAUDE.md suit la nouvelle phase.`])
  console.log(`Phase : ${avant} → ${phase}. Bloc du CLAUDE.md mis à jour.`)
  return 0
}

function desactiver() {
  const mode = lireJson(fichierMode())
  if (!mode?.actif) return console.log('Le mode guard n’est pas allumé dans ce projet.'), 0
  mode.actif = false
  ecrireMode(mode)
  poserBloc(null)
  noterAuJournal([`### ${horodatage()} · Mode éteint\nLe bloc du CLAUDE.md est retiré ; le journal et les rapports restent ici.`])
  console.log('Mode guard éteint : bloc retiré du CLAUDE.md, journal gardé.')
  return 0
}

// ─── Le journal : ce qui est apparu, ce qui a disparu, et la notion à retenir ───

const deux = n => String(n).padStart(2, '0')
const horodatage = (d = new Date()) => `${deux(d.getDate())}/${deux(d.getMonth() + 1)} ${deux(d.getHours())}:${deux(d.getMinutes())}`

let savoir = null
// Le « Pourquoi » et les notions de chaque contrôle du référentiel, la définition de chaque notion du glossaire.
function referentiel() {
  if (savoir) return savoir
  savoir = { controles: new Map(), notions: new Map() }
  try {
    for (const f of readdirSync(join(ICI, 'references')).filter(x => /^\d\d-.+\.md$/.test(x))) {
      for (const bloc of readFileSync(join(ICI, 'references', f), 'utf8').split(/\n(?=### )/)) {
        const id = /^### ([A-Z]+-\d\d) /.exec(bloc)?.[1]
        if (!id) continue
        const pourquoi = /\*\*Pourquoi\*\* — ([\s\S]*?)(?=\n\*\*(?:Vérifier|Corriger|Piège|Notions)\*\*|\n---|$)/.exec(bloc)?.[1].replace(/\s+/g, ' ').trim() ?? ''
        const notions = (/\*\*Notions\*\* — (.+)/.exec(bloc)?.[1] ?? '').split(/,\s*/).map(n => n.trim()).filter(Boolean)
        savoir.controles.set(id, { pourquoi, notions })
      }
    }
    for (const l of readFileSync(join(ICI, 'NOTIONS.md'), 'utf8').split('\n')) {
      const m = /^- \*\*(.+?)\*\* — (.+?)(?: → .*)?$/.exec(l)
      if (m) savoir.notions.set(m[1].toLowerCase(), { nom: m[1], definition: m[2] })
    }
  } catch {
    // Sans référentiel lisible, le journal garde le titre et la correction.
  }
  return savoir
}

// Les deux premières phrases : une rubrique courte, pas un cours.
const phrases = (texte, n) => texte.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«`(])/).slice(0, n).join(' ')

function aRetenir(ref) {
  const s = referentiel()
  for (const n of s.controles.get(ref)?.notions ?? []) {
    const notion = s.notions.get(n.toLowerCase())
    if (notion) return `**${notion.nom}** : ${notion.definition}`
  }
  return null
}

const ENTETE = nom => `# Journal guard-system-100s · ${nom}

Ce que le garde a trouvé dans ce projet, ce qui a été corrigé ou adapté, et ce qu'il y a à en retenir.
Le contrôle automatique écrit les entrées « Trouvé » et « Résolu » ; Claude écrit les « Corrigé »
(une faille réparée, et comment) et les « Adapté » (une règle appliquée en codant, et pourquoi).
Pour aller plus loin sur une notion : \`/guard-system-100s -notion <nom>\`. Le plus récent en bas.

<!-- guard:etat -->
<!-- /guard:etat -->
`

function ligneEtat(resultat, mode) {
  const { bloquant, important, conseillé } = resultat.compte
  const bilan = bloquant ? `✗ ${bloquant} bloquant(s) · ${important} important(s)` : `✓ rien de bloquant · ${important} important(s)`
  return `**Aujourd'hui** : ${bilan} · ${conseillé} conseillé(s) — dernier contrôle le ${horodatage(new Date(resultat.date))}${mode ? ` · phase ${mode.phase}` : ''}`
}

function noterAuJournal(entrees, resultat = null, mode = null) {
  const fichier = fichierJournal()
  mkdirSync(join(racine, DOSSIER), { recursive: true })
  let texte = existsSync(fichier) ? readFileSync(fichier, 'utf8').replace(/\r\n/g, '\n') : ENTETE(mode?.nom ?? nomProjet())
  if (resultat) texte = texte.replace(/<!-- guard:etat -->[\s\S]*?<!-- \/guard:etat -->/, `<!-- guard:etat -->\n${ligneEtat(resultat, mode)}\n<!-- /guard:etat -->`)
  if (entrees.length) texte = `${texte.trimEnd()}\n\n${entrees.join('\n\n')}\n`
  writeFileSync(fichier, texte)
}

// Une clé par contrôle et par fichier : un numéro de ligne qui bouge n'est pas un changement.
const clesDe = c => (c.fichiers?.length ? c.fichiers : ['']).map(f => `${c.cle}|${f}`)

// Ce qui est apparu ou a disparu depuis le contrôle précédent. Le contrôle automatique ne note que
// les bloquants et les importants, pour que le journal reste lisible.
function journaliser(resultat, precedent, { auto, mode, notes }) {
  const garde = c => !auto || c.gravite === 'bloquant' || c.gravite === 'important'
  const index = constats => {
    const m = new Map()
    for (const c of constats ?? []) for (const k of clesDe(c)) m.set(k, c)
    return m
  }
  const avant = index(precedent?.constats)
  const apres = index(resultat.constats)
  const regrouper = (de, sans) => {
    const g = new Map()
    for (const [k, c] of de) {
      if (sans.has(k) || !garde(c)) continue
      if (!g.has(c.cle)) g.set(c.cle, { c, fichiers: [] })
      const f = k.slice(k.indexOf('|') + 1)
      if (f) g.get(c.cle).fichiers.push(f)
    }
    return [...g.values()].sort((x, y) => ORDRE[x.c.gravite] - ORDRE[y.c.gravite])
  }
  const nouveaux = regrouper(apres, avant)
  const resolus = regrouper(avant, apres)
  const quand = horodatage()
  const ou = ({ c, fichiers }) => {
    const lieux = fichiers.length ? c.lieux.filter(l => fichiers.some(f => l.startsWith(f))) : c.lieux
    return lieux.slice(0, 4).map(l => `\`${l}\``).join(', ') + (lieux.length > 4 ? ` et ${lieux.length - 4} autre(s)` : '')
  }
  const entrees = [...notes]
  for (const n of nouveaux) {
    const { c } = n
    const lignes = [`### ${quand} · Trouvé · ${c.ref} · ${c.titre} · ${c.gravite}`, `Où : ${ou(n) || 'dans le projet'}`]
    if (c.gravite !== 'conseillé') {
      const pourquoi = referentiel().controles.get(c.ref)?.pourquoi
      if (pourquoi) lignes.push(`- **Le risque** — ${phrases(pourquoi, 2)}`)
      if (c.conseil) lignes.push(`- **La correction** — ${c.conseil}`)
    }
    const retenir = aRetenir(c.ref)
    if (retenir) lignes.push(`- **À retenir** — ${retenir}`)
    entrees.push(lignes.join('\n'))
  }
  for (const { c, fichiers } of resolus) {
    const lesquels = fichiers.length ? ` : ${fichiers.slice(0, 4).map(f => `\`${f}\``).join(', ')}${fichiers.length > 4 ? '…' : ''}` : ''
    entrees.push(`### ${quand} · Résolu · ${c.ref} · ${c.titre}\nLe contrôle ne le voit plus${lesquels}.`)
  }
  noterAuJournal(entrees, resultat, mode)
  return { nouveaux, resolus }
}

// ─── Sortie ───

const ORDRE = { bloquant: 0, important: 1, conseillé: 2 }

function grouper(constats) {
  const groupes = new Map()
  for (const c of constats) {
    const cle = `${c.cle}|${c.titre}`
    if (!groupes.has(cle)) groupes.set(cle, { ...c, lieux: [], fichiers: [] })
    const g = groupes.get(cle)
    const lieu = [c.fichier ? `${c.fichier}${c.ligne ? `:${c.ligne}` : ''}` : '', c.detail ?? ''].filter(Boolean).join(' — ')
    if (lieu) g.lieux.push(lieu)
    if (c.fichier && !g.fichiers.includes(c.fichier)) g.fichiers.push(c.fichier)
  }
  return [...groupes.values()].sort((x, y) => ORDRE[x.gravite] - ORDRE[y.gravite])
}

function principal() {
  if (option('--staged') || option('--push')) process.exit(controleSortant())
  if (option('--installer-git')) process.exit(installerGit())
  if (!existsSync(racine)) {
    console.error(`Dossier introuvable : ${racine}`)
    process.exit(2)
  }
  if (option('--desactiver')) process.exit(desactiver())
  if (option('--phase') && !option('--activer')) process.exit(changerPhase(valeur('--phase')))

  const auto = option('--auto')
  const activation = option('--activer')
  const { p, constats, estGit } = auditer()
  if (option('--historique') && estGit) {
    for (const h of historique()) constats.push({ cle: 'historique', ...CONTROLES.historique, fichier: h.fichier, detail: h.detail })
  }
  const manuels = revue().map(c => ({ cle: `revue:${c.id}`, ref: c.id, gravite: c.gravite, titre: c.titre, conseil: c.correction ?? c.conseil ?? '', fichier: c.fichier, ligne: c.ligne, revue: true }))
  const groupes = grouper([...constats, ...manuels])
  const compte = { bloquant: 0, important: 0, conseillé: 0 }
  for (const g of groupes) compte[g.gravite]++
  const commit = git('rev-parse', '--short', 'HEAD')?.trim() ?? null

  const resultat = {
    version: 1, projet: nomProjet(), racine: slash(racine), date: new Date().toISOString(), commit,
    type: manuels.length ? 'complet' : 'rapide', historique: option('--historique'),
    profil: { stacks: p.stacks, contextes: p.contextes }, compte,
    constats: groupes.map(({ lieux, fichiers, cle, ref, gravite, titre, conseil, revue: r }) => ({ cle, ref, gravite, titre, conseil, lieux, fichiers, revue: Boolean(r) })),
    outils: Object.fromEntries(['gitleaks', 'semgrep', 'osv-scanner'].map(o => [o, outilPresent(o)])),
  }

  // Le mode : allumé maintenant, ou déjà allumé (ses contextes suivent le projet qui grandit).
  const ancien = lireJson(fichierMode())
  const mode = activation ? activer(ancien, p) : ancien?.actif ? ancien : null
  const notes = []
  if (activation && !ancien?.actif) {
    notes.push(`### ${horodatage()} · Mode allumé · phase ${mode.phase}\nContextes : ${mode.contextes.filter(x => x !== 'tout').join(', ') || 'aucun particulier'}. Le premier contrôle suit : tout ce qu'il trouve est noté « Trouvé ».`)
  } else if (mode && !activation) {
    const ajout = suivreContextes(mode, p)
    if (ajout.length) notes.push(`### ${horodatage()} · Nouveaux contextes : ${ajout.join(', ')}\nLe projet a grandi : le bloc du CLAUDE.md ajoute les règles qui vont avec.`)
  }
  if (mode) resultat.mode = { phase: mode.phase, nom: mode.nom }

  // Le contrôle précédent se lit avant d'être remplacé : le journal note la différence.
  const precedent = lireJson(join(racine, DOSSIER, 'audit.json'))
  let bilan = null
  if (option('--ecrire') || activation || auto) {
    ecrire(resultat)
    if (mode) bilan = journaliser(resultat, activation && !ancien?.actif ? null : precedent, { auto, mode, notes })
  }

  // Le garde ne lit que les nouveaux points : le reste est dans audit.json et le journal.
  if (auto) {
    const nouveaux = (bilan?.nouveaux ?? []).map(({ c, fichiers }) => ({ ref: c.ref, gravite: c.gravite, titre: c.titre, lieu: fichiers[0] ?? c.lieux[0] ?? '' }))
    console.log(JSON.stringify({ nouveaux }))
    process.exit(0)
  }
  if (bilan) resultat.journal = { nouveaux: bilan.nouveaux.length, resolus: bilan.resolus.length, activation }
  if (option('--json')) console.log(JSON.stringify(resultat, null, 2))
  else afficher(resultat)
  process.exit(compte.bloquant ? 1 : 0)
}

function outilPresent(nom) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [nom], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function ecrire(resultat) {
  mkdirSync(join(racine, DOSSIER), { recursive: true })
  writeFileSync(join(racine, DOSSIER, 'audit.json'), `${JSON.stringify(resultat, null, 2)}\n`)
  // Le rapport décrit les points faibles du projet : il ne doit pas partir dans un dépôt public.
  const gi = join(racine, '.gitignore')
  const contenu = existsSync(gi) ? readFileSync(gi, 'utf8') : ''
  if (!contenu.split(/\r?\n/).some(l => l.trim().replace(/\/$/, '') === DOSSIER)) {
    writeFileSync(gi, `${contenu}${contenu && !contenu.endsWith('\n') ? '\n' : ''}# guard-system-100s : le rapport d'audit liste les points faibles du projet\n${DOSSIER}/\n`)
    resultat.gitignoreAjoute = true
  }
}

function afficher(r) {
  const libelle = { bloquant: 'BLOQUANT', important: 'IMPORTANT', conseillé: 'CONSEILLÉ' }
  const lignes = []
  lignes.push(`guard-system-100s · ${r.type === 'complet' ? 'contrôle + revue' : 'contrôle automatique'} · ${r.projet} · ${r.date.slice(0, 10)}${r.commit ? ` · commit ${r.commit}` : ''}`)
  lignes.push(`Stack : ${r.profil.stacks.join(', ') || '(non reconnue)'}`)
  lignes.push(`Contextes : ${r.profil.contextes.join(', ')}`)
  lignes.push('')
  const { bloquant, important, conseillé } = r.compte
  lignes.push(bloquant ? `✗ ${bloquant} bloquant(s) · ${important} important(s) · ${conseillé} conseillé(s)` : `✓ rien de bloquant · ${important} important(s) · ${conseillé} conseillé(s)`)
  let section = ''
  for (const c of r.constats) {
    if (c.gravite !== section) {
      section = c.gravite
      lignes.push('', `── ${libelle[section]} ──`)
    }
    lignes.push(`${c.ref.padEnd(7)} ${c.titre}${c.revue ? ' (revue)' : ''}`)
    for (const l of c.lieux.slice(0, 5)) lignes.push(`        · ${l}`)
    if (c.lieux.length > 5) lignes.push(`        · … et ${c.lieux.length - 5} autre(s)`)
    if (c.conseil) lignes.push(`        → ${c.conseil}`)
  }
  lignes.push('')
  lignes.push('Le scanner ne voit pas : qui a le droit de faire quoi sur chaque ressource, la logique métier, les réglages des fournisseurs. → /guard-system-100s -audit')
  const manquants = Object.entries(r.outils).filter(([, v]) => !v).map(([k]) => k)
  if (manquants.length) lignes.push(`Outils en plus, absents : ${manquants.join(', ')} (/guard-system-100s -installer)`)
  if (r.gitignoreAjoute) lignes.push(`${DOSSIER}/ ajouté à .gitignore (le rapport liste les points faibles du projet).`)
  if (r.mode) {
    lignes.push(r.journal?.activation
      ? `Mode guard allumé (phase ${r.mode.phase}) : bloc ajouté au CLAUDE.md, suivi automatique en place, journal : ${DOSSIER}/JOURNAL.md`
      : `Mode guard · phase ${r.mode.phase} · journal : ${DOSSIER}/JOURNAL.md`)
    if (r.journal && !r.journal.activation) lignes.push(`Journal : ${r.journal.nouveaux} constat(s) nouveau(x), ${r.journal.resolus} résolu(s) notés.`)
  }
  console.log(lignes.join('\n'))
}

principal()
