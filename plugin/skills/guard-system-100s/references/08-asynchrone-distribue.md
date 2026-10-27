# 08 · Tâches de fond, files et systèmes distribués (ASY)

Dès qu'un travail se fait « plus tard » ou « ailleurs » (envoi d'e-mail, génération d'IA, cron,
webhook, worker), deux choses changent : **il peut arriver deux fois, ou pas du tout**, et
personne ne regarde quand il échoue. La quasi-totalité des files de messages livrent « au moins
une fois » : le code qui traite un message doit donc supporter de le recevoir en double, réessayer
sans s'acharner et ranger de côté ce qui échoue sans fin. Pour un projet à un seul serveur, **un
monolithe et une file suffisent** : le vocabulaire des systèmes distribués (CAP, élection de
leader, verrous distribués) sert à comprendre ses outils, pas à les réimplémenter.

---

### ASY-01 · Ce qui est long ou peut échouer ne se fait pas pendant la requête HTTP
`important` · `api`

**Pourquoi** — Une requête HTTP doit répondre en quelques centaines de millisecondes. Si elle
envoie un e-mail, appelle une IA, redimensionne une image ou interroge une API lente, l'utilisateur
attend, la fonction serverless peut atteindre sa durée maximale (PERF-11), et si le service tiers
est en panne, c'est ta page qui échoue. Pire : l'utilisateur recharge, et l'action part deux fois.
**Vérifier** — Dans les routes (`app/api/**/route.ts`, `server/`, `routes/`, Edge Functions,
Workers, `doPost` d'Apps Script) : appels à `resend.emails.send`, `openai.`, `anthropic.`,
`sharp(`, `ffmpeg`, `fetch` vers des services lents, boucles sur beaucoup d'éléments. Mesurer la
durée de la route dans les journaux de la plateforme. Les webhooks entrants (Stripe, Shopify)
font-ils tout leur traitement avant de répondre ?
**Corriger** — La route enregistre la demande, la confie à une **file de messages** (message
queue : une liste d'attente durable qu'un autre programme, le consommateur, vide à son rythme) et
répond tout de suite `202 Accepted`. L'interface affiche ensuite le statut (ASY-13, PERF-04).
```ts
export async function POST(req: Request) {
  const { imageId } = await req.json()
  await file.send({ id: crypto.randomUUID(), type: 'miniature', imageId }) // Cloudflare : env.FILE.send()
  return Response.json({ statut: 'en_attente' }, { status: 202 })
}
```
| Stack | File de messages |
|---|---|
| Cloudflare Workers | Cloudflare Queues ; Workflows pour un traitement en plusieurs étapes |
| Supabase | Supabase Queues (pgmq, la file vit dans Postgres), vidée par une Edge Function lancée par pg_cron |
| Vercel / Next.js | Vercel Queues (bêta), ou un service : Inngest, Trigger.dev, Upstash QStash |
| Node sur un serveur à soi | BullMQ (sur Redis) |
| Python | Celery, RQ, Dramatiq, arq |
| Google Apps Script | une feuille « à traiter » + un déclencheur horaire + `LockService` (ASY-08) |

Un webhook entrant vérifie sa signature (API), enregistre l'événement, répond `200` et traite
ensuite : les fournisseurs réessaient quand la réponse tarde.
**Piège** — Ajouter une file pour un traitement qui dure 50 ms et ne dépend de personne. Ce qui est
court et local reste dans la requête ; la file sert à ce qui est lent, fragile ou en masse.
**Notions** — Message Queues, Event-Driven Architecture

---

### ASY-02 · Ce qui doit absolument arriver ne repose pas sur une promesse lancée « dans le vide »
`important` · `api`

**Pourquoi** — En serverless, la plateforme peut geler ou arrêter l'instance dès que la réponse est
partie. Un `envoyerEmail(commande)` sans `await` (« fire and forget », lancer et oublier) part
parfois, parfois non, et l'échec ne laisse aucune trace. Même chose sur un serveur classique au
moment d'un redéploiement.
**Vérifier** — Appels de fonctions asynchrones sans `await` ni `return` dans les routes ; `.then(`
isolés ; `void maFonction()`. La règle ESLint `@typescript-eslint/no-floating-promises` les trouve
toutes. Repérer aussi `waitUntil`, `after()` (Next.js), `EdgeRuntime.waitUntil` (Supabase) et
`BackgroundTasks` (FastAPI) : à quoi servent-ils ?
**Corriger** — Deux catégories :
```ts
// Accessoire (statistiques, préchauffage d'un cache) : après la réponse, sans garantie
import { after } from 'next/server'
after(() => enregistrerVisite(page))   // Vercel : waitUntil() ; Workers : ctx.waitUntil()
// Indispensable (confirmation de commande, suite d'un paiement) : une file durable
await file.send({ id: commande.id, type: 'email-confirmation' })
```
`waitUntil` et `after()` ne réessaient pas et meurent avec l'instance ; sur Cloudflare Workers,
`waitUntil` ne prolonge l'exécution que de 30 secondes après la réponse. Pour un enchaînement
d'étapes qui doit survivre aux pannes, un moteur d'exécution durable (Cloudflare Workflows, Vercel
Workflows, Inngest, Trigger.dev) reprend là où il s'était arrêté.
**Notions** — Message Queues, Durable Execution

---

### ASY-03 · Chaque consommateur est idempotent : recevoir deux fois un message ne fait rien de plus
`bloquant` · `async`

**Pourquoi** — Cloudflare Queues, Vercel Queues, SQS, les crons Vercel, les webhooks Stripe : tous
livrent **au moins une fois** (at-least-once). Un consommateur qui plante juste après avoir agi,
un délai dépassé, un redémarrage, et le message revient. Un traitement qui « ajoute 10 crédits »
ou « débite la carte » le fera deux fois. Ce n'est pas rare : à volume suffisant, ça arrive
forcément.
**Vérifier** — Pour chaque consommateur, cron et récepteur de webhook : que se passe-t-il s'il
s'exécute deux fois avec le même message ? Chercher les effets cumulatifs (`credits + 10`,
`insert` sans contrainte d'unicité, envoi d'e-mail, paiement) déclenchés sans vérifier qu'ils ont
déjà eu lieu.
**Corriger** — Le producteur donne à chaque message un identifiant unique (`crypto.randomUUID()`),
et l'effet s'y attache :
```ts
// MAUVAIS : rejouer le message double le crédit
await sql`update comptes set credits = credits + 10 where id = ${msg.body.userId}`
// BON : une contrainte d'unicité rend le second passage sans effet
await sql`insert into credits_accordes (evenement_id, user_id, montant)
          values (${msg.body.id}, ${msg.body.userId}, 10)
          on conflict (evenement_id) do nothing`
```
Préférer les opérations naturellement idempotentes (« passer le statut à `payee` » plutôt
qu'« incrémenter »). Pour un effet chez un tiers (paiement, e-mail), transmettre l'identifiant
comme clé d'idempotence au fournisseur qui l'accepte : voir API pour l'idempotency des appels.
**Piège** — Croire qu'un délai dépassé veut dire « pas fait ». Le paiement a pu passer, seule la
réponse s'est perdue (ASY-20). Rejouer sans clé d'idempotence, c'est payer deux fois.
**Notions** — At-least-once, Consommateur idempotent, Message Queues

---

### ASY-04 · L'URL qui déclenche un cron ou une tâche exige un secret
`bloquant` · `async` · `auto`

**Pourquoi** — Un cron Vercel, pg_cron ou un service externe appelle une **URL publique**. Sans
vérification, n'importe qui peut la découvrir (elle est dans `vercel.json`, dans le dépôt, dans
les journaux) et lancer mille fois l'envoi de la newsletter, la facturation ou la purge des
comptes.
**Vérifier** — `node audit.mjs` (routes de cron sans comparaison de secret). À la main : chemins
listés dans `vercel.json` → `crons`, routes `api/cron/*`, Edge Functions appelées par `cron.schedule`
et `net.http_post`, `doPost` d'Apps Script appelé par un service de cron.
**Corriger** — Un secret long et aléatoire dans les variables d'environnement, vérifié avant toute
action. Vercel l'envoie tout seul si la variable s'appelle `CRON_SECRET` :
```ts
export function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  // … le travail
}
```
Supabase : ranger le secret dans Vault, l'envoyer depuis `net.http_post(headers := …)`, désactiver
`verify_jwt` pour cette fonction dans `supabase/config.toml` (la clé publique `anon` ne protège
rien, tout le monde l'a) et comparer le secret dans la fonction. Apps Script ne lit pas les
en-têtes : le secret va dans le corps du `POST`, jamais dans l'URL (SEC-11). Les Cron Triggers de
Cloudflare et les déclencheurs horaires d'Apps Script n'ont pas d'URL : rien à protéger, tant que
la même logique n'est pas aussi exposée par une route.
**Piège** — Oublier `!secret` : si la variable manque, `` `Bearer ${undefined}` `` vaut
`"Bearer undefined"`, et celui qui envoie exactement cette chaîne passe.
**Notions** — Cron Jobs

---

### ASY-05 · Aucune donnée propre à une requête ne vit dans une variable globale
`bloquant` · `api`

**Pourquoi** — En serverless, une instance « chaude » garde ses variables globales d'une requête à
l'autre, et elle traite souvent **plusieurs requêtes en même temps** (Cloudflare Workers, Vercel
avec Fluid compute, un serveur Node ou FastAPI). Une variable `utilisateurCourant` au niveau du
module est écrasée par la requête voisine pendant un `await` : Marie reçoit les données de Paul.
C'est la thread safety (sûreté face aux accès concurrents) appliquée au JavaScript, qui n'a qu'un
fil d'exécution mais entrelace les requêtes à chaque `await`.
**Vérifier** — `let` et objets modifiés au niveau du module dans les fichiers serveur
(`route.ts`, `server.ts`, Workers, Edge Functions) ; variables globales Python modifiées dans une
route Flask ou FastAPI ; motifs « lire, calculer, réécrire » sur une valeur partagée :
`const { stock } = await lire(); await ecrire(stock - 1)`.
**Corriger** — Ce qui concerne la requête se passe en paramètre, ou passe par `AsyncLocalStorage`
(Node) :
```ts
// MAUVAIS
let utilisateurCourant
export async function GET(req) { utilisateurCourant = await lireUtilisateur(req); /* await… */ }
// BON
export async function GET(req) { const utilisateur = await lireUtilisateur(req); return reponse(utilisateur) }
```
Les variables globales restent bonnes pour ce qui est partagé par nature et sans état propre à un
utilisateur : client de base de données, configuration lue au démarrage. Pour une valeur partagée
qu'on modifie (stock, solde, compteur), une seule opération atomique en base :
`update produits set stock = stock - 1 where id = $1 and stock > 0` (transactions et niveaux
d'isolation : BDD).
**Piège** — Un cache en mémoire « par utilisateur » dans une `Map` globale : il fuit entre
utilisateurs si la clé est mal choisie, et grossit sans fin (PERF-09).
**Notions** — Thread Safety, Race Condition

---

### ASY-06 · Les tâches qui échouent réessaient avec un délai croissant, et un plafond
`important` · `async`

**Pourquoi** — Beaucoup d'échecs sont passagers (service tiers saturé, coupure réseau). Réessayer
tout de suite et sans fin transforme une panne de dix secondes en avalanche : tous les messages
retapent en même temps sur un service déjà à terre. Ne jamais réessayer perd du travail.
**Vérifier** — Configuration des files (`max_retries`, `retry_delay` dans `wrangler.toml`, options
de BullMQ ou Celery) ; boucles `while (!ok)` ou `catch` qui relancent immédiatement ; erreurs
définitives (données invalides, `400`, `404`) réessayées comme les autres.
**Corriger** — Délai exponentiel (exponential backoff : 30 s, 1 min, 2 min…), une part d'aléatoire
(jitter) pour que les messages ne repartent pas tous ensemble, un plafond de tentatives :
```js
// Cloudflare Queues : msg.attempts compte les tentatives
const delai = Math.min(3600, 30 * 2 ** msg.attempts) * (0.5 + Math.random() / 2)
msg.retry({ delaySeconds: Math.round(delai) })
```
```python
# Celery
@app.task(autoretry_for=(TimeoutError,), retry_backoff=True, retry_backoff_max=600, max_retries=5)
def generer_resume(doc_id): ...
```
Une erreur définitive (`400`, validation, ressource supprimée) ne se réessaie pas : elle part
directement en DLQ (ASY-07) avec sa cause. Pour les appels HTTP sortants eux-mêmes (délais
d'attente, `Retry-After`, circuit breaker) : voir API.
**Piège** — Sur Cloudflare Queues, une exception non rattrapée fait réessayer **tout le lot**, y
compris les messages déjà traités. Acquitter chaque message réussi (`msg.ack()`), et c'est une
raison de plus d'être idempotent (ASY-03).
**Notions** — Exponential Backoff, Message Queues

---

### ASY-07 · Les messages qui échouent en boucle finissent dans une Dead Letter Queue surveillée
`important` · `async`

**Pourquoi** — Un message « empoisonné » (donnée corrompue, bug) échoue à chaque essai. Sans file de
côté, soit il bloque les autres, soit il est jeté en silence : sur Cloudflare Queues, un message
qui a épuisé ses tentatives sans DLQ configurée est supprimé définitivement. Une commande perdue
sans que personne ne le sache.
**Vérifier** — Chaque file a une DLQ (dead letter queue : la file des messages abandonnés) ; une
alerte prévient quand elle n'est pas vide ; quelqu'un sait comment rejouer un message.
**Corriger** —
```toml
# wrangler.toml
[[queues.consumers]]
queue = "emails"
max_retries = 5
dead_letter_queue = "emails-dlq"
```
Supabase Queues (pgmq) n'a pas de DLQ intégrée : chaque message lu porte un compteur `read_ct` ;
au-delà d'un seuil, le consommateur le recopie dans une file `emails_dlq` (`pgmq.send`) puis le
retire (`pgmq.delete`). BullMQ garde les tâches échouées dans l'état `failed`. Ensuite : une alerte
sur la taille de la DLQ (OBS), et une procédure de reprise : corriger le bug, puis réinjecter.
**Piège** — Les DLQ aussi expirent : sur Cloudflare Queues, la rétention va jusqu'à 14 jours sur
l'offre payante et 24 heures sur l'offre gratuite. Un consommateur de la DLQ qui recopie chaque
message dans une table garde la trace au-delà.
**Notions** — Dead Letter Queues, Message Queues

---

### ASY-08 · Un cron supporte d'être lancé deux fois, en même temps, ou pas du tout
`important` · `async`

**Pourquoi** — Un cron job (tâche planifiée à heure fixe) n'est pas une horloge parfaite. Vercel
le dit lui-même : la livraison est « au mieux », une exécution peut sauter ou arriver deux fois,
et si le travail dure plus longtemps que l'intervalle, une deuxième exécution démarre pendant la
première. Un `node-cron` ou un `setInterval` dans un serveur lancé sur trois instances tourne
trois fois.
**Vérifier** — Pour chaque tâche planifiée : que se passe-t-il si elle tourne deux fois de suite,
deux fois en parallèle, ou saute un jour ? Chercher `node-cron`, `setInterval` et `schedule` dans
le code serveur, et le nombre d'instances déployées.
**Corriger** — Trois défenses, à combiner.
*De rattrapage et idempotente* : traiter tout ce qui reste à faire, pas « ce qui est arrivé dans
la dernière heure ». `where envoye_le is null` rattrape une exécution manquée ;
`where cree_le > now() - interval '1 hour'` la perd.
*Sans chevauchement* : pg_cron ne lance jamais deux fois le même job en parallèle (la seconde
exécution attend la fin de la première). Ailleurs, un verrou :
```js
// Google Apps Script
function traiterLaFile() {
  const verrou = LockService.getScriptLock()
  if (!verrou.tryLock(5000)) return          // une autre exécution tourne déjà
  try { traiterLesLignes() } finally { verrou.releaseLock() }
}
```
En Postgres : `select pg_try_advisory_xact_lock(hashtext('export-quotidien'))` en début de
fonction SQL, ou un verrou avec expiration (ASY-18).
*Un seul déclencheur* : le cron de la plateforme plutôt qu'un `setInterval` dans chaque instance
du serveur.
**Piège** — `pg_try_advisory_lock` (version « session ») derrière un pooler en mode transaction
(Supavisor, port 6543) : la connexion change entre deux requêtes, le verrou ne protège plus rien.
Utiliser la version `_xact_`, liée à la transaction.
**Notions** — Cron Jobs, Distributed Locks, Consommateur idempotent

---

### ASY-09 · Un cron qui s'arrête de tourner déclenche une alerte
`important` · `async`

**Pourquoi** — Une tâche planifiée qui échoue bruyamment se voit. Une tâche qui **ne se lance plus
du tout** (cron supprimé par un déploiement, compte suspendu, déclencheur désactivé) ne produit
aucune erreur : on découvre trois semaines plus tard que les relances de paiement ne partent plus.
GitHub désactive par exemple les workflows planifiés d'un dépôt public après 60 jours sans
activité.
**Vérifier** — Pour chaque cron : qui serait prévenu s'il ne tournait pas cette nuit ? Les échecs
sont-ils visibles (journaux Vercel, `cron.job_run_details` pour pg_cron, e-mails d'échec d'Apps
Script, onglet Actions de GitHub) ?
**Corriger** — Une surveillance par battement de cœur (heartbeat monitoring) : à la fin de chaque
exécution réussie, la tâche appelle une URL ; le service alerte si l'appel n'arrive pas dans le
délai prévu.
```ts
await envoyerRelances()
await fetch(process.env.HEARTBEAT_URL!)   // Healthchecks.io, Better Stack, Cronitor, Sentry Crons…
```
L'alerte va là où on la voit vraiment (OBS).
**Piège** — `cron.job_run_details` n'est pas vidée automatiquement : un job qui tourne toutes les
minutes la fait grossir sans fin. Planifier sa purge (par exemple les lignes de plus de 7 jours).
**Notions** — Cron Jobs, Heartbeat monitoring

---

### ASY-10 · Écrire en base et publier un message réussissent ou échouent ensemble
`important` · `async`

**Pourquoi** — « Créer la commande, puis envoyer le message “commande créée” » : si le serveur
tombe entre les deux, la commande existe mais l'e-mail, la facture et l'expédition n'arriveront
jamais. Dans l'autre ordre, on annonce une commande qui n'existe pas. Deux systèmes différents (la
base et la file) ne partagent pas de transaction.
**Vérifier** — Les endroits où une écriture en base est suivie d'un `queue.send`, d'un appel de
webhook ou d'un e-mail. Avec `supabase-js`, deux `.insert()` successifs ne forment pas une
transaction.
**Corriger** — L'**outbox pattern** : dans la même transaction que l'écriture métier, on insère le
message dans une table `outbox` ; un relais (cron ou worker) lit les messages non envoyés, les
publie, puis les marque envoyés.
```sql
-- fonction SQL appelée par supabase.rpc('creer_commande', …) : une seule transaction
insert into commandes (id, client_id, total) values (v_id, p_client, p_total);
insert into outbox (type, payload) values ('commande.creee', jsonb_build_object('id', v_id));
```
Le relais lit avec `for update skip locked` pour que deux relais ne prennent pas les mêmes lignes.
Il livre au moins une fois : les consommateurs restent idempotents (ASY-03). Avec Supabase
Queues, la file vit dans la même base : `select pgmq.send('commandes', …)` dans la même fonction
SQL fait déjà partie de la transaction, sans table supplémentaire.
**Piège** — Appeler l'API d'e-mail **à l'intérieur** de la transaction : si la transaction est
ensuite annulée, l'e-mail est déjà parti pour une commande qui n'existe pas.
**Notions** — Outbox pattern, Distributed Transactions, At-least-once

---

### ASY-11 · Le parallélisme est borné : jamais 10 000 promesses d'un coup
`important` · `tout`

**Pourquoi** — `Promise.all(clients.map(envoyerEmail))` sur 10 000 clients ouvre 10 000 connexions
en même temps : limite de débit du fournisseur dépassée, mémoire saturée, connexions à la base
épuisées (une fonction Vercel partage 1 024 descripteurs de fichiers entre toutes ses exécutions).
La backpressure (contre-pression), c'est le fait qu'un système ralentisse ce qui l'alimente au lieu
d'accumuler sans limite.
**Vérifier** — `Promise.all` sur des tableaux dont la taille dépend des données ; `asyncio.gather`
sur des listes non bornées ; lecture d'une table entière en mémoire ; files sans limite de
concurrence côté consommateur.
**Corriger** —
```js
import pLimit from 'p-limit'
const limite = pLimit(5)                                   // 5 envois à la fois, pas 10 000
await Promise.all(clients.map(c => limite(() => envoyerEmail(c))))
```
```python
sem = asyncio.Semaphore(5)
async def borne(c):
    async with sem:
        return await envoyer_email(c)
await asyncio.gather(*(borne(c) for c in clients))
```
Traiter les grandes tables par pages (`range(0, 499)`, puis la suite). Régler la concurrence des
consommateurs (`max_batch_size`, `max_concurrency` sur Cloudflare Queues). Une file pleine refuse
plutôt que de grossir à l'infini : la limitation côté API (`429` et `Retry-After`) relève d'API.
Pour des fichiers, `stream.pipeline()` de Node gère la contre-pression tout seul.
**Notions** — Backpressure

---

### ASY-12 · Une donnée « cohérente à terme » ne sert pas là où il faut une valeur exacte
`important` · `api`

**Pourquoi** — Certains stockages sont « cohérents à terme » (eventual consistency) : une écriture
finit par être visible partout, mais pas tout de suite. Cloudflare KV l'annonce clairement : une
modification peut mettre 60 secondes ou plus à être visible ailleurs dans le monde. Un compteur de
limitation de débit, un stock ou une session révoquée rangés dans KV laissent passer ce qu'ils
devaient bloquer. Même chose pour une réplique de base en lecture, un cache, un index de recherche.
**Vérifier** — Usages de KV (`env.MON_KV.put/get`), de répliques en lecture, de caches, pour des
données qui doivent être exactes et à jour : compteurs, quotas, stocks, droits d'accès, solde.
**Corriger** — Pour ce qui doit être exact : la base principale (Postgres, D1), ou un Durable
Object sur Cloudflare (une instance unique par identifiant, qui voit toutes les écritures dans
l'ordre). Après une écriture, relire depuis la source principale (« lire sa propre écriture »).
KV et les caches restent parfaits pour ce qui change peu et tolère un léger retard :
configuration, pages, catalogue.
**Notions** — Eventual Consistency, CAP Theorem

---

### ASY-13 · Chaque tâche de fond a un statut visible, et une issue si elle reste coincée
`conseillé` · `async`

**Pourquoi** — Une fois le travail parti dans une file, l'utilisateur ne sait plus si sa vidéo est
en cours, finie ou ratée, et toi non plus. Une tâche dont le worker est mort reste « en cours » pour
toujours.
**Vérifier** — Existe-t-il une trace par tâche (statut, tentatives, dernière erreur, dates) ?
L'interface l'affiche-t-elle ? Que deviennent les tâches « en cours » depuis une heure ?
**Corriger** —
```sql
create table taches (
  id uuid primary key, type text not null,
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'en_cours', 'terminee', 'echouee')),
  tentatives int not null default 0, derniere_erreur text,
  cree_le timestamptz not null default now(), maj_le timestamptz not null default now()
);
-- un cron remet en file ce qui est coincé
update taches set statut = 'en_attente', tentatives = tentatives + 1
where statut = 'en_cours' and maj_le < now() - interval '15 minutes';
```
L'interface suit le statut par interrogation régulière ou par Supabase Realtime, avec un état de
chargement et d'erreur (PERF-04).
**Notions** — Message Queues

---

### ASY-14 · Le fuseau horaire des crons est explicite
`conseillé` · `async`

**Pourquoi** — « Tous les jours à 9 h » : 9 h où ? Vercel et Cloudflare comptent toujours en UTC.
Avec l'heure d'été, `0 7 * * *` en UTC tombe à 9 h à Paris l'été et à 8 h l'hiver. Un récapitulatif
« de la veille » calculé en UTC coupe la journée au mauvais endroit.
**Vérifier** — Chaque expression cron est commentée avec son fuseau ; les calculs de « jour » dans
le code précisent le fuseau.
**Corriger** —
| Outil | Fuseau | À savoir |
|---|---|---|
| Vercel Cron (`vercel.json`) | toujours UTC | offre Hobby : une fois par jour maximum, à un moment quelconque dans l'heure prévue |
| Cloudflare Cron Triggers | UTC | appelle le gestionnaire `scheduled()`, pas une URL |
| Supabase pg_cron | GMT par défaut | historique dans `cron.job_run_details` ; Supabase conseille au plus 8 jobs simultanés et 10 min par job |
| Déclencheurs Apps Script | fuseau du projet (`timeZone` dans `appsscript.json`) | heure légèrement aléatoire dans la fenêtre choisie ; 90 min d'exécution cumulée par jour pour un compte gratuit |
| GitHub Actions `schedule` | UTC par défaut | peut être retardé en période de forte charge |

Pour une heure locale stable toute l'année : planifier toutes les heures et vérifier dans le code
`new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric' }).format(new Date())`.
Stocker les dates en `timestamptz` (BDD).
**Notions** — Cron Jobs

---

### ASY-15 · Les messages sont petits, versionnés, et leur ordre d'arrivée n'est pas supposé
`conseillé` · `async`

**Pourquoi** — Un message qui contient toute la commande transporte une copie qui sera périmée au
moment du traitement, et les files ont une taille maximale (128 Ko sur Cloudflare Queues). Pendant
un déploiement, l'ancien format et le nouveau coexistent dans la file. Et la plupart des files ne
garantissent pas l'ordre : « commande annulée » peut arriver avant « commande payée ».
**Vérifier** — Contenu des `send(...)` : objets entiers, données personnelles, secrets ? Le
consommateur plante-t-il sur un champ inconnu ou manquant ? Suppose-t-il que les messages arrivent
dans l'ordre ?
**Corriger** — Le message porte un identifiant unique, un type, une version et les identifiants
utiles : `{ id, type: 'commande.payee', v: 1, commandeId }`. Le consommateur relit l'état actuel
en base et décide d'après lui, pas d'après l'ordre d'arrivée (une colonne `version` ou `maj_le`
permet d'ignorer un message plus ancien que l'état connu). Aucun secret ni donnée personnelle
inutile : les messages finissent dans les journaux et les DLQ (SEC, LEG).
**Notions** — Message Queues, Event-Driven Architecture

---

### ASY-16 · On ne compare pas les horloges de machines différentes
`conseillé` · `tout`

**Pourquoi** — Chaque machine a sa propre horloge, et elles dérivent (clock skew, décalage
d'horloge). L'horloge du téléphone de l'utilisateur peut avoir des minutes d'écart ; deux serveurs,
quelques millisecondes ou plus. Décider « qui a écrit en dernier » ou « le lien a-t-il expiré » en
comparant deux horloges donne des résultats faux, rarement, donc introuvables.
**Vérifier** — `Date.now()` ou `new Date()` envoyés par le navigateur et utilisés côté serveur ;
dates de création calculées dans le code plutôt qu'en base ; tri par date pour départager des
écritures concurrentes ; durées mesurées avec `Date.now()`.
**Corriger** — L'heure de référence est celle de la base : `cree_le timestamptz default now()`.
Pour ordonner, des identifiants croissants (`bigint generated always as identity`, ou UUIDv7,
natif via `uuidv7()` à partir de PostgreSQL 18). Pour mesurer une durée, une horloge monotone, qui
ne recule jamais quand l'horloge système est recalée : `performance.now()` en JS,
`time.monotonic()` en Python. Les expirations de jetons gardent une petite tolérance (IAM).
**Notions** — Clock Skew

---

### ASY-17 · Une opération sur plusieurs services est une saga, avec une compensation par étape
`conseillé` · `async`

**Pourquoi** — « Réserver le créneau, débiter la carte, envoyer la confirmation » touche trois
systèmes. Si le débit échoue, le créneau reste bloqué ; si l'envoi échoue après le débit, le client
a payé sans rien recevoir. Une transaction distribuée classique (commit à deux phases, 2PC, où
chaque système promet puis valide ensemble) n'existe pas avec Stripe ou une API d'e-mail, et
bloquerait tout si un participant disparaît.
**Vérifier** — Les enchaînements qui appellent plusieurs services externes ou plusieurs bases :
que se passe-t-il si l'étape 2 ou 3 échoue ? L'état « où en est-on » est-il enregistré quelque
part ?
**Corriger** — Le saga pattern : une suite d'étapes, chacune idempotente, et pour chacune une
action de compensation qui annule son effet (libérer le créneau, rembourser). L'état courant est
enregistré (une table `reservations` avec un statut par étape) ou confié à un moteur d'exécution
durable (Inngest, Trigger.dev, Cloudflare Workflows, Vercel Workflows, Temporal), qui rejoue et
reprend après une panne.
```
reserver_creneau  → si échec plus loin : liberer_creneau
debiter_carte     → si échec plus loin : rembourser
envoyer_confirmation (dernière étape : réessayée, pas compensée)
```
**Piège** — Monter une saga pour deux tables de la même base : une transaction SQL suffit (BDD).
**Notions** — Saga Pattern, Distributed Transactions, Durable Execution

---

### ASY-18 · Un verrou distribué expire et porte un jeton de clôture, et on s'en passe quand on peut
`conseillé` · `échelle`

**Pourquoi** — Un verrou distribué (distributed lock) garantit qu'une seule machine fait un
travail à la fois. Sans expiration, une machine qui plante en le tenant le bloque pour toujours.
Avec expiration, une machine figée (pause du ramasse-miettes, réseau lent) peut se réveiller après
l'expiration, croire qu'elle tient encore le verrou et écrire en même temps que la suivante.
**Vérifier** — Verrous maison (une ligne « en cours », une clé Redis) : expirent-ils ? Une écriture
tardive d'un ancien détenteur est-elle refusée ?
**Corriger** — D'abord s'en passer : une contrainte d'unicité, une opération atomique ou
l'idempotence (ASY-03) suffisent presque toujours. Sinon, un bail en Postgres avec expiration et
jeton croissant :
```sql
update verrous set detenu_jusqua = now() + interval '5 minutes', jeton = jeton + 1
where nom = 'export-quotidien' and detenu_jusqua < now()
returning jeton;            -- aucune ligne : quelqu'un d'autre le tient
```
Le jeton de clôture (fencing token) accompagne chaque écriture, et la cible refuse un jeton plus
petit que le dernier vu (`where dernier_jeton < $jeton`). Sur Cloudflare, un Durable Object par
ressource sérialise naturellement les accès. Redis et l'algorithme Redlock ne fournissent pas de
jeton de clôture à eux seuls.
**Notions** — Distributed Locks, Leader Election

---

### ASY-19 · Pub/Sub et architecture orientée événements, seulement quand plusieurs réactions indépendantes le justifient
`conseillé` · `échelle`

**Pourquoi** — En Pub/Sub (publication/abonnement), un événement publié une fois est reçu par
tous les abonnés : « commande payée » déclenche la facture, l'e-mail et les statistiques sans que
le code de paiement les connaisse. C'est le cœur d'une event-driven architecture (architecture
orientée événements). Le prix : le flux devient difficile à suivre et à déboguer, et chaque abonné
doit gérer doublons et désordre (ASY-03, ASY-15).
**Vérifier** — Combien d'actions indépendantes réagissent au même événement ? Un appel de fonction
direct suffirait-il ? Le mécanisme choisi est-il durable : Supabase Realtime, `LISTEN/NOTIFY` de
Postgres et le Pub/Sub de Redis ne gardent rien pour un abonné absent au moment de l'envoi.
**Corriger** — Pour un projet à une seule application : des appels de fonctions et une file
(ASY-01). Quand plusieurs consommateurs indépendants doivent recevoir les mêmes événements, et
rattraper ce qu'ils ont manqué : un sujet durable avec groupes de consommateurs (Vercel Queues,
Google Pub/Sub, Kafka à très grande échelle). Les notifications temps réel vers l'interface
(Realtime) restent un confort : la base est la source de vérité, et le client recharge l'état à la
reconnexion.
**Notions** — Pub/Sub, Event-Driven Architecture

---

### ASY-20 · CAP, partitions réseau, élection de leader, service discovery : connaître, pas installer
`conseillé` · `échelle`

**Pourquoi** — Ces notions décrivent ce qui arrive quand plusieurs machines doivent se mettre
d'accord. Les connaître explique le comportement de ses outils (pourquoi KV est en retard, pourquoi
un délai dépassé est ambigu) ; les mettre en place sans plusieurs serveurs est de la sur-ingénierie.
**Vérifier** — Le projet a-t-il vraiment plusieurs instances qui doivent se coordonner, plusieurs
régions, plusieurs services qui se cherchent ? Sinon, rien à faire ici.
**Corriger** — Ce qu'il faut savoir :
- **Network Partitions** (partitions réseau) : deux parties du système ne se parlent plus, alors
  que chacune fonctionne. Côté petit projet, c'est la requête partie dont la réponse ne revient
  jamais : l'action a-t-elle eu lieu ? D'où l'idempotence (ASY-03) et les tâches de rattrapage.
- **CAP Theorem** : pendant une partition, un système réparti doit choisir entre cohérence (tout le
  monde lit la dernière valeur) et disponibilité (tout le monde reçoit une réponse). Une base
  Postgres unique répond en erreur plutôt que faux ; Cloudflare KV répond toujours, parfois en
  retard (ASY-12).
- **Leader Election** (élection de leader) : plusieurs instances désignent celle qui fait seule le
  travail unique. Sur une plateforme gérée, le cron de la plateforme joue déjà ce rôle (ASY-08) ;
  sinon un verrou Postgres ou un Durable Object. etcd, ZooKeeper ou les baux Kubernetes servent à
  partir de nombreux nœuds.
- **Service Discovery** : comment un service trouve l'adresse d'un autre. Sur Vercel, Supabase ou
  Cloudflare, une URL dans une variable d'environnement ou une liaison de service (service
  binding) suffit ; Consul ou le DNS de Kubernetes, seulement avec une flotte de services qui
  bougent.
**Piège** — Découper en microservices pour « faire pro » : chaque appel entre services devient une
partition possible. Un monolithe bien rangé plus une file couvre l'essentiel des besoins.
**Notions** — CAP Theorem, Network Partitions, Leader Election, Service Discovery, Eventual Consistency
