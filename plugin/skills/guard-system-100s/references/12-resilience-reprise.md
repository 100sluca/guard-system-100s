# 12 · Sauvegardes, reprise et tolérance aux pannes (REP)

Une panne n'est pas une question de « si » mais de « quand » : erreur de manipulation, migration
ratée, compte bloqué, fournisseur à terre, clé volée. La résilience, c'est pouvoir répondre sans
paniquer à deux questions : **que perd-on ?** et **combien de temps est-on arrêté ?** La règle
d'or : **une sauvegarde jamais restaurée n'est pas une sauvegarde**. Pour un petit projet,
l'essentiel tient en peu de choses : des sauvegardes testées, une copie hors du fournisseur, des
comptes qu'on ne peut pas perdre, et un site qui continue de marcher quand un service tiers tombe.
Redondance, multi-région et chaos engineering sont `échelle`.

---

### REP-01 · La base de données est sauvegardée automatiquement, et on sait ce que l'offre couvre vraiment
`bloquant` · `bdd`

**Pourquoi** — Un `delete` sans `where`, une migration ratée, un script trop zélé (y compris écrit
par une IA), un compte compromis : sans sauvegarde, c'est définitif. Beaucoup croient leur base
sauvegardée parce qu'elle est « dans le cloud » ; sur bien des offres gratuites, c'est faux.
**Vérifier** — Dans le tableau de bord du fournisseur : les sauvegardes sont-elles actives, sur
combien de jours, de quand date la dernière ? Quelle offre exacte a le projet ?
**Corriger** — Ce que proposent les plateformes (relevé en octobre 2026, à revérifier sur la page
du fournisseur) :
| Plateforme | Sauvegardes |
|---|---|
| Supabase, offre gratuite | pas de sauvegarde quotidienne accessible : Supabase recommande d'exporter soi-même (REP-02). Le projet est mis en pause après 7 jours de faible activité, restaurable pendant 90 jours |
| Supabase Pro, Team, Enterprise | quotidiennes, gardées 7, 14 ou jusqu'à 30 jours. En option, PITR (Point-in-Time Recovery : restaurer à un instant précis, avec au pire environ 2 minutes de perte) sur 7, 14 ou 28 jours, à partir de la taille de calcul Small |
| Cloudflare D1 | Time Travel : restauration à la minute près sur 30 jours (payant) ou 7 jours (gratuit), avec `wrangler d1 time-travel restore` |
| Cloudflare KV | aucune sauvegarde : n'y garder aucune donnée qui n'existe pas ailleurs |
| Google Sheets (Apps Script) | historique des versions, mais lié au fichier : s'il est supprimé ou le compte perdu, l'historique part avec. Une copie datée par déclencheur : `DriveApp.getFileById(id).makeCopy(nom, dossier)` |
| Shopify | exports CSV (produits, clients, commandes) et copie du thème : partiels, ce n'est pas une sauvegarde complète restaurable. Une application de sauvegarde si la boutique compte |
| Postgres hébergé soi-même | rien par défaut : `pg_dump` planifié, ou archivage continu (pgBackRest, WAL-G) |

**Piège** — Sur Supabase, activer PITR arrête les sauvegardes quotidiennes, qu'il remplace. Et les
fichiers du Storage ne font pas partie de la sauvegarde de la base (REP-04).
**Notions** — Backups, Point-in-Time Recovery (PITR)

---

### REP-02 · Une copie de la base existe hors du fournisseur, régulière et chiffrée (règle 3-2-1)
`important` · `bdd`

