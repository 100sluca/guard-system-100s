# 01 · Secrets et configuration (SEC)

Un secret, c'est tout ce qui donne un pouvoir à celui qui le possède : clé d'API, jeton, mot de
passe, chaîne de connexion à une base, clé privée, secret de webhook. La règle d'or : **un secret
ne vit jamais dans le code**. Il vit dans l'environnement du serveur qui en a besoin, et nulle part
ailleurs. Une clé publiée, même trente secondes, est à considérer comme volée : des robots
parcourent GitHub, npm et les sites en continu pour les ramasser.

---

### SEC-01 · Aucun secret dans le code source ni dans la configuration commitée
`bloquant` · `tout` · `auto`

**Pourquoi** — Tout ce qui est commité finit par être lu : par un collaborateur, par un robot si le
dépôt devient public, par quiconque récupère une copie. Une clé OpenAI en dur peut coûter des
milliers d'euros en une nuit ; une clé AWS sert à miner de la cryptomonnaie sur ton compte.
**Vérifier** — `node audit.mjs` (motifs de clés connues et chaînes à forte entropie affectées à des
noms comme `apiKey`, `secret`, `token`, `password`). Regarder aussi les fichiers de config
(`config.js`, `settings.py`, `appsscript.json`, `wrangler.toml`, `docker-compose.yml`) et les tests.
**Corriger** — Lire le secret depuis l'environnement, au seul endroit qui en a besoin :
```js
// Node, Next.js (côté serveur), Workers via env
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
```
```python
import os
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]  # plante au démarrage s'il manque : c'est voulu
```
```js
// Google Apps Script : les propriétés du script, jamais une constante
const cle = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')
```
**Piège** — « Je l'enlèverai avant de pousser. » Le commit intermédiaire garde la clé dans
l'historique (SEC-05). La clé n'entre jamais dans un fichier suivi, même une minute.
**Notions** — Secrets Management, Configuration (12-factor)

---

### SEC-02 · Aucun secret dans ce qui part au navigateur ou dans une app mobile
`bloquant` · `web` · `auto`

**Pourquoi** — Le code envoyé au navigateur est lisible par tous (F12 → Sources, ou le `.js`
téléchargé). Les variables préfixées `VITE_`, `NEXT_PUBLIC_`, `REACT_APP_`, `EXPO_PUBLIC_`,
`PUBLIC_` (Astro, SvelteKit) ou `NUXT_PUBLIC_` sont **recopiées en clair dans le bundle**. Une
`VITE_OPENAI_API_KEY` est une clé publiée. Une app mobile se décompile en quelques minutes : même
règle.
**Vérifier** — `node audit.mjs` (variables publiques au nom de secret, clés connues dans les
fichiers client). Après build : chercher les préfixes de clés dans `dist/`, `.next/static/`,
`build/`.
**Corriger** — Le navigateur appelle **ton** serveur ; ton serveur, qui garde la clé, appelle le
service. Selon la stack : une route API Next.js (`app/api/.../route.ts`), une Supabase Edge
Function, un Cloudflare Worker, une fonction Vercel. Ce relais est aussi l'endroit où mettre le
rate limiting (API-01) et la vérification de l'utilisateur (IAM).
**Piège** — Croire qu'une clé « cachée » dans le code minifié ou découpée en morceaux est protégée.
Elle ne l'est pas : il suffit de lire les requêtes réseau.
**Notions** — Secrets Management, API Gateways

---

### SEC-03 · Les fichiers de secrets locaux sont ignorés par git
`bloquant` · `tout` · `auto`

