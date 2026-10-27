# 11 · Journaux, métriques, alertes, incidents (OBS)

Le but tient en une phrase : **savoir qu'un problème existe avant tes utilisateurs, et comprendre
pourquoi sans deviner.** Le *monitoring* (surveillance) répond aux questions prévues : le site
répond-il, combien d'erreurs ? L'*observability* (observabilité) permet de répondre aussi à celles
qu'on n'avait pas prévues, à partir de trois matières : les journaux (ce qui s'est passé), les
métriques (combien, à quelle vitesse) et les traces (le chemin d'une requête). Pour un projet solo,
quatre choses suffisent pour commencer : un suivi des erreurs, une sonde de disponibilité, des
journaux lisibles et une alerte qui te prévient vraiment. Le reste vient avec le trafic.

---

### OBS-01 · Les erreurs du serveur et du navigateur remontent dans un service de suivi, avec la version déployée
`important` · `prod`

**Pourquoi** — Sans suivi des erreurs, on apprend qu'un paiement plante par le message d'un
utilisateur, trois jours plus tard, ou jamais : la plupart des gens ne signalent rien, ils partent.
Les journaux de la plateforme ne voient pas les erreurs du navigateur, et ne les gardent pas
longtemps (OBS-14).
**Vérifier** — Un SDK de suivi est-il initialisé côté serveur **et** côté navigateur ? Les erreurs
non attrapées (exceptions des routes, promesses rejetées) y arrivent-elles ? Test : déclencher une
erreur volontaire en préversion et la retrouver dans le service. Chaque erreur porte-t-elle
l'environnement et la version ?
**Corriger** — Sentry, ou un équivalent (GlitchTip, auto-hébergeable et compatible avec les SDK
Sentry ; Better Stack ; PostHog). Selon la stack : `@sentry/nextjs` (assistant
`npx @sentry/wizard@latest -i nextjs`), `@sentry/react` avec `@sentry/vite-plugin`, `@sentry/node`
pour Express ou Hono, `@sentry/cloudflare` pour les Workers, `sentry-sdk` pour FastAPI et Flask.
Next.js : `error.tsx` et `global-error.tsx` affichent une page propre et transmettent l'erreur ;
React : un error boundary autour de l'application. Renseigner `environment` (`production`,
`preview`) et `release` (le SHA du commit) : on voit alors quel déploiement a fait apparaître
l'erreur, et s'il faut un rollback (LIV-10). Google Apps Script : dans Déclencheurs, régler les
notifications d'échec sur « immédiatement ».
**Piège** — Envoyer des données personnelles avec l'erreur (corps de requête, e-mail, cookies).
Laisser `sendDefaultPii` désactivé (c'est le défaut) et filtrer dans `beforeSend` (LEG).
**Notions** — Suivi des erreurs, Monitoring

---

### OBS-02 · Une sonde externe vérifie que le site répond, et prévient avant les utilisateurs
`important` · `prod`

**Pourquoi** — Quand tout est en panne, plus rien ne remonte : le suivi d'erreurs reste muet si le
serveur ne répond plus, si le DNS est cassé ou si le certificat a expiré. Seule une sonde extérieure,
qui visite le site toutes les minutes depuis Internet, voit ce que voit l'utilisateur.
**Vérifier** — Une surveillance de disponibilité (uptime monitoring) existe-t-elle ? Sur quelles URL,
à quelle fréquence, qui reçoit l'alerte ? Tourne-t-elle hors de l'infrastructure surveillée ?
**Corriger** — Un service externe gratuit pour commencer : UptimeRobot, Better Stack (lire les
conditions de l'offre gratuite : certaines l'ont réservée à un usage non commercial). Deux sondes au
minimum : la page d'accueil, en exigeant un code 200 **et** un mot présent dans la page (une page
blanche ou d'erreur peut répondre 200) ; la route `/health` de l'API (OBS-09). Ajouter la
surveillance de l'expiration du certificat et du domaine si le service la propose. Alerter après
deux échecs consécutifs, pour éviter les fausses alertes.
**Piège** — Une sonde auto-hébergée (Uptime Kuma) sur le serveur qu'elle surveille : quand le
serveur tombe, la sonde tombe avec lui et ne prévient personne.
**Notions** — Uptime monitoring, Healthchecks, Alerts

---

### OBS-03 · Les alertes sont rares, actionnables, et arrivent là où on les voit
`important` · `prod`

**Pourquoi** — Une alerte est un message qui exige une action. Si elle sonne pour rien, on apprend à
l'ignorer, et le jour d'une vraie panne personne ne réagit. Une alerte qu'on ignore est pire que pas
d'alerte : elle donne l'illusion d'être protégé.
**Vérifier** — La liste des alertes (sonde, suivi d'erreurs, fournisseurs, facturation). Pour
chacune : combien de fois a-t-elle sonné le mois dernier, et combien de fois a-t-il fallu agir ? Où
arrive-t-elle : un e-mail noyé, ou une notification sur le téléphone ?
**Corriger** — Alerter sur ce que vit l'utilisateur (site injoignable, taux d'erreur qui monte,
paiements qui échouent, tâche planifiée qui n'a pas tourné), pas sur chaque cause possible (CPU à
80 % pendant une minute). Chaque alerte dit quoi faire, ou renvoie au runbook (OBS-12). Deux
niveaux : « urgent », qui réveille (notification de l'application de la sonde, appel, SMS) ; « à
voir », qui attend (e-mail, Discord, Slack). Dans Sentry, alerter sur une nouvelle erreur ou une
hausse soudaine, pas sur chaque occurrence. Les alertes de budget chez les fournisseurs payants à
l'usage : API.
**Piège** — Le mode « ne pas déranger » du téléphone qui filtre justement l'application d'alerte :
l'autoriser à passer, et vérifier une fois qu'une alerte de test réveille vraiment.
**Notions** — Alerts, On-Call

---

### OBS-04 · Les journaux sont structurés, avec des niveaux, sans secret ni donnée personnelle
`important` · `api` · `auto`

**Pourquoi** — Un journal (log) est la trace écrite de ce que fait le serveur. En phrases libres
(`"erreur pour user " + id`), il se lit mal et ne se filtre pas. Un **journal structuré** écrit
chaque événement comme un objet JSON aux champs fixes (`level`, `msg`, `orderId`, `requestId`) : on
retrouve « toutes les erreurs de la commande 4512 » en une recherche. Et les journaux sont lus par
plus de monde, et parfois gardés plus longtemps, que la base : ni secret, ni donnée personnelle
inutile.
**Vérifier** — `node audit.mjs` (signale les `console.log` qui affichent un secret). Les journaux du
serveur sont-ils en JSON ? Les niveaux (`debug`, `info`, `warn`, `error`) sont-ils utilisés, avec
`info` par défaut en prod ? Chercher les objets entiers journalisés (`req`, `headers`, `body`,
`user`) et les e-mails, jetons ou mots de passe écrits en clair.
**Corriger** — Un logger structuré, configuré une fois :
```js
// Node : Express, Hono sur Node, Next.js côté serveur
import pino from 'pino'
export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
})
log.info({ orderId, userId }, 'commande créée')   // des identifiants, pas l'e-mail ni l'adresse
```
Cloudflare Workers : `console.log({ level: 'info', msg: 'commande créée', orderId })`, que Workers
Logs indexe champ par champ (activer `observability` dans `wrangler.jsonc`). Python : `structlog`, ou
`logging` avec un formateur JSON. Un événement par ligne ; des identifiants plutôt que des données
personnelles (SEC-11, LEG) ; le niveau `error` réservé à ce qui demande une action, sinon les vraies
erreurs se noient.
**Piège** — Passer en `debug` en prod « pour voir » et l'oublier : le volume, la facture et les
données sensibles explosent ensemble.
**Notions** — Logging, Journaux structurés, Observability

---

### OBS-05 · Les tâches planifiées et de fond signalent qu'elles ont tourné
`important` · `async`

**Pourquoi** — Une tâche qui ne démarre pas ne produit aucune erreur. Le cron désactivé, le worker
arrêté, le déclencheur Apps Script supprimé restent silencieux pendant des semaines. La sauvegarde
quotidienne qui ne tourne plus depuis un mois, on la découvre le jour où on en a besoin (REP).
**Vérifier** — Pour chaque tâche (crons Vercel, Cron Triggers Cloudflare, `pg_cron` de Supabase,
`schedule` de GitHub Actions, déclencheurs Apps Script, workers de file) : comment saurait-on qu'elle
n'a pas tourné, ou qu'elle a échoué ?
**Corriger** — Une surveillance par battement de cœur (heartbeat) : la tâche appelle une URL à la fin
de chaque exécution réussie ; si l'appel n'arrive pas à l'heure prévue, le service alerte.
Healthchecks.io (libre, auto-hébergeable), Better Stack ou Sentry Crons le proposent.
```js
await faireLaSauvegarde()
await fetch(process.env.HEARTBEAT_URL_SAUVEGARDE)   // seulement si tout a réussi
```
Les échecs eux-mêmes partent dans le suivi d'erreurs (OBS-01). Pour les files de messages,
surveiller aussi leur longueur et les messages en échec (ASY).
**Piège** — Sur un dépôt public, GitHub désactive les workflows planifiés après 60 jours sans
activité sur le dépôt : le cron « gratuit » s'arrête en silence.
**Notions** — Monitoring, Alerts, Healthchecks

---

### OBS-06 · Les actions sensibles laissent une trace dans un journal d'audit
`important` · `comptes`

**Pourquoi** — Le **journal d'audit** répond à « qui a fait quoi, quand, sur quoi » pour les actions
qui comptent : connexion et échec de connexion, changement de mot de passe ou d'e-mail, changement
de rôle, suppression de compte ou de données, export, paiement et remboursement, modification de
réglages. Sans lui, impossible de savoir si un compte a été piraté, qui a supprimé un client, ni de
répondre à un utilisateur qui conteste une action. Il diffère des journaux techniques : il décrit des
actions métier, n'est jamais modifié et se garde plus longtemps.
**Vérifier** — Les actions ci-dessus écrivent-elles une ligne d'audit ? Peut-on modifier ou supprimer
ces lignes depuis l'application ? Qui peut les lire ?
**Corriger** — Une table en ajout seul, écrite par le serveur (ou un trigger) dans la même
transaction que l'action :
```sql
create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,          -- qui (null = le système)
  action text not null,   -- 'role.change', 'account.delete', 'payment.refund'
  target text,            -- sur quoi
  details jsonb           -- avant / après, sans secret
);
alter table audit_log enable row level security;  -- aucune policy : le navigateur n'y touche pas
```
Supabase Auth journalise déjà ses propres événements de connexion. Fixer une durée de conservation
(LEG).
**Piège** — Recopier dans l'audit l'e-mail, l'adresse ou le contenu supprimé : on garde une copie
des données que l'utilisateur a demandé d'effacer. Des identifiants suffisent.
**Notions** — Journal d'audit, Logging

---

### OBS-07 · Une procédure d'incident courte est écrite avant le premier incident
`important` · `prod`

**Pourquoi** — Un incident de production (site en panne, données fausses, fuite) se gère mal dans la
panique : on répare au hasard, on oublie de prévenir, on aggrave. Quelques lignes écrites à froid
l'évitent. L'ordre compte : **atténuer d'abord** (arrêter les dégâts), **réparer ensuite**.
**Vérifier** — Une page (`docs/incident.md`, le README ou le runbook) dit-elle quoi faire ? Sait-on
où annoncer une panne aux utilisateurs ?
**Corriger** — Cinq étapes :
1. **Constater** : confirmer le problème (sonde, suivi d'erreurs, journaux) et noter l'heure.
2. **Communiquer** : un message court aux utilisateurs touchés (page de statut, bandeau, réseau
   social) : ce qui ne marche pas, ce qu'on fait, quand le prochain point.
3. **Atténuer** : le geste le plus rapide qui arrête les dégâts : rollback (LIV-10), couper un
   feature flag (LIV-16), suspendre une tâche, révoquer une clé (SEC-06), mode maintenance.
4. **Réparer** : trouver la cause et la corriger au calme, en préversion d'abord.
5. **Apprendre** : un postmortem (OBS-13) dans la semaine.

Tenir une chronologie pendant l'incident (heure, constat ou action) : elle nourrit le postmortem.
Une fuite de données personnelles impose des notifications légales sous 72 heures (LEG).
**Piège** — Chercher la cause pendant que les utilisateurs subissent, alors qu'un rollback d'une
minute arrêterait la panne. On comprend après.
**Notions** — Production Incidents, Rollbacks, Runbook

---

### OBS-08 · Les source maps vont au service de suivi, pas au public
`conseillé` · `web`

**Pourquoi** — Le code envoyé au navigateur est minifié : une erreur dit « `a.b is undefined` à
`index-3f9a.js:1:48213` », inutilisable. Une **source map** relie ce code compressé au code source
d'origine. Envoyée au service de suivi, elle rend les erreurs lisibles ; publiée sur le site, elle
offre à tous ton code source complet, commentaires compris.
**Vérifier** — Après build : des fichiers `.map` dans `dist/`, `build/`, `.next/static/` ? Sont-ils
accessibles en ligne (`https://site/assets/index-xxx.js.map`) ? Les erreurs dans Sentry montrent-elles
le code d'origine ?
**Corriger** — Générer les cartes, les envoyer au service pendant le build, puis les supprimer avant
publication :
```js
// vite.config.ts
build: { sourcemap: 'hidden' },   // cartes générées, sans lien depuis les fichiers .js
plugins: [react(), sentryVitePlugin({
  org: '…', project: '…', authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
})],
```
Next.js avec `@sentry/nextjs` : l'envoi se fait au build, et les cartes du navigateur sont
supprimées après l'envoi par défaut (`sourcemaps.deleteSourcemapsAfterUpload`). `SENTRY_AUTH_TOKEN`
est un secret de CI (SEC-07).
**Piège** — Croire que cacher les cartes protège un secret présent dans le code client : il reste
lisible sans elles (SEC-02).
**Notions** — Suivi des erreurs

---

### OBS-09 · Le healthcheck vérifie ce qui compte, sans rien exposer
`conseillé` · `api`

**Pourquoi** — Un **healthcheck** est une route (souvent `/health`) qui répond « ça va » ou « ça ne
va pas ». La sonde (OBS-02), la plateforme et le répartiteur de charge s'en servent pour savoir si
le service est vivant. Une route qui renvoie toujours `200` ment quand la base est injoignable ; une
route bavarde (versions, nom de machine, message d'erreur de la base) renseigne un attaquant.
**Vérifier** — La route existe-t-elle ? Que vérifie-t-elle ? Que répond-elle quand la base est
coupée ? Révèle-t-elle des versions ou des détails internes ? Coûte-t-elle peu à appeler ?
**Corriger** —
```ts
// Hono (même idée avec Express, FastAPI ou une route Next.js)
app.get('/health', async (c) => {
  try {
    await pool.query('select 1')                     // la dépendance indispensable répond
    return c.json({ status: 'ok' })
  } catch (err) {
    log.error({ err }, 'health : base injoignable')  // le détail reste dans les journaux
    return c.json({ status: 'ko' }, 503)
  }
})
```
Ne vérifier que ce sans quoi le service est inutilisable (la base), pas chaque API tierce : sinon la
panne d'un fournisseur rend tout « malade ». Une requête minuscule, aucun calcul. Docker :
instruction `HEALTHCHECK` ; Fly.io, Render, Railway : chemin de santé dans la config.
**Notions** — Healthchecks, Uptime monitoring

---

### OBS-10 · Chaque requête porte un identifiant de corrélation, jusque dans le message d'erreur
`conseillé` · `api`

**Pourquoi** — Quand dix requêtes arrivent en même temps, leurs lignes de journal se mélangent. Un
**identifiant de corrélation** (request ID) est un code unique donné à chaque requête et répété sur
toutes ses lignes de journal, ses appels sortants et ses tâches de fond : un seul filtre retrouve
toute son histoire. Affiché dans le message d'erreur (« code 7f3a9c »), il permet à l'utilisateur de
te donner la ligne exacte à chercher.
**Vérifier** — Les journaux d'une même requête partagent-ils un champ ? L'identifiant est-il renvoyé
dans un en-tête (`X-Request-Id`) ? Est-il transmis aux autres services et aux tâches de fond ?
**Corriger** — Hono : `app.use(requestId())` (depuis `hono/request-id`), puis `c.get('requestId')`.
Express : `pino-http` avec `genReqId: (req) => req.headers['x-request-id'] ?? crypto.randomUUID()`.
FastAPI : `asgi-correlation-id`. Sur Vercel et Cloudflare, journaliser aussi l'identifiant de la
plateforme (`x-vercel-id`, `cf-ray`) pour croiser avec ses journaux. Le passer en en-tête aux appels
sortants et dans le contenu des tâches (ASY). Avec plusieurs services, OpenTelemetry fait la même
chose en standard (OBS-18).
**Notions** — Identifiant de corrélation, Logging, Distributed Tracing

---

### OBS-11 · Quelques métriques sont suivies : erreurs, latence P95/P99, trafic, saturation
`conseillé` · `prod`

**Pourquoi** — Une **métrique** est un chiffre mesuré dans le temps. Google en retient quatre, les
« golden signals » (signaux d'or) : la **latence** (temps de réponse), le **trafic** (requêtes par
seconde), les **erreurs** (part des requêtes en échec) et la **saturation** (à quel point une
ressource est pleine : connexions à la base, mémoire, quotas). Pour la latence, la moyenne ment : si
95 requêtes prennent 100 ms et 5 en prennent 10 s, la moyenne (environ 600 ms) cache qu'un
utilisateur sur vingt attend dix secondes. Le **P95** est le temps sous lequel passent 95 % des
requêtes ; le P99, 99 %.
**Vérifier** — Où voit-on ces quatre chiffres pour le projet ? Connaît-on leurs valeurs normales,
pour reconnaître l'anormal ?
**Corriger** — Commencer par les tableaux de bord fournis : Vercel (Observability), Cloudflare
(métriques des Workers), Supabase (rapports et connexions de la base), Sentry (performances).
Regarder taux d'erreur et P95 après chaque mise en ligne. Ajouter une ou deux métriques métier qui
disent si le produit marche (inscriptions, paiements réussis par heure) : une chute brutale signale
une panne que rien d'autre ne voit. Prometheus et Grafana, ou un service dédié, seulement avec
plusieurs serveurs à soi (`échelle`). Côté navigateur, les Core Web Vitals : PERF.
**Notions** — Metrics, Golden signals, Monitoring

---

### OBS-12 · Les gestes de secours sont écrits dans un runbook
`conseillé` · `prod`

**Pourquoi** — Un **runbook** (manuel d'exploitation) est la fiche des gestes à faire dans les
situations prévues, écrite pour quelqu'un de fatigué, stressé ou qui découvre le projet : toi dans
six mois, par exemple. Sans lui, chaque incident commence par vingt minutes à chercher où est le
bouton.
**Vérifier** — Chaque alerte (OBS-03) a-t-elle son geste écrit ? Les accès nécessaires (tableaux de
bord, CLI) sont-ils listés ?
**Corriger** — Une page courte (`docs/runbook.md`), une section par situation, avec les commandes
exactes :
```markdown
## Erreurs 500 juste après une mise en ligne
1. Vercel → projet → Instant Rollback vers le déploiement précédent (LIV-10).
2. Sonde et Sentry : les erreurs baissent-elles ?
3. Correction déployée → Undo Rollback.
## Une clé a fuité → SEC-06
## Restaurer la base → REP
```
Y mettre les liens des tableaux de bord et les noms des comptes, sans mot de passe (`RESSOURCES.md`
du mode recap). Le relire après chaque incident.
**Notions** — Runbook, Production Incidents

---

### OBS-13 · Chaque incident sérieux donne un postmortem sans coupable
`conseillé` · `prod`

**Pourquoi** — Un **postmortem** est le compte rendu écrit après un incident : ce qui s'est passé,
pourquoi, et ce qui change pour que ça ne recommence pas. « Sans coupable » (blameless) : on cherche
ce qui, dans le système, a permis l'erreur, pas qui l'a commise. Si une commande a pu effacer la
prod, le problème est que la commande le permettait. Chercher un coupable apprend surtout à cacher
ses erreurs.
**Vérifier** — Les derniers incidents ont-ils un compte rendu ? Les actions décidées ont-elles été
faites ?
**Corriger** — Un modèle court : **Résumé** (une phrase) ; **Impact** (qui, combien, combien de
temps) ; **Chronologie** (détection, actions, résolution, avec les heures) ; **Causes** (demander
« pourquoi ? » plusieurs fois, jusqu'à une cause qu'on peut corriger) ; **Ce qui a aidé, ce qui a
gêné** ; **Actions**, chacune datée et transformée en ticket. Même seul, l'écrire : c'est là qu'on
voit que l'alerte manquait, ou que le rollback n'était pas documenté.
**Piège** — Des actions vagues (« faire plus attention »). Une action est un changement vérifiable :
un test, une alerte, une protection.
**Notions** — Postmortems, Production Incidents

---

### OBS-14 · On sait où sont les journaux, combien de temps ils sont gardés, et ce qu'ils coûtent
`conseillé` · `prod`

**Pourquoi** — On cherche souvent la cause d'un problème des jours plus tard, et les plateformes
gardent peu. En 2026, Vercel garde les journaux d'exécution 1 heure en offre Hobby et 1 jour en Pro
(sans option payante) ; Cloudflare garde ceux des Workers 3 jours en gratuit et 7 jours en payant. À
l'inverse, garder trop longtemps des journaux qui contiennent des données personnelles contrevient
au RGPD (LEG), et le volume se paie.
**Vérifier** — Pour chaque composant (front, API, base, tâches) : où sont les journaux, combien de
temps, peut-on les exporter, quel volume par jour ?
**Corriger** — Si la durée native ne suffit pas, envoyer les journaux vers un service dédié (Log
Drains chez Vercel ; Logpush ou export OpenTelemetry chez Cloudflare ; vers Better Stack, Axiom,
Grafana Cloud…). Choisir une durée par type (courte pour les journaux techniques, plus longue pour
le journal d'audit, OBS-06) et l'écrire. Échantillonner les événements très fréquents et sans
intérêt (`head_sampling_rate` des Workers) plutôt que tout garder.
**Notions** — Logging, Observability

---

### OBS-15 · On sait qui est prévenu, comment et quand : l'astreinte
`conseillé` · `équipe`

**Pourquoi** — L'**astreinte** (on-call) organise qui répond aux alertes urgentes, à quelles heures,
et qui prend le relais si personne ne répond. À plusieurs, sans tour de rôle clair, chacun croit que
l'autre a vu l'alerte. Seul, la question devient : comment suis-je prévenu, et qu'est-ce que je
promets ?
**Vérifier** — Seul : quel canal sonne vraiment (OBS-03) ? Que se passe-t-il pendant tes vacances
ou tes heures de travail salarié ? Ce que tu promets (disponibilité, délai de réponse) est-il
tenable ? En équipe : planning, escalade si personne ne répond, runbook partagé.
**Corriger** — Seul : une application d'alerte autorisée à sonner, des promesses modestes et écrites
(« réponse sous 24 h en semaine »), un mode maintenance prêt à activer. En équipe : un outil de
planning et d'escalade (PagerDuty, Better Stack, incident.io…), des rotations d'une semaine, une
passation écrite, et une limite au nombre de réveils : si l'astreinte sonne toutes les nuits, on
corrige la cause, pas les gens.
**Notions** — On-Call, Alerts, Runbook

---

### OBS-16 · Liveness et readiness ne se confondent pas
`conseillé` · `échelle`

**Pourquoi** — Kubernetes (et d'autres orchestrateurs) pose deux questions différentes à chaque
conteneur. La **liveness probe** (« es-tu vivant ? ») : si elle échoue, le conteneur est
**redémarré**. La **readiness probe** (« es-tu prêt à recevoir du trafic ? ») : si elle échoue, le
conteneur est **retiré du répartiteur de charge** sans être tué, le temps qu'il se remette. Une
troisième, la startup probe, laisse à une application lente le temps de démarrer.
**Vérifier** — Dans les manifestes : `livenessProbe` et `readinessProbe` existent, pointent vers des
routes différentes et ont des délais raisonnables.
**Corriger** — Liveness : une route minuscule qui ne vérifie que le processus (`/livez` répond 200).
Readiness : la route qui vérifie les dépendances indispensables (`/readyz`, comme OBS-09). Sans
Kubernetes, l'idée reste utile : n'envoyer du trafic qu'une fois l'application démarrée, et
l'arrêter proprement (finir les requêtes en cours à la réception de `SIGTERM`).
**Piège** — Vérifier la base dans la liveness : au moindre souci de la base, tous les conteneurs
échouent ensemble et redémarrent en boucle, et une lenteur devient une panne totale.
**Notions** — Liveness & Readiness Probes, Healthchecks, Kubernetes

---

### OBS-17 · Les objectifs de fiabilité sont chiffrés : SLI, SLO, error budget
`conseillé` · `échelle`

**Pourquoi** — Sans chiffre, « fiable » ne veut rien dire, et on hésite sans fin entre livrer et
consolider. Un **SLI** (indicateur de niveau de service) est une mesure : la part des requêtes
réussies en moins de 500 ms. Un **SLO** (objectif de niveau de service) est la cible : 99,9 % sur
30 jours. L'**error budget** (budget d'erreur) est la marge restante : 0,1 %, soit environ
43 minutes d'indisponibilité par mois. Tant qu'il reste du budget, on livre ; épuisé, on consolide.
Chaque « 9 » de plus divise par dix le temps de panne permis (99,99 % : environ 4 minutes par mois)
et coûte bien plus cher à tenir.
**Vérifier** — Un objectif de disponibilité est-il promis (utilisateurs, client, contrat) ? Est-il
mesuré ? Est-il compatible avec la disponibilité des services dont on dépend ?
**Corriger** — Petit projet : garder l'idée, sans formalisme. Un objectif réaliste (souvent entre
99 % et 99,9 %), mesuré par la sonde (OBS-02), jamais supérieur à ce que garantissent ensemble
l'hébergeur, la base et les API utilisées. Le formalisme complet (un SLI par parcours, budget suivi,
alertes sur la vitesse à laquelle il fond) se justifie avec des clients sous contrat ou une équipe
qui arbitre souvent entre nouveautés et fiabilité.
**Notions** — SLIs, SLOs, Error Budgets

---

### OBS-18 · Avec plusieurs services, une trace suit la requête de bout en bout (OpenTelemetry)
`conseillé` · `échelle`

**Pourquoi** — Quand une requête traverse le front, une API, une Edge Function, une file et un
service tiers, les journaux de chacun ne disent pas où le temps s'est perdu. Le **distributed
tracing** (traçage distribué) enregistre le parcours complet, découpé en étapes chronométrées
(spans) : « 1,8 s, dont 1,6 s dans l'appel à l'API de paiement ». **OpenTelemetry** est la norme
ouverte pour produire traces, métriques et journaux une seule fois et les envoyer vers l'outil de
son choix (Sentry, Grafana, Honeycomb, Axiom, Jaeger…), sans s'enfermer chez un fournisseur.
**Vérifier** — Combien de services une requête traverse-t-elle ? Sait-on dire où passe le temps
d'une requête lente ? L'en-tête standard `traceparent` passe-t-il d'un service à l'autre ?
**Corriger** — Un seul service et Sentry : ses traces de performance suffisent. Plusieurs services :
OpenTelemetry. Next.js : `instrumentation.ts` avec `registerOTel` de `@vercel/otel` ; Node :
`@opentelemetry/sdk-node` et ses instrumentations automatiques ; Python : `opentelemetry-instrument` ;
Cloudflare Workers : traçage automatique et export OpenTelemetry dans la config `observability`
(selon l'offre). Échantillonner (par exemple 10 % des traces) dès que le trafic grandit.
**Notions** — Distributed Tracing, OpenTelemetry, Observability, Identifiant de corrélation