**Pourquoi** — La sauvegarde du fournisseur vit chez le fournisseur : si le compte est suspendu,
piraté ou le projet supprimé par erreur, elle disparaît avec. La règle 3-2-1 : **3** copies des
données, sur **2** supports différents, dont **1** hors site, ici hors du fournisseur.
**Vérifier** — Existe-t-il un export automatique stocké ailleurs ? Où, à quelle fréquence,
chiffré ? Le dernier fichier a-t-il une date récente et une taille plausible ?
**Corriger** — Un export planifié, par exemple chaque semaine dans GitHub Actions (connexion lue
dans les secrets du dépôt, SEC-07) :
```bash
supabase db dump --db-url "$DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$DB_URL" -f schema.sql
supabase db dump --db-url "$DB_URL" -f data.sql --use-copy --data-only
# ou : pg_dump "$DB_URL" -Fc -f base.dump   (pg_dump d'une version au moins égale au serveur)
# D1 : wrangler d1 export ma-base --remote --output=sauvegarde.sql
```
Les options exactes évoluent : la page « Backup and Restore using the CLI » de Supabase fait foi.
Ensuite, chiffrer (`age`, `gpg`) et envoyer chez un autre fournisseur (R2, S3, Backblaze B2) ou sur
un disque à soi. Garder plusieurs générations (REP-10).
**Piège** — Déposer le dump en clair comme artefact d'un workflow dans un dépôt public : n'importe
quel utilisateur de GitHub peut le télécharger. Une sauvegarde contient toutes les données
personnelles : même protection que la base, et mêmes durées de conservation (LEG).
**Notions** — Backups, Règle 3-2-1

---

### REP-03 · La restauration a été testée, chronométrée, et la procédure est écrite
`important` · `bdd`

**Pourquoi** — Une sauvegarde jamais restaurée n'est pas une sauvegarde. Le jour où on en a
besoin, on découvre un fichier vide, une option oubliée, un mot de passe introuvable, ou que la
restauration prend six heures.
**Vérifier** — Date du dernier test de restauration. La procédure est-elle écrite (REP-15) ?
Quelqu'un d'autre pourrait-il la suivre ?
**Corriger** — Au moins une fois, puis après chaque changement important et à intervalle régulier
(chaque trimestre, par exemple) : restaurer dans un projet neuf ou en local (`supabase start`),
**jamais sur la production**.
```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql --dbname "$URL_BASE_DE_TEST"
```
Vérifier ensuite le nombre de lignes des tables principales, la connexion d'un compte de test, le
démarrage de l'application. Noter la durée : c'est le RTO réel (REP-09). Ce qu'un dump Supabase ne
ramène pas, à refaire à la main : fichiers du Storage, Edge Functions, secrets, mots de passe des
rôles personnalisés, politiques et déclencheurs ajoutés aux schémas `auth` et `storage`, webhooks
et extensions à réactiver, clé racine de Vault si on l'utilise.
**Piège** — Une copie restaurée qui se réveille avec ses crons et ses webhooks peut appeler la
production ou envoyer de vrais e-mails. Désactiver les jobs planifiés et les envois sur la copie.
**Notions** — Test de restauration, Backups, RTO

---

### REP-04 · Les fichiers envoyés par les utilisateurs sont sauvegardés à part
`important` · `fichiers`