**Pourquoi** — `.env` est fait pour contenir de vraies valeurs. S'il n'est pas dans `.gitignore`,
un simple `git add .` le publie.
**Vérifier** — `git check-ignore -v .env` doit répondre une règle. `git ls-files | grep -i env`
ne doit lister que des modèles (`.env.example`). Fichiers concernés : `.env`, `.env.local`,
`.env.*.local`, `.env.production`, `.dev.vars` (Cloudflare), `.streamlit/secrets.toml`, les clés de
compte de service Google (`*.json` avec `"private_key"`), `*.pem`, `*.p12`, `id_rsa`.
**Corriger** — Dans `.gitignore`, dès la création du projet :
```gitignore
.env
.env.*
!.env.example
.dev.vars
*.pem
```
Si le fichier est déjà suivi : `git rm --cached .env`, commit, puis SEC-05 et SEC-06 (la clé a
déjà été publiée dans l'historique).
**Notions** — Secrets Management

---

### SEC-04 · Un `.env.example` liste les variables, sans aucune vraie valeur
`conseillé` · `tout` · `auto`

**Pourquoi** — Il documente ce dont le projet a besoin pour démarrer, sans rien révéler. Sans lui,
on finit par s'envoyer des `.env` complets par message, ou par oublier une variable en prod.
**Vérifier** — Le fichier existe, chaque variable lue par le code y figure, les valeurs sont vides
ou factices (`sk-...`, `changeme`).
**Corriger** —
```dotenv
# Clé secrète Stripe (dashboard Stripe → Développeurs → Clés API). Serveur uniquement.
STRIPE_SECRET_KEY=
# Publique par conception (protégée par la Row Level Security)
VITE_SUPABASE_PUBLISHABLE_KEY=
```
Le tableau `RESSOURCES.md` du mode recap reprend les mêmes noms, jamais les valeurs.
**Notions** — Configuration (12-factor)

---

### SEC-05 · L'historique git ne contient aucun secret
`bloquant` · `tout` · `auto`

**Pourquoi** — Supprimer la clé dans un nouveau commit ne l'efface pas : elle reste dans
l'historique, que n'importe qui peut parcourir avec `git log -p`.
**Vérifier** — `node audit.mjs --historique` (ou `gitleaks git` s'il est installé).
**Corriger** — D'abord SEC-06 : **révoquer la clé**, c'est la seule vraie correction. Ensuite
seulement, si le dépôt est public ou partagé, réécrire l'historique (`git filter-repo
--replace-text`) et forcer la publication, en sachant que les copies, forks et caches déjà faits
gardent la clé.
**Piège** — Passer une heure à nettoyer l'historique sans avoir révoqué la clé. L'ordre compte :
révoquer, remplacer, puis nettoyer.
**Notions** — Secrets Management

---

### SEC-06 · Une clé exposée est révoquée et remplacée, pas seulement retirée du code
`bloquant` · `tout`

**Pourquoi** — Une clé exposée a pu être copiée ; on ne peut pas le savoir. Tant qu'elle est
valide, l'attaquant a les mêmes droits que toi.
**Vérifier** — Pour chaque secret trouvé par SEC-01, SEC-02 ou SEC-05 : a-t-il été révoqué chez le
fournisseur ? Regarder aussi la facturation et les journaux du fournisseur sur la période.
**Corriger** — Chez le fournisseur : créer une nouvelle clé, la mettre dans les variables
d'environnement (SEC-07), redéployer, **puis** supprimer l'ancienne. Ensuite seulement, nettoyer le
code et l'historique. Noter l'incident (OBS) : quoi, quand, combien de temps exposée, ce qui a été
fait.
**Notions** — Secrets Management, Production Incidents

---

### SEC-07 · Les secrets de production vivent dans le coffre de la plateforme, un jeu par environnement
`important` · `prod`

**Pourquoi** — Le serveur de prod doit recevoir ses secrets sans qu'ils passent par un fichier ou
par un message. Séparer dev, préversion et prod évite qu'un test touche les vraies données ou
dépense le vrai budget.
**Vérifier** — Où sont rangés les secrets de prod ? Les clés de dev et de prod sont-elles
différentes ? Une préversion (Vercel preview, branche Supabase) a-t-elle accès aux clés de prod ?
**Corriger** — Selon la plateforme :
| Plateforme | Où ranger les secrets |
|---|---|
| Vercel / Netlify | Project → Settings → Environment Variables, par environnement |
| Cloudflare Workers | `wrangler secret put NOM` (prod), `.dev.vars` (local, ignoré par git) |
| Supabase Edge Functions | `supabase secrets set NOM=...` |
| GitHub Actions | Settings → Secrets and variables → Actions, par environnement |
| Google Apps Script | Propriétés du script (`PropertiesService`) |
| Serveur à soi | Gestionnaire de secrets (Doppler, Infisical, 1Password, AWS/GCP Secret Manager) |

Les clés Stripe de test (`sk_test_`) en dev, les clés live seulement en prod.
**Notions** — Secrets Management, Environnements

---

### SEC-08 · Chaque clé a les droits minimaux
`important` · `tout`

**Pourquoi** — Si une clé fuit, les dégâts se limitent à ce qu'elle permet. Une clé « admin » pour
un script qui lit une seule ressource transforme une petite fuite en catastrophe.
**Vérifier** — Pour chaque clé : que peut-elle faire, et sur quoi ? Est-elle limitée en domaine,
en IP, en dépense ?
**Corriger** — Prendre les jetons à portée réduite que proposent les fournisseurs : jetons GitHub
« fine-grained » limités à un dépôt ; jetons d'API Cloudflare limités à une zone et une
permission ; clés Stripe restreintes (`rk_`) ; clés Google restreintes à une API et à un domaine
ou une IP ; plafond de dépense mensuel sur les comptes d'IA. Une clé par usage, pour pouvoir en
révoquer une sans tout casser.
**Notions** — Principe du moindre privilège, IAM

---

### SEC-09 · On sait quelles clés peuvent aller au navigateur, et ce qui les protège
`important` · `web`

**Pourquoi** — Certaines clés sont publiques par conception ; leur sécurité repose sur un autre
mécanisme qu'il faut alors activer. Les confondre mène à deux erreurs : cacher inutilement une
clé publique, ou exposer une clé secrète en la croyant publique.
**Vérifier** — Chaque clé présente côté client figure dans la colonne de gauche, et sa protection
est active.
**Corriger** —
| Publique (le navigateur peut l'avoir) | À condition que | Secrète (serveur uniquement) |
|---|---|---|
| Supabase `anon` / `sb_publishable_…` | la Row Level Security soit active sur chaque table (BDD, IAM) | Supabase `service_role` / `sb_secret_…` |
| Configuration web Firebase (`apiKey: "AIza…"`) | les règles Firestore/Storage soient strictes et App Check activé | Compte de service Firebase Admin |
| Stripe `pk_live_…` | — | Stripe `sk_…`, `rk_…`, `whsec_…` |
| Clé Google Maps JavaScript | elle soit restreinte au domaine (HTTP referrer) et à l'API Maps | Clé Gemini, Google Cloud, OAuth `client_secret` |
| — | — | OpenAI, Anthropic, Mistral, Resend, SendGrid, Twilio, toute clé d'IA ou d'envoi |
**Piège** — Une clé Gemini commence par `AIza`, comme celle de Firebase ou de Maps : le préfixe ne
dit pas si elle est publique. C'est l'usage qui le dit.
**Notions** — Secrets Management

---

### SEC-10 · Les secrets ont une durée de vie, et leur rotation est prévue
`conseillé` · `prod`

**Pourquoi** — Une clé qui ne change jamais finit par traîner partout (anciens ordinateurs,
anciens collaborateurs, sauvegardes). Une rotation régulière limite la fenêtre d'exposition, et
une rotation déjà répétée se fait sans panique le jour d'une fuite.
**Vérifier** — Date de création des clés importantes ; les jetons d'accès émis par l'application
expirent-ils ? La clé de signature des JWT peut-elle changer sans déconnecter tout le monde ?
**Corriger** — Jetons d'accès courts (15 min à 1 h) et jetons de rafraîchissement révocables
(IAM). Clés de signature identifiées par un `kid`, avec deux clés valides pendant la transition
(JWT Rotation). Un rappel annuel pour les clés de fournisseurs, et les jetons GitHub ou Cloudflare
créés avec une date d'expiration.
**Notions** — JWT Rotation, Secrets Management

---

### SEC-11 · Les secrets ne passent ni dans les URL, ni dans les journaux, ni dans les erreurs
`important` · `tout` · `auto`

**Pourquoi** — Une URL est enregistrée partout : historique du navigateur, journaux du serveur et
des proxys, en-tête `Referer` envoyé aux sites tiers. Un `console.log(req.headers)` écrit le jeton
de l'utilisateur dans les journaux, lisibles par plus de monde que la base.
**Vérifier** — Paramètres `?key=`, `?token=`, `?api_key=` dans les appels ; `console.log` ou
`print` d'objets entiers (`req`, `headers`, `config`, `process.env`) ; messages d'erreur renvoyés
au client.
**Corriger** — Les secrets voyagent dans un en-tête (`Authorization: Bearer …`), jamais dans
l'URL. Journaliser des champs choisis, pas des objets entiers ; masquer (`sk-…a3F9`). Les erreurs
renvoyées au client sont génériques ; le détail reste dans les journaux du serveur (OBS).
**Notions** — Logging, Secrets Management

---

### SEC-12 · La configuration est séparée du code et vérifiée au démarrage
`conseillé` · `api`

**Pourquoi** — Le même code doit tourner en dev, en préversion et en prod en ne changeant que
l'environnement (principe « 12-factor »). Une variable manquante doit faire échouer le démarrage
tout de suite, pas planter à 3 h du matin au premier paiement.
**Vérifier** — Les variables sont-elles lues en un seul endroit ? Y a-t-il des valeurs par défaut
pour des secrets (`process.env.KEY || "sk-..."`) ?
**Corriger** — Un module `env` qui lit et valide tout au démarrage :
```ts
import { z } from 'zod'
export const env = z.object({
  DATABASE_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
}).parse(process.env)
```
Jamais de valeur par défaut pour un secret.
**Notions** — Configuration (12-factor), Environnements

---

### SEC-13 · Les secrets n'entrent ni dans les images Docker ni dans les journaux de CI
`important` · `prod` · `auto`

**Pourquoi** — Une instruction `ENV` ou `ARG` d'un Dockerfile reste lisible dans l'image
(`docker history`). Un `echo $TOKEN` dans une CI publique écrit le jeton dans un journal public.
**Vérifier** — `ENV`/`ARG` contenant `KEY`, `SECRET`, `TOKEN`, `PASSWORD` dans les Dockerfile ;
`.dockerignore` qui exclut `.env` ; workflows qui affichent des variables ; déploiement vers le
cloud avec une clé longue durée.
**Corriger** — Secrets fournis à l'exécution (variables de la plateforme, `--secret` de BuildKit
pour la construction). `.dockerignore` avec `.env*`. Dans GitHub Actions, les secrets du dépôt, et
l'OIDC vers AWS, GCP ou Azure plutôt qu'une clé longue durée.
**Notions** — Docker, CI/CD, Secrets Management

---

### SEC-14 · Aucun secret visible dans ce qu'on montre : captures, vidéos, directs, tickets
`important` · `tout`

**Pourquoi** — Une capture d'écran, un tutoriel vidéo ou un partage d'écran en direct qui montre
un `.env`, un terminal ou un tableau de bord de fournisseur publie la clé à tous les spectateurs,
et l'image reste une fois la vidéo en ligne.
**Vérifier** — Avant de filmer ou de partager : `.env` fermé, variables masquées dans le terminal,
tableaux de bord sur des pages sans clé. Dans les tickets et les messages d'aide, les journaux
collés ne contiennent pas de jeton.
**Corriger** — Un profil ou un projet de démonstration avec des clés de test à faible plafond,
révoquées après le tournage. Si une clé a été visible : SEC-06.
**Notions** — Secrets Management

---

### SEC-15 · L'assistant de code ne lit pas les secrets dont il n'a pas besoin
`conseillé` · `tout`

**Pourquoi** — Ce qu'un assistant lit part dans la conversation. Il n'a besoin que du **nom** des
variables, jamais de leurs valeurs.
**Vérifier** — Les réglages du projet empêchent-ils la lecture des fichiers de secrets ?
**Corriger** — Dans `.claude/settings.json` du projet :
```json
{ "permissions": { "deny": ["Read(./.env)", "Read(./.env.*)", "Read(./.dev.vars)"] } }
```
Coller une clé dans la conversation seulement quand il le faut, et la faire tourner ensuite si
elle était sensible. Ne jamais mettre de secret dans un prompt système ou une consigne d'agent (IA).
**Notions** — Secrets Management, Principe du moindre privilège

---

### SEC-16 · Un filet automatique arrête les secrets avant qu'ils ne partent
`conseillé` · `tout`

**Pourquoi** — La vigilance humaine finit par lâcher ; un contrôle automatique, non.
**Vérifier** — Le garde de ce plugin est actif (il bloque les clés à l'écriture et avant
`git commit` ou `git push`). Le dépôt GitHub a le « secret scanning » et la « push protection »
(Settings → Code security). Un `pre-commit` vérifie les commits faits hors de Claude.
**Corriger** — `/guard-system-100s -installer` propose le garde `pre-commit` du projet. Sur
GitHub, activer secret scanning et push protection (gratuits sur les dépôts publics).
**Notions** — Secrets Management, CI/CD
