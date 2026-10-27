# 05 · API, abus, appels sortants et coûts (API)

Une API en ligne n'est pas appelée seulement par ton interface : des robots la trouvent et la
frappent en boucle, sans jamais se fatiguer. Chaque route qui coûte (IA, SMS, e-mail, génération)
devient un compteur que n'importe qui peut faire tourner sur ta carte bancaire. Dans l'autre sens,
chaque service que tu appelles sera un jour lent ou en panne. L'idée clé : **tout ce qui entre est
limité, tout ce qui sort est borné dans le temps, et rien ne s'exécute deux fois par accident.**
Qui a le droit d'appeler quoi relève d'IAM, la validation des données d'INJ, CORS de WEB.

---

### API-01 · Connexion, inscription, mot de passe oublié, formulaires et routes coûteuses ont un rate limiting
`bloquant` · `api` · `auto`

**Pourquoi** — Le rate limiting (limitation de débit) plafonne le nombre de requêtes qu'un même
client peut faire dans une fenêtre de temps. Sans lui, un robot essaie des milliers de mots de
passe par minute, crée des comptes en masse, fait partir des milliers d'e-mails « mot de passe
oublié » depuis ton domaine (qui finit classé spam), ou appelle ta route d'IA en boucle. Ce dernier
cas porte un nom : le *denial of wallet*, une attaque qui ne fait pas tomber le service mais vide
le portefeuille.
**Vérifier** — `node audit.mjs` signale un projet qui expose une API sans aucune bibliothèque de
rate limiting. Puis lister à la main : connexion, inscription, réinitialisation et vérification de
code, formulaires de contact et de newsletter, et toute route qui appelle un service payant à
l'usage (IA, SMS, e-mail, génération d'image ou de PDF). Chacune doit avoir sa propre limite, plus
stricte que celle du reste de l'API.
**Corriger** — Deux limites qui se complètent : **par IP** (protège avant la connexion) et **par
utilisateur** (un compte qui change d'IP reste limité). Réponse `429 Too Many Requests` avec un
en-tête `Retry-After`. Les valeurs se règlent sur l'usage réel d'un humain.
| Stack | Solution |
|---|---|
| Tout domaine derrière Cloudflare | Règle WAF « Rate limiting rules », sans code (une règle sur l'offre gratuite) |
| Cloudflare Workers | Binding `ratelimits` de `wrangler.toml`, puis `env.LIMITEUR.limit({ key })` |
| Next.js, Vercel, Netlify, Supabase Edge Functions | `@upstash/ratelimit` avec un Redis Upstash |
| Express | `express-rate-limit` (et un store Redis dès qu'il y a plusieurs instances) |
| Hono | `hono-rate-limiter` (son `keyGenerator` est obligatoire) |
| FastAPI / Flask | `slowapi` / `Flask-Limiter` |
| Supabase Auth | Limites intégrées sur ses routes, réglables dans Authentication → Rate Limits |

```ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
const limiteur = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(5, '1 m'), prefix: 'connexion' })
const { success } = await limiteur.limit(`${email}:${ip}`)
if (!success) return new Response('Trop de tentatives', { status: 429, headers: { 'Retry-After': '60' } })
```
```toml
# wrangler.toml (Workers) : period vaut 10 ou 60 secondes, rien d'autre
[[ratelimits]]
name = "LIMITEUR"
namespace_id = "1001"
simple = { limit = 10, period = 60 }
```
**Piège** — Limiter seulement dans l'interface (bouton désactivé) : le robot appelle l'API
directement. Autre piège : croire que les limites de Supabase Auth protègent tout. Elles ne
couvrent que les routes d'Auth ; tes Edge Functions n'ont pas de rate limiting par utilisateur
intégré.
**Notions** — Rate Limiting, Denial of wallet

---

### API-02 · Le compteur du rate limiting est partagé entre instances et reconnaît vraiment le client
`important` · `api`

**Pourquoi** — Un compteur en mémoire (`new Map()`, `lru-cache`, le `MemoryStore` par défaut
d'`express-rate-limit`) ne vit que dans une instance du programme. En serverless (Vercel, Netlify,
Workers, Edge Functions), les requêtes se répartissent sur plusieurs instances qui naissent et
meurent sans arrêt, chacune avec un compteur à zéro : la limite n'existe plus. Même chose avec
plusieurs serveurs ou après un redémarrage. Deuxième faille : si l'IP est lue dans un en-tête que
le client écrit lui-même (`X-Forwarded-For` non contrôlé), l'attaquant change d'« IP » à chaque
requête.
**Vérifier** — Où vit le compteur ? D'où vient l'IP ? Derrière un proxy, Express sans `trust
proxy` voit l'IP du proxy pour tout le monde (tous les visiteurs partagent une seule limite) ;
avec `trust proxy` à `true`, il croit n'importe quel en-tête. FastAPI derrière un proxy : uvicorn
lancé sans `--proxy-headers` voit l'IP du proxy.
**Corriger** — Un stockage partagé : Redis (Upstash, `rate-limit-redis` pour Express, `slowapi`
avec `storage_uri="redis://..."`), ou le binding `ratelimits` / un Durable Object sur Cloudflare.
L'IP vient de l'en-tête posé par **ta** plateforme : `CF-Connecting-IP` derrière Cloudflare ;
sur Vercel, `x-forwarded-for` (que Vercel réécrit pour empêcher l'usurpation) ou `ipAddress()` de
`@vercel/functions`. Express : `app.set('trust proxy', 1)` (le nombre de proxys devant toi). En
IPv6, une seule personne dispose de milliers d'adresses : limiter par bloc (`express-rate-limit`
le fait par défaut avec `ipv6Subnet`). Clé : l'identifiant de l'utilisateur quand il est
connecté, l'IP sinon ; pour la connexion, l'identifiant visé **et** l'IP.
**Piège** — Le binding `ratelimits` de Cloudflare compte séparément dans chaque centre de données
et de façon approximative : parfait pour freiner un abus, pas pour un quota exact (API-15).
Cloudflare déconseille aussi l'IP seule comme clé : un bureau ou un réseau mobile partage souvent
une même IP.
**Notions** — Rate Limiting

---

### API-03 · Chaque appel sortant a un délai maximum (timeout)
`important` · `tout` · `auto`

**Pourquoi** — Un timeout (délai d'expiration) dit « au-delà de N secondes, j'abandonne ». La
norme `fetch` n'en prévoit aucun ; Node attend plusieurs minutes avant de couper, et `requests`
(Python) attend indéfiniment. Quand le service appelé rame, chaque requête de ton serveur reste
bloquée, les connexions s'empilent, ta fonction serverless est facturée à attendre jusqu'à sa
durée maximale, et tout ton site ralentit à cause d'un service tiers.
**Vérifier** — `node audit.mjs` signale les appels `fetch(` sans `signal`. Chercher aussi `axios`
sans `timeout` (0 par défaut = aucun), `requests.get/post(` sans `timeout=`, `httpx` (5 secondes
par défaut, à adapter), les SDK (OpenAI et Anthropic attendent jusqu'à 10 minutes par défaut et
retentent 2 fois).
**Corriger** —
```ts
const rep = await fetch(url, { signal: AbortSignal.timeout(8000) })  // lève une TimeoutError après 8 s
const ia = new OpenAI({ timeout: 30_000, maxRetries: 2 })             // régler le SDK plutôt que l'envelopper
```
```python
requests.post(url, json=donnees, timeout=(3, 10))   # 3 s pour se connecter, 10 s pour lire
httpx.post(url, json=donnees, timeout=10.0)
```
Axios : `axios.create({ timeout: 8000 })`. Choisir le délai d'après le service : quelques secondes
pour une API classique, davantage pour une génération d'IA (ou la diffuser en flux, NET-16). Si
l'URL appelée vient de l'utilisateur, c'est aussi un sujet de SSRF : INJ.
**Piège** — Un timeout par essai ne dit rien du total : 3 essais de 10 secondes, plus les
attentes, dépassent la durée maximale d'une fonction serverless. Le temps total compte (API-08).
**Notions** — Timeouts

---

### API-04 · Chaque webhook entrant vérifie sa signature, sur le corps brut, avant d'agir
`bloquant` · `async` · `auto`

**Pourquoi** — Un webhook est une URL de ton serveur qu'un service (Stripe, Shopify, GitHub,
Supabase, Resend) appelle pour te prévenir d'un événement (« paiement réussi »). Cette URL est
publique : sans vérification, n'importe qui y envoie un faux « paiement réussi » et repart avec la
commande. La signature est un HMAC : une empreinte du message calculée avec un secret partagé (le
`whsec_…` de Stripe) ; seul celui qui connaît le secret peut la produire.
**Vérifier** — `node audit.mjs` signale les routes de webhook (`webhook`, `hooks`, `stripe`,
`shopify`…) sans appel de vérification (`constructEvent`, `verify`, `createHmac`). Ensuite : la
vérification se fait-elle **avant** toute action ? Sur le corps **brut**, tel que reçu ? Un JSON
relu puis réécrit change d'un espace ou d'un ordre de champs, et la signature ne correspond plus.
**Corriger** — Stripe :
```ts
// Next.js App Router : app/api/webhooks/stripe/route.ts
const corps = await req.text()   // brut : surtout pas req.json()
const event = stripe.webhooks.constructEvent(corps, req.headers.get('stripe-signature')!, process.env.STRIPE_WEBHOOK_SECRET!)
```
Express : `app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), gestionnaire)`
déclaré **avant** `app.use(express.json())`. Workers, Hono, Edge Functions (Deno) :
`await stripe.webhooks.constructEventAsync(...)`, la version qui utilise Web Crypto. FastAPI :
`await request.body()`. Autres fournisseurs : leur bibliothèque (`svix` ou `standardwebhooks` pour
ceux qui suivent la spécification Standard Webhooks), ou un HMAC comparé en temps constant :
```ts
import { createHmac, timingSafeEqual } from 'node:crypto'
const attendu = createHmac('sha256', secret).update(corpsBrut).digest()
const recu = Buffer.from(req.headers.get('x-shopify-hmac-sha256') ?? '', 'base64')  // Shopify : base64
const valide = recu.length === attendu.length && timingSafeEqual(recu, attendu)
```
Python : `hmac.compare_digest(a, b)`. Web Crypto : `crypto.subtle.verify('HMAC', cle, sig, donnees)`.
Signature invalide : répondre `400` et ne rien faire.
**Piège** — Comparer avec `===` : la comparaison s'arrête au premier caractère différent, et le
temps de réponse renseigne l'attaquant octet par octet (attaque temporelle). Autre classique : un
`catch` qui journalise l'échec de vérification… puis continue le traitement.
**Notions** — Webhooks, Hachage et chiffrement

---

### API-05 · Un webhook rejoué ou reçu deux fois ne produit qu'un seul effet
`important` · `async`

**Pourquoi** — Les fournisseurs livrent « au moins une fois » : dans le doute, ils renvoient.
Stripe réessaie pendant trois jours au maximum en production, Shopify 8 fois en 4 heures. Le même
événement arrive donc parfois deux fois : deux e-mails de confirmation, deux crédits ajoutés. Et un
attaquant qui a capté un vrai message signé peut le renvoyer plus tard : c'est un rejeu (replay).
**Vérifier** — L'identifiant de l'événement (`event.id` chez Stripe, `webhook-id` en Standard
Webhooks) est-il enregistré, et un deuxième passage est-il sans effet ? L'horodatage signé est-il
contrôlé ? Le code suppose-t-il que les événements arrivent dans l'ordre ?
**Corriger** — Rendre le traitement idempotent (le rejouer donne le même résultat) : une table des
événements traités avec une clé unique, remplie dans la même transaction que l'effet (BDD-06).
```sql
create table evenements_webhook (id text primary key, recu_le timestamptz not null default now());
-- insert into evenements_webhook (id) values ($1) on conflict (id) do nothing
-- 0 ligne insérée = déjà traité : répondre 200 sans rien refaire
```
Rejeu : les bibliothèques Stripe refusent par défaut un horodatage de plus de 5 minutes (ne jamais
régler la tolérance à 0, qui désactive le contrôle) ; en HMAC maison, signer `horodatage + corps`
et rejeter au-delà de quelques minutes. Ordre : Stripe ne le garantit pas ; relire l'objet à jour
par l'API plutôt que de se fier à l'ordre d'arrivée.
**Notions** — Webhooks, Idempotency

---

### API-06 · Le webhook répond vite et fait le gros du travail en tâche de fond
`important` · `async`

**Pourquoi** — Le fournisseur attend une réponse `2xx` en quelques secondes (Shopify coupe à 5
secondes). Au-delà, il considère l'envoi raté et le renvoie : les doublons se multiplient, et des
échecs répétés peuvent faire désactiver ton endpoint. Stripe demande explicitement de répondre
avant toute logique longue.
**Vérifier** — Le gestionnaire appelle-t-il des services lents (e-mail, IA, PDF, comptabilité)
avant de répondre ? Combien de temps met-il (onglet des livraisons chez le fournisseur) ?
**Corriger** — Vérifier la signature (API-04), enregistrer l'événement (API-05), répondre `200`,
puis traiter : `ctx.waitUntil()` (Cloudflare Workers), `after()` de `next/server` (Next.js),
`waitUntil` de `@vercel/functions`, `EdgeRuntime.waitUntil()` (Supabase). Ces mécanismes restent
bornés par la durée maximale de la fonction : pour un travail long ou qui doit être retenté, une
vraie file de messages (Cloudflare Queues, etc. : ASY).
**Piège** — Répondre `200` **avant** d'avoir enregistré l'événement : si la suite plante,
l'événement est perdu, et le fournisseur, qui a reçu son `200`, ne le renverra pas.
**Notions** — Webhooks

---

### API-07 · Chaque fournisseur payant a un plafond de dépense et des alertes de budget
`important` · `paiement`

**Pourquoi** — C'est le dernier filet contre le denial of wallet, une boucle infinie ou une clé
volée (SEC-06). Sans plafond, la facture n'a pas de limite. Une alerte seule ne coupe rien : elle
prévient, parfois avec des heures de retard.
**Vérifier** — Pour chaque compte facturé à l'usage (IA, SMS, e-mail, hébergement, base) : un
plafond dur existe-t-il et est-il réglé ? Des alertes de budget sont-elles reçues par quelqu'un
qui les lit ?
**Corriger** — Ce que proposent les fournisseurs (à revérifier dans leur console, ça bouge) :
| Fournisseur | Ce qui existe |
|---|---|
| OpenAI, Anthropic | Limites et alertes de dépense par organisation ou projet ; vérifier si la limite bloque ou prévient seulement. Des crédits prépayés sans recharge automatique font un vrai plafond |
| Gemini (Google AI Studio) | Plafond mensuel par projet depuis mars 2026, appliqué avec une dizaine de minutes de retard |
| Google Cloud, AWS | Budgets avec alertes : **ils ne coupent rien** sans automatisation ajoutée |
| Vercel | Spend Management : un montant, et la mise en pause de la production quand il est atteint |
| Supabase | Spend Cap (offre Pro) : bloque les dépassements d'usage |
| Cloudflare (Workers payant) | Alertes de budget ; pas de plafond dur |
| Twilio et SMS | Alertes d'usage, et pays autorisés restreints (Geo Permissions) contre la fraude au SMS surtaxé |

**Piège** — Un plafond trop proche de l'usage normal coupe la prod au premier pic de succès. Le
régler nettement au-dessus de la consommation habituelle, avec une alerte avant.
**Notions** — Denial of wallet, Cost Optimization

---

### API-08 · On ne retente que ce qui peut réussir, avec backoff exponentiel, jitter et plafond
`important` · `tout`

**Pourquoi** — Retenter (retry) une requête échouée sauve des pannes passagères. Mal fait, c'est un
amplificateur : mille clients qui retentent tous immédiatement achèvent un service déjà en
difficulté. Retenter une erreur `400` ou `401` ne sert à rien : la même requête échouera pareil.
Retenter une opération qui n'est pas idempotente (un paiement sans clé, API-09) peut débiter deux
fois.
**Vérifier** — Boucles autour d'appels réseau, `p-retry`, `axios-retry`, `tenacity`, `maxRetries`
des SDK. Pour chacune : quelles erreurs déclenchent un nouvel essai ? L'attente grandit-elle ?
Y a-t-il une part de hasard, un nombre maximum d'essais ? L'opération est-elle idempotente ?
**Corriger** — Retenter seulement les erreurs passagères : coupure réseau, timeout, `429`, `502`,
`503`, `504` (`500` avec prudence). Jamais les autres `4xx`. Attendre de plus en plus longtemps
(backoff exponentiel : 0,5 s, 1 s, 2 s, 4 s…) en tirant au hasard dans cet intervalle (jitter),
pour que les clients ne reviennent pas tous à la même seconde. Trois à cinq essais au plus.
Respecter l'en-tête `Retry-After` quand il est fourni (en secondes ou en date).
```ts
const attente = Math.random() * Math.min(10_000, 500 * 2 ** essai)  // « full jitter », plafonné à 10 s
```
Python : `tenacity` (`wait_random_exponential`, `stop_after_attempt`). Les SDK de Stripe, OpenAI
et Anthropic retentent déjà : régler leur `maxRetries` au lieu d'ajouter une boucle autour.
**Piège** — Retenter à chaque couche : 3 essais dans le SDK × 3 dans ton code × 3 dans le
navigateur = 27 appels pour un seul clic.
**Notions** — Retries, Exponential Backoff, Jitter, Idempotency

---

### API-09 · Paiements et créations résistent au double envoi (clé d'idempotence)
`important` · `paiement`

**Pourquoi** — Double clic, réseau qui coupe juste après l'envoi, retry automatique : la même
demande arrive deux fois, et le client est débité deux fois ou reçoit deux commandes. Une clé
d'idempotence est un identifiant unique créé **une fois** pour une intention (« ce paiement-là »)
et renvoyé à chaque essai : le serveur reconnaît la répétition et rend le premier résultat au
lieu de recommencer.
**Vérifier** — Les créations Stripe (`paymentIntents.create`, `refunds.create`,
`checkout.sessions.create`…) passent-elles `idempotencyKey` ? Tes propres routes de création
(commande, réservation, envoi) supportent-elles d'être appelées deux fois ? Le bouton est-il
désactivé pendant l'envoi (confort, pas protection) ?
**Corriger** —
```ts
await stripe.refunds.create({ payment_intent: pi }, { idempotencyKey: `remboursement-${commandeId}` })
```
Chez Stripe, toutes les requêtes `POST` acceptent une clé de 255 caractères au plus, oubliée après
24 heures environ ; prendre un UUID v4 ou un identifiant métier stable, jamais une donnée
personnelle. Pour ta propre API : accepter un en-tête `Idempotency-Key` (nom repris d'un brouillon
de norme de l'IETF), l'enregistrer avec une contrainte unique et la réponse produite ; une
deuxième requête avec la même clé reçoit la même réponse. Souvent, une contrainte unique métier
suffit (BDD-05) : une seule commande par panier.
**Piège** — Générer une nouvelle clé à chaque essai (`crypto.randomUUID()` dans la boucle de
retry) : chaque essai paraît nouveau, la protection ne sert à rien. La clé naît avec l'intention,
avant le premier essai.
**Notions** — Idempotency

---

### API-10 · La taille des requêtes est plafonnée
`important` · `api`

**Pourquoi** — Un corps de 500 Mo, un tableau de dix millions d'éléments, un texte d'un million de
caractères envoyé à ta route d'IA : la mémoire explose, la fonction plante, ou la facture grimpe
(chaque jeton envoyé à l'IA se paie). Plafonner la taille, c'est refuser tôt et pour pas cher.
**Vérifier** — Limite du lecteur de corps : `express.json()` (100 ko par défaut, souvent remonté à
`'50mb'` « pour que ça marche ») ; Hono sans `bodyLimit` ; Flask sans `MAX_CONTENT_LENGTH` ;
FastAPI (aucune limite intégrée). Longueur maximale des chaînes et des tableaux dans les schémas
de validation (INJ).
**Corriger** —
```ts
app.use(express.json({ limit: '100kb' }))                          // Express
import { bodyLimit } from 'hono/body-limit'
app.post('/api/ia', bodyLimit({ maxSize: 50 * 1024 }), gestionnaire)  // Hono
const Message = z.object({ texte: z.string().max(4000), ids: z.array(z.string()).max(100) })
```
Flask : `app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024`. FastAPI : au proxy
(`client_max_body_size` de nginx) ou en refusant un `content-length` trop grand. Réponse `413`.
Les plateformes ont déjà un maximum (4,5 Mo par requête sur les fonctions Vercel), bien trop large
pour un formulaire. Les fichiers envoyés suivent leurs propres règles (INJ).
**Notions** — Denial of wallet

---

### API-11 · Toutes les listes sont paginées, avec une taille de page plafonnée par le serveur
`important` · `api`

**Pourquoi** — Une route qui renvoie « toutes les commandes » marche avec 50 lignes et s'écroule
avec 500 000 : réponse énorme, mémoire saturée, base à genoux. Et un robot aspire toute ta base en
une seule requête. La pagination découpe la liste en pages.
**Vérifier** — Chaque route qui renvoie une liste : un `limit` existe-t-il, avec un maximum imposé
par le serveur et pas seulement proposé par le client ? Requêtes sans `.limit()`, `.range()`,
`LIMIT`, `take`. Supabase : le réglage « Max rows » de l'API (1 000 par défaut) est un filet, pas
une pagination.
**Corriger** —
```ts
const limite = Math.min(Number(params.get('limite')) || 20, 100)   // le serveur fixe le maximum
```
Renvoyer de quoi demander la suite (un curseur ou un numéro de page). Pour les grandes tables et
les fils qui bougent, pagination par curseur (BDD-16). Les API externes se lisent aussi page par
page, avec une limite au nombre de pages.
**Notions** — Pagination

---

### API-12 · Les erreurs ont un format unique et ne révèlent rien d'interne
`important` · `api`

**Pourquoi** — Une trace de pile (stack trace), un message SQL ou un chemin de fichier renvoyé au
client dit à l'attaquant quelle base, quelle bibliothèque, quelle version tu utilises, parfois un
morceau de requête ou de donnée. Le mode debug de Flask en prod est pire : son débogueur permet
d'exécuter du code sur le serveur. Des messages différents (« compte inconnu » / « mot de passe
faux ») révèlent qui est inscrit (IAM). Et un format différent par route oblige l'interface à
deviner.
**Vérifier** — Provoquer des erreurs (JSON invalide, identifiant inexistant, champ manquant) et
lire la réponse. Chercher `res.status(500).json(err)`, `{ error: e.message }`, `traceback` renvoyé,
`debug=True` (Flask), `FastAPI(debug=True)`.
**Corriger** — Un gestionnaire d'erreurs central : le détail complet part dans les journaux (OBS)
avec un identifiant de requête ; le client reçoit un message générique et cet identifiant. Un seul
format, par exemple « Problem Details » de la RFC 9457 (`Content-Type: application/problem+json`) :
```json
{ "type": "about:blank", "title": "Requête invalide", "status": 400,
  "detail": "Le champ « email » est requis.", "requestId": "req_8f3a" }
```
Des codes justes : `400` données invalides, `401` non connecté, `403` interdit, `404` introuvable,
`409` conflit, `413` trop gros, `429` trop de requêtes, `500` erreur interne.
**Notions** — Problem Details

---

### API-13 · Les formulaires publics ont une protection anti-robots, vérifiée par le serveur
`important` · `web`

**Pourquoi** — Contact, inscription, newsletter, commentaires : sans protection, des robots les
remplissent par milliers. Spam, faux comptes, e-mails envoyés à des inconnus depuis ton domaine
(qui ruinent sa réputation, NET-11). Le rate limiting freine un robot ; il n'arrête pas un réseau
de milliers d'IP.
**Vérifier** — Chaque formulaire accessible sans connexion. Le jeton du défi est-il vérifié **par
le serveur** ? Un widget affiché mais jamais vérifié ne protège rien.
**Corriger** — Cloudflare Turnstile (gratuit, le plus souvent invisible pour un humain), hCaptcha
ou reCAPTCHA. Le serveur vérifie le jeton :
```ts
const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
  method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: jeton }),
  signal: AbortSignal.timeout(5000) })
if (!(await r.json()).success) return new Response('Vérification échouée', { status: 403 })
```
Un jeton Turnstile vaut 5 minutes et une seule vérification. Supabase Auth sait exiger un jeton
hCaptcha ou Turnstile à l'inscription, à la connexion et au mot de passe oublié (réglages d'Auth,
section protection contre les robots). En complément gratuit : un champ caché « pot de miel »
(honeypot) que seuls les robots remplissent.
**Piège** — Mettre un CAPTCHA partout, y compris devant des utilisateurs déjà connectés : de la
friction pour rien. Le réserver aux portes d'entrée anonymes et aux routes coûteuses.
**Notions** — Protection anti-robots, Rate Limiting

---

### API-14 · WAF et protection DDoS viennent du CDN, et le serveur d'origine n'est pas joignable en direct
`conseillé` · `prod`

**Pourquoi** — Une attaque DDoS (déni de service distribué) noie un serveur sous des millions de
requêtes venues de milliers de machines. Un WAF (Web Application Firewall, pare-feu applicatif)
filtre les requêtes qui ressemblent à des attaques connues (injections, scanners, robots). Les deux
demandent une infrastructure mondiale : impossible à faire soi-même, et inutile de le tenter. Mais
si l'IP réelle du serveur est connue, l'attaquant contourne le CDN et frappe directement.
**Vérifier** — Le domaine passe-t-il par un CDN qui protège (Cloudflare en mode proxy, nuage
orange ; Vercel ; Netlify) ? Le serveur d'origine (VPS, Render, Railway…) accepte-t-il des
connexions de n'importe qui ? Son IP traîne-t-elle dans un sous-domaine non proxifié (`direct.`,
`mail.`, `ftp.`) ou un ancien enregistrement DNS ?
**Corriger** — Cloudflare : proxy activé (protection DDoS incluse sur toutes les offres, sans
facturation au volume), jeu de règles gérées gratuit du WAF, une règle de rate limiting (API-01),
mode « Under Attack » en cas de crise. Origine verrouillée : Cloudflare Tunnel (`cloudflared`,
aucun port entrant ouvert) ou pare-feu qui n'accepte que les plages IP de Cloudflare (NET-10).
Vercel et Netlify : protection incluse ; Vercel Firewall pour des règles sur mesure.
**Piège** — Coder son propre « anti-DDoS » dans l'application : quand la requête atteint ton code,
tu paies déjà pour elle.
**Notions** — WAF, DDoS Protection

---

### API-15 · Ce qui coûte a un quota par utilisateur, et son coût est suivi
`important` · `paiement`

**Pourquoi** — Le rate limiting borne la vitesse (10 par minute), pas le total : un utilisateur,
ou un robot avec un compte gratuit, peut tourner à 10 par minute toute la journée. Un quota (« 50
générations par jour sur l'offre gratuite ») borne ce total. Suivre le coût par utilisateur montre
qui coûte plus qu'il ne rapporte, avant la facture.
**Vérifier** — Les appels à un service payant sont-ils comptés par utilisateur, en base ? Y a-t-il
un plafond par offre ? Peut-on créer des comptes gratuits à volonté pour multiplier le quota
(inscription protégée par API-01 et API-13, vérification de l'e-mail : IAM) ?
**Corriger** — Vérifier et décompter le quota en une seule opération atomique, avant l'appel
(sinon deux requêtes simultanées passent toutes les deux, BDD-07). Afficher le reste à
l'utilisateur. Côté coûts (Cost Optimization) : mettre en cache les réponses coûteuses identiques,
ne pas rappeler un service pour une donnée qui change peu, regrouper les appels, choisir le modèle
d'IA le moins cher qui suffit et borner la longueur de ses réponses (IA).
**Notions** — Cost Optimization, Denial of wallet, Rate Limiting

---

### API-16 · Une dépendance en panne ne fait pas tomber le reste (circuit breaker)
`conseillé` · `échelle`

**Pourquoi** — Quand un service tiers tombe, chaque requête l'attend jusqu'au timeout, retente, et
occupe une instance pendant ce temps : la panne du fournisseur devient la tienne. Un circuit
breaker (disjoncteur) compte les échecs ; au-delà d'un seuil, il « ouvre le circuit » et répond
tout de suite, par une erreur claire ou une solution de repli, sans appeler. De temps en temps, il
laisse passer un essai pour voir si le service est revenu.
**Vérifier** — Que voit l'utilisateur si l'API de paiement, d'IA ou d'e-mail ne répond plus ? Un
repli existe-t-il : réponse en cache, fonction désactivée proprement, envoi mis en file, message
honnête ?
**Corriger** — Pour un petit projet, timeouts (API-03), retries bornés (API-08) et un repli
explicite suffisent. Un vrai disjoncteur (`opossum` en Node, `pybreaker` en Python) vaut le coup
quand le trafic est soutenu et qu'une dépendance lente peut saturer tes serveurs ou ton pool de
connexions, typiquement entre les services d'une même architecture.
**Piège** — En serverless, chaque instance a son propre disjoncteur et ne voit que ses propres
échecs : à faible trafic, il ne s'ouvre jamais. C'est un outil de serveurs qui durent, ou d'état
partagé.
**Notions** — Circuit breaker

---

### API-17 · Une API appelée par des clients qu'on ne met pas à jour soi-même est versionnée
`conseillé` · `api`

**Pourquoi** — Si ton API n'est appelée que par ton propre site, déployé en même temps qu'elle, tu
changes les deux ensemble : pas besoin de versions. Mais une app mobile (que les gens ne mettent
pas à jour), une extension de navigateur (soumise à la validation du magasin), un serveur MCP, un
client ou un partenaire qui code contre ton API : renommer un champ casse chez eux sans prévenir.
Le versioning garde l'ancienne forme le temps qu'ils migrent.
**Vérifier** — Qui appelle l'API, et peut-on tous les mettre à jour au même moment ? Un changement
récent a-t-il retiré ou renommé un champ, changé un type, rendu un paramètre obligatoire ?
**Corriger** — Ajouter est sans danger (nouveau champ facultatif) ; retirer, renommer ou changer
le sens demande une nouvelle version. Le plus simple : un préfixe de chemin (`/v1/`, `/v2/`).
Stripe, par exemple, utilise des versions datées choisies par en-tête. Annoncer la fin d'une
version avec un délai, et l'en-tête `Sunset` (RFC 8594) qui en donne la date. Sans client externe,
c'est du niveau `échelle` : ne pas versionner.
**Notions** — API Versioning

---

### API-18 · Une passerelle d'API seulement quand plusieurs services la justifient
`conseillé` · `échelle`

**Pourquoi** — Une API gateway (passerelle d'API) est une porte d'entrée unique devant plusieurs
services : elle vérifie les clés ou les jetons, applique rate limiting et quotas, journalise,
oriente vers le bon service, parfois facture l'accès. Précieuse avec beaucoup de services ou une
API publique vendue avec des clés et des offres. Pour une seule application, c'est une couche de
plus à configurer, à payer et à déboguer.
**Vérifier** — Combien de services derrière ? Les mêmes règles (auth, limites, journaux) sont-elles
recopiées dans chacun ? Une API publique avec des clés par client est-elle prévue ?
**Corriger** — Petit projet : un middleware commun joue ce rôle (`proxy.ts`, ex-`middleware.ts`,
de Next.js ; middleware Hono ou Express ; un Worker devant le reste). Plusieurs services ou API
publique monétisée : une passerelle gérée (AWS API Gateway, Kong, Google Apigee, Azure API
Management), décrite en code.
**Notions** — API Gateways