**Pourquoi** — Sur Supabase, la sauvegarde de la base ne contient que la description des fichiers
du Storage (nom, chemin), pas les fichiers eux-mêmes : restaurer une ancienne sauvegarde ne ramène
pas un fichier supprimé depuis. R2 et S3 n'ont pas non plus de sauvegarde automatique. Photos de
profil, factures, documents : perdus.
**Vérifier** — Où sont les fichiers (Supabase Storage, R2, S3, Google Drive, disque d'un serveur) ?
Une copie existe-t-elle ailleurs ? Une suppression par erreur est-elle récupérable ?
**Corriger** — Une copie planifiée chez un autre fournisseur avec `rclone`, qui parle le protocole
S3 (Supabase Storage via son accès S3, R2, B2) :
```bash
rclone copy supabase:factures b2:sauvegarde-factures   # copy : n'efface rien à l'arrivée
```
Sur R2, des règles de verrouillage (bucket locks) empêchent la suppression ou l'écrasement pendant
une durée choisie. Des fichiers sur le disque d'un serveur partent vers un stockage objet, de toute
façon nécessaire dès qu'il y a plusieurs instances (PERF-20).
**Piège** — `rclone sync` reproduit aussi les suppressions : une « sauvegarde » par `sync` efface
ce qui vient d'être effacé par erreur.
**Notions** — Backups, Règle 3-2-1

---

### REP-05 · Perdre l'accès à un compte fournisseur est prévu
`important` · `prod`

**Pourquoi** — Un compte bloqué est un sinistre aussi grave qu'une panne : mot de passe perdu,
téléphone de la double authentification cassé, compte Google suspendu par un robot, e-mail de
récupération sur un domaine expiré. Plus d'accès au DNS, à l'hébergement, à la base, et parfois
aucun support joignable.
**Vérifier** — La liste des comptes critiques : bureau d'enregistrement du domaine (registrar),
DNS (Cloudflare), hébergement (Vercel), base (Supabase), GitHub, compte Google (Apps Script, Drive,
Workspace), Stripe, Shopify, envoi d'e-mails, fournisseur d'IA. Pour chacun : double
authentification active ? Codes de secours rangés ? E-mail de récupération valide et **hors du
domaine du projet** ? Un second administrateur ?
**Corriger** — Double authentification par application ou par clé d'accès (passkey) plutôt que par
SMS seul. Codes de secours dans le gestionnaire de mots de passe, plus une copie hors ligne (papier
rangé). E-mail de récupération sur une autre boîte que celle du projet. Un second propriétaire là
où l'offre le permet (organisation Supabase, compte Cloudflare, organisation GitHub, Google
Workspace). La fonction d'accès d'urgence du gestionnaire de mots de passe pour une personne de
confiance, s'il en a une.
**Piège** — Tout miser sur un seul compte Google : sa suspension coupe d'un coup Gmail, Drive,
Apps Script et la connexion « Se connecter avec Google » à tous les autres services.
**Notions** — Point unique de défaillance, Disaster Recovery

---

### REP-06 · Le nom de domaine ne peut pas expirer par accident
`important` · `prod`

**Pourquoi** — Un domaine expiré coupe d'un coup le site, les e-mails et la connexion des
utilisateurs. Un domaine qui redevient libre peut être racheté par quelqu'un d'autre, qui reçoit
alors les e-mails envoyés au domaine, y compris les liens de réinitialisation de mot de passe.
**Vérifier** — Chez le registrar : renouvellement automatique actif, date d'expiration, carte
bancaire valide au-delà de cette date, adresse de contact lisible hors du domaine, verrou de
transfert actif, double authentification. En ligne de commande :
`whois mondomaine.fr | grep -iE "expir|status"`.
**Corriger** — Renouvellement automatique, carte à jour (avec un rappel avant son expiration),
renouvellement sur plusieurs années pour un domaine important, verrou de transfert (registrar
lock), contact sur une adresse externe au domaine.
**Notions** — Point unique de défaillance

---

### REP-07 · Si un service tiers tombe, le reste de l'application continue (dégradation gracieuse)
`important` · `prod`

**Pourquoi** — La dégradation gracieuse, c'est perdre une fonction plutôt que tout le site. Si
l'API d'IA est en panne, le bouton « Résumer » affiche « indisponible pour le moment » ; il ne fait
pas planter la page entière. En React, une erreur non rattrapée dans un composant démonte tout
l'arbre : écran blanc.
**Vérifier** — Lister les dépendances externes (IA, paiement, e-mail, cartes, statistiques,
Realtime, API tierces). Pour chacune : que voit l'utilisateur si elle ne répond plus ? Tester :
DevTools → Network → bloquer le domaine, ou une fausse clé d'API sur une préversion.
**Corriger** —
- Un délai d'attente et une gestion d'erreur autour de chaque appel externe (délais, réessais et
  circuit breaker : API).
- Les appels non essentiels en `Promise.allSettled` : l'échec de l'un n'emporte pas les autres.
  ```ts
  const [meteo, suggestions] = await Promise.allSettled([lireMeteo(), suggerer(utilisateur)])
  // la page s'affiche ; chaque bloc montre son contenu, ou « indisponible »
  ```
- Des frontières d'erreur par zone : `error.tsx` par segment dans Next.js, `<ErrorBoundary>`
  (`react-error-boundary`) autour des widgets.
- Un interrupteur pour couper une fonction sans redéployer : un réglage en base, ou Edge Config
  sur Vercel (`ia_active = false`).
- Les envois (e-mails, webhooks sortants) passent par une file qui réessaie plus tard (ASY-01,
  ASY-06).
- Un contenu de repli : le dernier résultat en cache, une version statique.
**Notions** — Dégradation gracieuse

---

### REP-08 · Toute la configuration peut être reconstruite à partir du dépôt
`important` · `prod`

**Pourquoi** — Le jour où il faut tout recréer (nouveau compte, nouveau projet, autre fournisseur),
ce qui a été cliqué dans un tableau de bord n'existe nulle part ailleurs : politiques RLS, URL de
redirection de l'authentification, réglages SMTP, webhooks Stripe, enregistrements DNS, crons,
variables d'environnement.
**Vérifier** — Pourrait-on recréer un environnement complet en un après-midi, avec seulement le
dépôt et le gestionnaire de mots de passe ? Regarder `supabase/migrations/` (les politiques RLS y
sont-elles ?), `supabase/config.toml`, `wrangler.toml`, `vercel.json`, `appsscript.json`,
`.env.example` (SEC-04), `RESSOURCES.md`.
**Corriger** — Schéma, politiques, fonctions SQL et crons en migrations versionnées (`supabase db
diff` récupère ce qui a été fait à la main : BDD). Configuration des plateformes en fichiers
(`wrangler.toml`, `vercel.json`, `supabase/config.toml`). Export de la zone DNS (Cloudflare : DNS →
Records → Export) gardé avec la documentation. Liste des webhooks et de leurs URL. Apps Script
synchronisé dans git avec `clasp`. L'infrastructure décrite en code (Terraform, OpenTofu, Pulumi)
quand il y a plusieurs environnements ou beaucoup de ressources (`échelle`).
**Notions** — Disaster Recovery

---

### REP-09 · RPO et RTO sont fixés, en mots simples
`conseillé` · `prod`

**Pourquoi** — Sans objectif, on sur-protège un blog et on sous-protège une boutique. Deux
questions suffisent. **RPO** (Recovery Point Objective) : combien de données peut-on perdre ?
**RTO** (Recovery Time Objective) : combien de temps peut-on rester hors ligne ?
**Vérifier** — Les deux réponses sont-elles écrites ? Les sauvegardes actuelles les tiennent-elles ?
Une sauvegarde quotidienne, c'est jusqu'à 24 heures de données perdues ; le dernier test de
restauration donne le temps réel (REP-03).
**Corriger** — Exemples d'objectifs :
| Projet | RPO | RTO | Ce que ça impose |
|---|---|---|---|
| Site vitrine, blog dans git | rien à perdre | un jour | redéployer depuis le dépôt |
| Outil interne, tableur partagé | un jour | un jour | sauvegarde quotidienne et copie hors fournisseur |
| SaaS avec clients payants | quelques minutes | une heure | PITR, restauration répétée, plan écrit (REP-15) |

Ces objectifs disent aussi quand **ne pas** en faire plus : un RPO d'un jour ne justifie pas PITR.
**Notions** — RPO, RTO, Disaster Recovery

---

### REP-10 · Les sauvegardes survivent à une erreur ou à une clé volée
`conseillé` · `prod`

**Pourquoi** — Si la clé qui écrit en production peut aussi effacer les sauvegardes, un attaquant
ou un script qui déraille supprime les deux. Une seule génération de sauvegarde, écrasée chaque
nuit, recopie la corruption de la veille avant qu'on la remarque.
**Vérifier** — Les sauvegardes sont-elles dans un autre compte ou un autre stockage, avec des
identifiants que l'application n'a pas ? Combien de générations ? Peut-on les supprimer avec les
clés de la production ?
**Corriger** — Une clé dédiée à la sauvegarde, qui écrit sans pouvoir supprimer quand le
fournisseur le permet (SEC-08), dans un compte distinct. Des sauvegardes immuables (impossibles à
modifier ou effacer pendant une durée fixée) : bucket locks sur R2, Object Lock sur S3 ou
Backblaze B2. Une rotation des générations, par exemple 7 quotidiennes, 4 hebdomadaires et 12
mensuelles, avec des durées compatibles avec le RGPD (LEG).
**Notions** — Backups, Règle 3-2-1

---

### REP-11 · Le serveur s'arrête proprement (graceful shutdown)
`conseillé` · `api`

**Pourquoi** — À chaque déploiement ou redémarrage, la plateforme envoie le signal `SIGTERM`
(« arrête-toi »), attend un délai de grâce (10 secondes par défaut avec `docker stop`), puis tue le
processus (`SIGKILL`). Sans arrêt propre, les requêtes en cours sont coupées : un paiement traité
à moitié, une tâche abandonnée en plein milieu. Cela concerne les serveurs qui tournent en continu
(Express, Hono ou Fastify sur Node ; FastAPI ou Flask avec uvicorn ou gunicorn ; Docker, VPS,
Railway, Render, Fly.io) ; en serverless, la plateforme s'en charge.
**Vérifier** — `process.on('SIGTERM'` dans le serveur Node ; `lifespan` de FastAPI qui ferme les
connexions ; ligne `CMD` du Dockerfile ; ce que deviennent les tâches en cours d'un worker.
**Corriger** —
```js
const serveur = app.listen(PORT)
process.on('SIGTERM', () => {
  serveur.close(async () => { await pool.end(); process.exit(0) })  // refuse le neuf, finit l'en-cours
  setTimeout(() => process.exit(1), 8_000).unref()                  // filet avant le SIGKILL
})
```
Python : uvicorn termine les requêtes en cours quand il reçoit `SIGTERM`
(`--timeout-graceful-shutdown` pour borner) ; fermer les pools dans le `lifespan` de FastAPI. Un
worker de file cesse de prendre des messages et finit le sien ; sinon le message reviendra
(ASY-03). Derrière un répartiteur de charge, le contrôle de santé répond `503` dès le début de
l'arrêt pour ne plus recevoir de trafic (`échelle`).
**Piège** — `CMD npm start` dans un Dockerfile ajoute un intermédiaire qui ne transmet pas toujours
le signal, et Node lancé comme premier processus du conteneur (PID 1) ignore `SIGTERM` s'il n'a pas
de gestionnaire : il est tué brutalement à la fin du délai. Écrire `CMD ["node", "server.js"]` et
lancer avec `docker run --init` (ou `tini`).
**Notions** — Graceful shutdown

---

### REP-12 · Les points uniques de défaillance sont connus, et les plus dangereux ont un plan B
`conseillé` · `prod`

**Pourquoi** — Un point unique de défaillance (SPOF, single point of failure) est un élément dont
la panne arrête tout. Dans un petit projet, les plus dangereux ne sont pas techniques : une seule
personne connaît les accès, une seule carte bancaire paie tous les services (expirée, ce sont des
comptes suspendus), un seul compte Google, un seul ordinateur qui garde les clés.
**Vérifier** — L'exercice « si X disparaît demain » pour : toi, ta carte, ton téléphone (double
authentification), ton compte Google, ton hébergeur, ta base, ton DNS, ton envoi d'e-mails, ton
dépôt GitHub. Pour chacun : que se passe-t-il, et combien de temps pour repartir ?
**Corriger** — Ne pas tout doubler : pour chaque point, décider d'accepter le risque ou de prévoir
un plan B. Les plans B simples : procédures écrites et accès d'urgence (REP-05, REP-15), une
seconde carte sur les services critiques, les clés dans un gestionnaire synchronisé plutôt que sur
un seul PC, une copie du dépôt ailleurs (`git push --mirror` vers un second hébergeur), les exports
hors fournisseur (REP-02, REP-13). La redondance technique (deux serveurs, deux régions) vient
après, en `échelle` (REP-16).
**Notions** — Point unique de défaillance, Redondance

---

### REP-13 · Un plan de sortie existe pour chaque fournisseur critique
`conseillé` · `prod`

**Pourquoi** — Hausse de prix, nouvelles conditions, fermeture d'un service, compte suspendu : si
l'application dépend d'un service propriétaire sans export, partir prend des mois. C'est
l'enfermement chez un fournisseur (vendor lock-in). Ce n'est pas une raison pour tout héberger
soi-même, mais pour savoir ce qui serait difficile à déménager.
**Vérifier** — Pour chaque fournisseur : les données s'exportent-elles dans un format standard ?
Qu'est-ce qui serait à réécrire ? Les comptes utilisateurs et leurs méthodes de connexion sont-ils
récupérables ?
**Corriger** — À choix équivalent, préférer les briques standard : Postgres (Supabase, Neon :
`pg_dump` est portable), un stockage compatible S3 (R2, Supabase Storage), les API Web standard
(Hono tourne sur Workers, Node, Deno, Bun et Vercel). Isoler les appels aux services propriétaires
(KV, Durable Objects, Firestore) derrière un petit module à soi. Les exports réguliers (REP-02,
REP-04) sont aussi le plan de sortie. Une ligne par fournisseur dans le plan de reprise : « pour
partir : … ».
**Piège** — Refuser un service géré « pour ne pas être enfermé », puis passer ses soirées à
administrer un serveur. L'enfermement est un risque à mesurer, pas à fuir à tout prix.
**Notions** — Vendor lock-in

---

### REP-14 · Une page de statut informe les utilisateurs, et on est prévenu des pannes de ses fournisseurs
`conseillé` · `prod`

**Pourquoi** — Pendant une panne, les utilisateurs se demandent si le problème vient d'eux,
écrivent au support, ou partent. Une page de statut (status page) dit ce qui se passe et quand ça
revient. Et beaucoup de pannes viennent d'un fournisseur : le savoir en deux minutes évite une
heure à chercher un bug qui n'existe pas.
**Vérifier** — Une page de statut existe-t-elle, hébergée ailleurs que l'application ? Est-on
abonné aux pages de statut de Supabase, Vercel, Cloudflare, Stripe, du fournisseur d'IA ?
**Corriger** — Better Stack, Instatus, ou en open source OpenStatus et Upptime (sur GitHub Pages),
alimentés par la surveillance de disponibilité (OBS). Un abonnement par e-mail ou RSS aux statuts
des fournisseurs. Pour un petit projet, un message épinglé sur un réseau social ou un bandeau sur
le site suffisent ; une vraie page de statut devient utile dès qu'il y a des clients qui paient.
**Piège** — Une page de statut sur la même infrastructure que le site (même hébergeur, ou même
domaine quand c'est le DNS qui tombe) : elle tombe avec lui.
**Notions** — Page de statut

---

### REP-15 · Un plan de reprise écrit dit quoi faire quand tout tombe
`conseillé` · `prod`

**Pourquoi** — Le plan de reprise après sinistre (disaster recovery) se lit sous stress, parfois
par quelqu'un d'autre que son auteur. Ce qui n'est pas écrit est oublié au pire moment.
**Vérifier** — Ce plan existe-t-il, rangé **hors** de l'infrastructure qu'il sert à reconstruire
(gestionnaire de mots de passe, copie papier, dépôt sur un autre compte) ? A-t-il servi lors du
dernier test de restauration ?
**Corriger** — Une page courte, avec un runbook (une procédure pas à pas) par scénario :
```
Base corrompue ou effacée → restaurer (REP-03), vérifier, prévenir les utilisateurs
Compte bloqué             → codes de secours, support, second propriétaire (REP-05)
Fournisseur en panne      → page de statut (REP-14), mode dégradé (REP-07), attendre ou basculer
Clé volée                 → SEC-06
Domaine expiré            → registrar, renouvellement, attendre la propagation DNS (REP-06)
```
Pour chaque scénario : où sont les sauvegardes, quels accès il faut, les RPO et RTO visés (REP-09),
la date du dernier essai. La gestion de l'incident lui-même (communication, journal, post-mortem) :
OBS.
**Notions** — Disaster Recovery, Runbook

---

### REP-16 · Redondance et failover pour ce qui ne doit jamais s'arrêter
`conseillé` · `échelle`

**Pourquoi** — La redondance, c'est avoir deux exemplaires de ce qui est critique ; le failover
(basculement), c'est passer automatiquement sur l'exemplaire de secours quand le principal tombe.
Utile quand une heure d'arrêt coûte plus cher que la complexité ajoutée.
**Vérifier** — Combien coûte vraiment une heure d'arrêt (ventes perdues, engagements
contractuels) ? L'option haute disponibilité de la base gérée est-elle connue ? Le basculement
a-t-il déjà été essayé ?
**Corriger** — Dans l'ordre : s'appuyer sur ce que les plateformes gérées répartissent déjà (CDN,
stockage objet) ; une base en haute disponibilité (une copie prête à prendre le relais, souvent
dans une autre zone) via l'offre du fournisseur ; un répartiteur de charge avec contrôles de santé
(par exemple Cloudflare Load Balancing) devant plusieurs serveurs ; deux fournisseurs d'e-mail
transactionnel si les e-mails sont vitaux. Un basculement jamais essayé ne fonctionne pas le jour
où on en a besoin.
**Piège** — Doubler l'infrastructure d'un projet personnel, d'un outil interne ou d'un SaaS qui
démarre : des sauvegardes testées et un RTO de quelques heures suffisent largement.
**Notions** — Redondance, Failover

---

### REP-17 · Multi-région : seulement quand la panne d'une région entière ne doit rien arrêter
`conseillé` · `échelle`

**Pourquoi** — Un déploiement multi-région (multi-region deployment) fait tourner l'application
dans plusieurs régions du monde, pour survivre à la panne d'une région entière ou servir des
utilisateurs très éloignés. Le prix : la base doit être répliquée entre régions, les écritures
deviennent plus lentes ou seulement cohérentes à terme (ASY-12, ASY-20), et tout devient plus dur
à déboguer.
**Vérifier** — Une panne régionale a-t-elle déjà coûté cher ? Les utilisateurs sont-ils vraiment
sur plusieurs continents ? La fonction et la base sont-elles déjà dans la même région (PERF-19) ?
**Corriger** — D'abord une seule région, proche des utilisateurs, avec le calcul à côté de la base
(PERF-19). Ensuite les morceaux faciles : contenu statique sur CDN, lectures depuis des répliques
régionales. L'écriture dans plusieurs régions (bases distribuées, réplication active-active)
seulement avec un besoin chiffré.
**Notions** — Multi-Region Deployment, Redondance

---

### REP-18 · Chaos engineering : provoquer des pannes exprès, une fois le reste solide
`conseillé` · `échelle`

**Pourquoi** — Le chaos engineering consiste à provoquer volontairement des pannes (couper un
service, ralentir le réseau, tuer une instance) pour vérifier que le système résiste comme prévu,
plutôt que de le découvrir pendant une vraie panne. Netflix l'a popularisé avec Chaos Monkey.
**Vérifier** — Les mécanismes de résilience (dégradation gracieuse, réessais, restauration,
basculement) ont-ils été vus fonctionner au moins une fois ?
**Corriger** — Version petit projet, sans outil : un exercice de panne de temps en temps, sur une
préversion. Bloquer le domaine de l'IA dans DevTools (REP-07), arrêter le worker au milieu d'une
tâche (ASY-03, ASY-13), restaurer la sauvegarde (REP-03), retirer une variable d'environnement.
Version grande échelle (AWS Fault Injection Service, Gremlin, Chaos Mesh sur Kubernetes), en
production, seulement avec une observabilité mûre (OBS) et quelqu'un pour réagir.
**Notions** — Chaos Engineering
