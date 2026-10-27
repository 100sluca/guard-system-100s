# 06 · Base de données et intégrité (BDD)

Le code change tous les jours ; les données restent, et une donnée fausse se propage partout
(factures, stocks, statistiques). La base est le seul endroit qui voit **toutes** les écritures,
y compris celles qui arrivent au même instant : c'est donc là que vivent les règles qui ne doivent
jamais être violées. Deux idées clés : **la base se protège elle-même** (Row Level Security,
contraintes, transactions) et **elle reste rapide si on lui parle bien** (index, pas de requêtes
en rafale, connexions mutualisées). Sauvegardes : REP. Injections SQL : INJ. Qui voit quoi : IAM.

---

### BDD-01 · Toute table exposée par l'API Supabase a la Row Level Security activée
`bloquant` · `bdd` · `auto`

**Pourquoi** — Avec Supabase, le navigateur parle directement à la base, avec une clé publique
(SEC-09). La Row Level Security (RLS, sécurité au niveau des lignes) est le filtre que Postgres
applique à chaque requête : « tu ne vois que tes lignes ». Une table du schéma `public` sans RLS
est lisible et modifiable par **quiconque** a la clé publique, c'est-à-dire tout visiteur du site.
C'est la fuite de données la plus fréquente des projets Supabase. Une table créée en SQL
(migration, éditeur SQL) n'a pas la RLS tant qu'on ne l'active pas.
**Vérifier** — `node audit.mjs` signale les `create table` des migrations sans `enable row level
security`. Tableau de bord : Advisors → Security Advisor (alerte `rls_disabled_in_public`). En SQL :
```sql
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
```
**Corriger** — Dans la même migration que la table :
```sql
alter table public.notes enable row level security;
create policy "lire ses notes" on public.notes for select to authenticated
  using ((select auth.uid()) = user_id);
```
RLS activée sans policy = plus rien ne passe par l'API : c'est sûr, pas encore utile. Une policy
par opération (`select`, `insert`, `update`, `delete`) ; pour `insert` et `update`, `with check`
empêche d'écrire une ligne au nom d'un autre. La logique des droits (rôles, équipes, partage) : IAM.
**Piège** — Une policy `using (true)` ajoutée « pour tester », qui part en prod : la RLS est
active, l'alerte disparaît, et la table est ouverte à tous.
**Notions** — Row Level Security

---

### BDD-02 · La clé secrète de Supabase reste côté serveur, et seulement là où il le faut
`bloquant` · `bdd`

**Pourquoi** — La clé secrète (`sb_secret_…`, ou l'ancienne clé `service_role`) contourne toute la
RLS : avec elle, la base n'a plus de filtre. Dans le navigateur, c'est une fuite totale (SEC-02).
Côté serveur, l'utiliser par facilité pour toutes les requêtes revient à désactiver la RLS : un
seul bogue dans ton code, et un utilisateur lit les données d'un autre.
**Vérifier** — Où la clé secrète est-elle utilisée (`SUPABASE_SERVICE_ROLE_KEY`, `sb_secret_`,
`createClient(url, cleSecrete)`) ? Jamais dans une variable `NEXT_PUBLIC_` ou `VITE_`. Côté
serveur, chaque usage a-t-il une raison (tâche d'administration, webhook, cron) ?
**Corriger** — Une route serveur ou une Edge Function qui agit **pour un utilisateur** crée son
client avec la clé publique et le jeton de cet utilisateur : la RLS s'applique.
```ts
const supabase = createClient(SUPABASE_URL, CLE_PUBLIQUE, {
  global: { headers: { Authorization: req.headers.get('Authorization')! } } })
```
Le client « admin » vit dans un module serveur à part (`import 'server-only'` en Next.js), réservé
aux tâches sans utilisateur.
**Notions** — Row Level Security

---

### BDD-03 · Les vues respectent la RLS, et les fonctions `SECURITY DEFINER` sont verrouillées
`bloquant` · `bdd`

**Pourquoi** — Une vue (une requête enregistrée qu'on interroge comme une table) créée par le rôle
`postgres` s'exécute par défaut avec **ses** droits : elle contourne la RLS des tables qu'elle lit.
Une fonction `SECURITY DEFINER` fait pareil, et si elle est dans un schéma exposé, n'importe quel
visiteur peut l'appeler par `supabase.rpc()`. Sans `search_path` fixé, un appelant peut même lui
faire utiliser une table ou une fonction à lui à la place de la vraie.
**Vérifier** — Security Advisor : alertes `security_definer_view` et
`function_search_path_mutable`. Dans les migrations : `create view` sans `security_invoker`,
`security definer` sans `set search_path`.
**Corriger** —
```sql
create view public.mes_commandes with (security_invoker = true) as select ...;  -- Postgres 15+
create function prive.equipes_de(uid uuid) returns setof uuid language sql stable
  security definer set search_path = '' as $$ select equipe_id from public.membres where user_id = uid $$;
revoke execute on function prive.equipes_de(uuid) from public, anon;
grant usage on schema prive to authenticated;
grant execute on function prive.equipes_de(uuid) to authenticated;
```
Préférer `security invoker` (le défaut des fonctions) ; garder `security definer` pour les rares
cas qui en ont besoin, dans un schéma **non exposé** par l'API, avec des noms préfixés par leur
schéma (`public.membres`) et l'exécution accordée seulement aux rôles qui en ont besoin.
**Notions** — Row Level Security

---

### BDD-04 · Les Advisors de Supabase sont lancés, et leurs alertes traitées
`important` · `bdd`

**Pourquoi** — Supabase fournit deux contrôles automatiques et gratuits qui repèrent une bonne
partie des erreurs de ce fichier. Le Security Advisor : RLS absente, vues qui la contournent,
fonctions mal protégées, réglages d'Auth risqués. Le Performance Advisor : clés étrangères sans
index, index en double ou inutilisés, policies RLS lentes.
**Vérifier** — Tableau de bord → Advisors → Security Advisor et Performance Advisor ; ou
`supabase db advisors` avec une CLI récente ; ou l'outil `get_advisors` du serveur MCP Supabase.
Niveaux : `ERROR` à corriger tout de suite, `WARN` avant la prod, `INFO` à juger au cas par cas.
**Corriger** — Traiter chaque alerte **par une migration** (BDD-10), pas d'un clic dans le
tableau de bord. Relancer les Advisors après chaque changement de schéma, et avant chaque mise en
ligne.
**Notions** — Row Level Security, Database Indexing

---

### BDD-05 · Les règles qui ne doivent jamais être violées sont des contraintes en base
`important` · `bdd`

**Pourquoi** — Vérifier « cet e-mail est libre » dans le code ne suffit pas : deux requêtes
simultanées vérifient chacune que personne n'a l'e-mail, puis insèrent toutes les deux. Seule la
base voit les deux écritures et peut refuser la seconde. Les contraintes protègent aussi contre un
script, une migration, une modification à la main ou un autre service qui ne passe pas par ton
code.
**Vérifier** — Colonnes obligatoires sans `not null` ; unicités métier (e-mail, slug, une commande
par panier, un vote par personne) sans `unique` ; colonnes `xxx_id` sans `references` ; valeurs
bornées (prix positif, statut parmi une liste, note de 1 à 5) sans `check`.
**Corriger** —
```sql
create table commandes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete restrict,
  panier_id uuid not null unique,                                  -- une seule commande par panier
  total_centimes integer not null check (total_centimes >= 0),
  statut text not null check (statut in ('en_attente', 'payee', 'annulee'))
);
```
Dans le code, attraper la violation (code Postgres `23505` pour l'unicité) et répondre proprement
(`409`). Choisir `on delete` en conscience : `cascade` supprime les lignes liées, `restrict`
bloque, `set null` détache.
**Piège** — `on delete cascade` partout : supprimer un client efface alors ses factures, que la loi
oblige souvent à conserver (LEG).
**Notions** — Contraintes, Race Conditions

---

### BDD-06 · Les opérations en plusieurs étapes se font dans une transaction
`important` · `bdd`

**Pourquoi** — Débiter le stock, créer la commande, enregistrer le paiement : si le serveur plante
entre deux étapes, il reste une moitié d'opération (stock débité, aucune commande). Une
transaction regroupe les étapes en un bloc « tout ou rien ». Les bases relationnelles garantissent
ACID : Atomicité (tout ou rien), Cohérence (les contraintes restent vraies), Isolation (les
opérations simultanées ne se mélangent pas), Durabilité (ce qui est validé survit à une panne).
**Vérifier** — Suites d'écritures liées faites en appels séparés, surtout avec `supabase-js` :
chaque `.insert()` ou `.update()` est une requête HTTP indépendante, **sans transaction possible
entre elles**.
**Corriger** — Supabase : regrouper les étapes dans une fonction SQL, appelée en une fois (une
fonction s'exécute dans une seule transaction ; une exception annule tout) :
```sql
create function public.passer_commande(p_produit uuid) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  update produits set stock = stock - 1 where id = p_produit and stock > 0;
  if not found then raise exception 'rupture de stock'; end if;
  insert into commandes (produit_id) values (p_produit) returning id into v_id;
  return v_id;
end $$;
```
puis `supabase.rpc('passer_commande', { p_produit })`. Ailleurs : `db.transaction(async (tx) =>
…)` (Drizzle), `prisma.$transaction(…)`, `with session.begin():` (SQLAlchemy), `env.DB.batch([…])`
(Cloudflare D1 : le lot est annulé en entier si une requête échoue). Une transaction reste
**courte** : jamais d'appel à une API externe au milieu (paiement, e-mail, IA), elle garderait ses
verrous pendant des secondes (BDD-18).
**Notions** — Transactions, ACID

---

### BDD-07 · Les accès simultanés ne cassent pas les données (race conditions)
`important` · `bdd`

**Pourquoi** — Une race condition (situation de compétition) arrive quand deux opérations lisent
la même donnée, puis écrivent chacune en se croyant seules. Les classiques : un double clic crée
deux commandes ; deux clients achètent le dernier article et le stock passe à -1 ; deux onglets
ajoutent 10 € au même solde et un seul ajout reste. Le schéma fautif est toujours le même : lire,
décider dans le code, écrire.
**Vérifier** — Séquences `select` puis `update` sur la même ligne (lire le stock, tester
`if (stock > 0)`, écrire `stock - 1`), compteurs incrémentés dans le code, « vérifier puis créer ».
**Corriger** — Du plus simple au plus lourd :
| Cas | Remède |
|---|---|
| Doublon (double clic, double webhook) | Contrainte `unique` (BDD-05) et clé d'idempotence (API-09) |
| Compteur, stock, solde, quota | Une seule requête atomique : `update produits set stock = stock - 1 where id = $1 and stock > 0`. 0 ligne modifiée = rupture |
| Document modifié par plusieurs personnes | Verrou optimiste : colonne `version`, `update … set …, version = version + 1 where id = $1 and version = $2`. 0 ligne = quelqu'un est passé avant, on recharge |
| Ressource très disputée, logique complexe | Verrou pessimiste : `select … for update` dans une transaction ; les autres attendent leur tour |

Le verrou optimiste parie que les conflits sont rares (personne n'attend, on détecte après) ; le
pessimiste verrouille d'avance (sûr, mais fait patienter). Les niveaux d'isolation règlent ce
qu'une transaction voit des autres : Postgres travaille par défaut en `read committed`, qui
n'empêche pas ces cas tout seul ; `serializable` les empêche mais fait échouer certaines
transactions (erreur `40001`) qu'il faut alors retenter. `supabase-js` ne sait pas écrire
`stock = stock - 1` : passer par une fonction SQL (BDD-06).
**Piège** — Tester à la main, un clic à la fois : la race condition n'apparaît jamais. La tester
avec deux requêtes lancées ensemble (`await Promise.all([acheter(), acheter()])`).
**Notions** — Race Conditions, Optimistic Locking, Pessimistic Locking, Niveaux d'isolation

---

### BDD-08 · L'argent est en entiers ou en `numeric`, jamais en flottant, et les dates en `timestamptz`
`important` · `bdd`

**Pourquoi** — Les nombres à virgule flottante (`float`, `real`, `double precision`, et le
`number` de JavaScript) ne représentent pas 0,1 exactement : `0.1 + 0.2` donne
`0.30000000000000004`. Sur des milliers d'opérations, les centimes dérivent et les totaux ne
tombent plus juste. Côté dates, un `timestamp` sans fuseau ne dit pas s'il s'agit de l'heure de
Paris ou de l'heure UTC : décalages d'une ou deux heures, rappels envoyés à la mauvaise heure au
changement d'heure.
**Vérifier** — Montants, prix, soldes en `float`, `real`, `double precision` ou `money` ; calculs
d'euros décimaux en JS (`prix * 1.2`). Dates en `timestamp` sans `tz`, en `text`, ou en `date`
quand l'heure compte.
**Corriger** — Montants en **centimes entiers** (`integer` ou `bigint`), comme Stripe
(`amount: 1999` = 19,99 €), ou en `numeric(12,2)` si des fractions de centime existent (taux,
conversions). Dates en `timestamptz` (Postgres stocke l'instant en UTC et le convertit à
l'affichage), échangées en ISO 8601 (`2026-10-24T08:30:00Z`), mises dans le fuseau de
l'utilisateur seulement à l'affichage. Arrondir une seule fois, au même endroit, avec une règle
écrite.
**Piège** — Le pilote `pg` de Node renvoie les `numeric` et les `bigint` sous forme de **chaînes**
(pour ne rien perdre en précision) : `"19.99" + 1` donne `"19.991"`. Convertir explicitement.
**Notions** — Virgule flottante, Contraintes

---

### BDD-09 · En serverless, la base est jointe à travers un pool de connexions
`important` · `bdd`

**Pourquoi** — Chaque connexion à Postgres occupe de la mémoire sur le serveur, qui n'en accepte
qu'un nombre limité (100 par défaut dans Postgres ; chez les hébergeurs, selon la taille de
l'instance). En serverless, chaque instance ouvre les siennes et un pic de trafic crée des
centaines d'instances : la base refuse (« too many connections ») et tout le site tombe. Le
connection pooling (mutualisation des connexions) place un intermédiaire qui garde quelques vraies
connexions ouvertes et les prête aux requêtes à tour de rôle.
**Vérifier** — Concerne les accès SQL directs (Prisma, Drizzle, `postgres`, `pg`, psycopg,
SQLAlchemy), pas `supabase-js`, qui passe par l'API HTTP de Supabase. Regarder la chaîne de
connexion (hôte, port) et l'endroit où le client est créé.
**Corriger** —
| Situation | Ce qu'il faut |
|---|---|
| Supabase depuis du serverless (Vercel, Netlify, Edge Functions) | Supavisor en mode transaction : hôte `…pooler.supabase.com`, port **6543** ; client créé une fois au niveau du module, pool de 1 connexion par instance |
| Cloudflare Workers | Hyperdrive (pool et cache gérés par Cloudflare), branché sur la connexion **directe** de la base, pas sur un pooler |
| Serveur qui dure (VPS, conteneur) | Le pool du pilote, ou Supavisor en mode session (port 5432) |
| Migrations, `pg_dump` | Connexion directe ou mode session |

En mode transaction, une connexion change de main entre deux transactions : les requêtes
préparées (prepared statements, compilées une fois puis réutilisées sur la même connexion) ne
marchent pas. Les désactiver : `prepare: false` (postgres.js, Drizzle), `pgbouncer=true` dans
l'URL (Prisma), `statement_cache_size=0` (asyncpg).
**Piège** — Créer le client dans le gestionnaire de requête (`export async function GET() { const
sql = postgres(URL) … }`) : une connexion neuve à chaque appel, jamais refermée.
**Notions** — Connection Pooling

---

### BDD-10 · Le schéma évolue par des migrations versionnées dans le dépôt
`important` · `bdd`

**Pourquoi** — Une migration est un fichier qui décrit un changement de schéma (« ajouter la
colonne `telephone` »). Rangées dans le dépôt, datées et appliquées dans l'ordre, elles recréent la
base à l'identique (nouvel environnement, tests, reprise après incident : REP) et disent qui a
changé quoi. Une modification faite à la main dans le tableau de bord de prod n'existe nulle part
ailleurs : la base de dev diverge, la migration suivante échoue, et plus personne ne sait quel est
le vrai schéma.
**Vérifier** — Un dossier de migrations est commité (`supabase/migrations/`, `prisma/migrations/`,
`drizzle/`, `migrations/` d'Alembic ou de D1). `supabase db diff --linked` ne montre rien : sinon,
quelqu'un a modifié la prod à la main.
**Corriger** —
| Outil | Créer | Appliquer |
|---|---|---|
| Supabase CLI | `supabase migration new ajout_telephone` | `supabase db push` (essayé avant en local avec `supabase db reset`) |
| Prisma | `prisma migrate dev --name ajout_telephone` | `prisma migrate deploy` |
| Drizzle | `drizzle-kit generate` | `drizzle-kit migrate` |
| Cloudflare D1 | `wrangler d1 migrations create BASE ajout_telephone` | `wrangler d1 migrations apply BASE --remote` |
| Alembic (Python) | `alembic revision --autogenerate -m "ajout telephone"` | `alembic upgrade head` |

Les migrations s'appliquent par la CI ou par une commande documentée, jamais en collant du SQL dans
la console de prod. Une migration déjà appliquée ne se modifie plus : on en ajoute une nouvelle.
**Piège** — Créer « vite fait » un index dans le tableau de bord pendant un incident, puis
l'oublier : il disparaît au prochain environnement recréé. Si c'est arrivé :
`supabase db diff -f nom_du_changement` capture l'écart dans une migration.
**Notions** — Database Migrations, Schema Versioning

---

### BDD-11 · Les colonnes filtrées, triées, jointes et les clés étrangères ont un index, sans excès
`important` · `bdd`

**Pourquoi** — Un index est comme l'index d'un livre : au lieu de lire toutes les pages (« Seq
Scan », parcours complet de la table), la base saute directement aux bonnes lignes. Sans index,
une requête instantanée à 1 000 lignes devient lente à un million. Mais chaque index ralentit les
écritures (il est mis à jour à chaque `insert` et `update`) et prend de la place : on indexe ce
qui sert, pas tout.
**Vérifier** — Pour les requêtes fréquentes : colonnes du `where`, de l'`order by`, des jointures.
Postgres indexe tout seul les clés primaires et les `unique`, **pas** les clés étrangères (alerte
`unindexed_foreign_keys` du Performance Advisor). Index inutilisés (`unused_index`) ou en double.
**Corriger** —
```sql
create index on commandes (client_id);                          -- clé étrangère
create index on commandes (client_id, cree_le desc);            -- « les commandes d'un client, récentes d'abord »
create index on taches (assigne_a) where termine = false;       -- index partiel : seulement les lignes utiles
```
L'ordre des colonnes d'un index composé compte : `(client_id, cree_le)` sert pour `client_id`
seul, pas pour `cree_le` seul. Sur une grosse table en prod, `create index concurrently` évite de
bloquer les écritures ; il ne peut pas tourner dans une transaction, donc selon l'outil de
migration il faut le mettre seul dans son fichier, voire le lancer à part.
**Notions** — Database Indexing, Query Optimization

---

### BDD-12 · Aucune requête dans une boucle (N+1)
`important` · `bdd`

**Pourquoi** — Le problème N+1 : une requête pour la liste (1), puis une requête par élément (N).
50 articles et leurs auteurs = 51 allers-retours vers la base au lieu d'un seul. Invisible en local
(la base est sur la même machine), lent en prod où chaque aller-retour coûte, surtout depuis une
fonction serverless éloignée de la base.
**Vérifier** — `await` d'une requête dans un `for`, un `map` ou un `forEach` ; ORM qui charge les
relations à la demande (« lazy loading ») ; nombre de requêtes par page dans les journaux ou le
rapport « Query Performance » de Supabase.
**Corriger** — Tout charger en une fois :
```ts
// supabase-js : la jointure se fait dans la base, en une seule requête
const { data } = await supabase.from('articles').select('id, titre, auteur:profils(nom)').limit(20)
```
Prisma : `include` ; Drizzle : `with` ; SQL : une jointure, ou `where id = any($1)` ; SQLAlchemy :
`selectinload()` ; Django : `select_related()` / `prefetch_related()`. Pour des appels d'API en
boucle, chercher l'endpoint « par lot » (batch) du fournisseur.
**Piège** — Les `select` imbriqués de Supabase règlent le N+1 mais peuvent ramener trop : sur une
relation « un à plusieurs », l'imbrication renvoie **tous** les enfants. Les borner :
`.limit(5, { referencedTable: 'commentaires' })`.
**Notions** — N+1 Queries, Query Optimization

---

### BDD-13 · Les policies RLS restent rapides
`conseillé` · `bdd`

**Pourquoi** — Une policy RLS est une condition ajoutée à **chaque** requête et évaluée,
potentiellement, pour chaque ligne. Mal écrite, elle transforme une requête de quelques
millisecondes en requête de plusieurs secondes sur une grande table : fonction recalculée ligne
par ligne, colonne non indexée, sous-requête sur une autre table pour chaque ligne.
**Vérifier** — Performance Advisor : `auth_rls_initplan` (fonction réévaluée à chaque ligne),
`multiple_permissive_policies`. Policies sans `to authenticated`. Colonnes utilisées par les
policies (`user_id`, `equipe_id`) sans index.
**Corriger** —
```sql
create index on notes (user_id);
create policy "ses notes" on notes for select to authenticated
  using ((select auth.uid()) = user_id);   -- le (select …) calcule auth.uid() une fois par requête
```
Pour des droits par équipe, une fonction `security definer` dans un schéma non exposé (BDD-03) qui
renvoie les équipes de l'utilisateur, appelée elle aussi dans un `(select …)`, plutôt qu'une
jointure dans chaque policy. Ajouter aussi le filtre dans la requête (`.eq('user_id', id)`) : la
base construit alors un meilleur plan et utilise l'index.
**Notions** — Row Level Security, Database Indexing, Query Optimization

---

### BDD-14 · Les identifiants exposés ne se devinent pas
`conseillé` · `bdd`

**Pourquoi** — Un identifiant qui se suit dans une URL (`/facture/1042`) invite à essayer `1041`,
`1043`… : c'est l'énumération. Au moindre trou dans le contrôle d'accès, tout s'aspire en une
boucle ; même sans trou, il révèle ton volume (« 1 042 factures depuis le lancement »). Un UUID
(identifiant aléatoire de 128 bits) ne se devine pas.
**Vérifier** — Clés primaires `serial`, `bigserial` ou `identity` qui apparaissent dans des URL,
des réponses d'API, des liens de partage ou des noms de fichiers.
**Corriger** — `id uuid primary key default gen_random_uuid()` pour ce qui sort de la base. Les
UUID v7, ordonnés dans le temps (`uuidv7()` depuis Postgres 18, ou générés par l'application),
gardent les insertions groupées dans l'index, plus efficaces que les v4 sur les grosses tables ;
ils révèlent en revanche leur date de création. Un `bigint` interne reste possible s'il ne sort
jamais.
**Piège** — Croire que l'UUID protège : ce n'est pas un contrôle d'accès. Un lien de partage
utilisable sans connexion doit en plus être un jeton long, aléatoire, révocable et qui expire (IAM).
**Notions** — UUID

---

### BDD-15 · Les requêtes lentes sont lues avec EXPLAIN ANALYZE avant d'être « optimisées »
`conseillé` · `bdd`

**Pourquoi** — Deviner pourquoi une requête est lente fait ajouter des index au hasard. `EXPLAIN`
montre le plan que la base compte suivre ; `EXPLAIN ANALYZE` exécute la requête et donne le temps
réel de chaque étape et le nombre de lignes vraiment lues. La Query Optimization (optimisation des
requêtes) commence toujours par cette lecture.
**Vérifier** — Trouver les requêtes qui coûtent le plus : rapport « Query Performance » de
Supabase, ou l'extension `pg_stat_statements` (temps total, nombre d'appels). Puis pour chacune :
```sql
explain (analyze, buffers) select id, total_centimes from commandes
where client_id = '…' order by cree_le desc limit 20;
```
**Corriger** — Signaux à repérer : `Seq Scan` sur une grande table (index manquant, BDD-11) ; gros
écart entre lignes estimées et lignes réelles (statistiques périmées : `analyze commandes;`) ;
`Sort` sur beaucoup de lignes (un index qui inclut l'ordre de tri) ; boucles imbriquées sur des
milliers de lignes. Ne demander que les colonnes utiles plutôt que `select *`. Mesurer de nouveau
après chaque changement.
**Piège** — `EXPLAIN ANALYZE` **exécute** la requête : sur un `update` ou un `delete`, l'entourer
de `begin; … rollback;`. Et un plan lu sur une base de dev presque vide ne dit rien de la prod.
**Notions** — EXPLAIN, Query Optimization, Database Indexing

---

### BDD-16 · Les grandes listes sont paginées par curseur
`conseillé` · `bdd`

**Pourquoi** — La pagination par décalage (`offset 10000 limit 20`) oblige la base à lire puis
jeter les 10 000 premières lignes : plus on va loin, plus c'est lent. Et si des lignes arrivent
entre deux pages, l'utilisateur voit des doublons ou en rate. La pagination par curseur demande
« les 20 suivantes après celle-ci » : rapide à toute profondeur, et stable.
**Vérifier** — `offset`, `.range()` avec de grands nombres, `skip` (Prisma), sur des tables qui
grossissent : fils d'actualité, historiques, journaux, défilement infini.
**Corriger** —
```sql
select id, texte, cree_le from messages
where (cree_le, id) < ($1, $2)              -- la dernière ligne de la page précédente
order by cree_le desc, id desc limit 20;    -- index sur (cree_le desc, id desc)
```
supabase-js : `.lt('cree_le', curseur).order('cree_le', { ascending: false }).limit(20)`, avec
l'`id` en départage si deux lignes peuvent avoir la même date. L'offset reste très bien pour un
petit tableau d'administration avec des numéros de page.
**Notions** — Pagination, Database Indexing

---

### BDD-17 · Les migrations ne coupent pas le service
`conseillé` · `prod`

**Pourquoi** — Certaines modifications verrouillent une table pendant tout leur déroulement : sur
une grosse table, le site attend, puis renvoie des erreurs. Et pendant un déploiement, l'ancienne
et la nouvelle version du code tournent quelques instants ensemble : si la migration supprime ou
renomme une colonne que l'ancienne version lit encore, celle-ci plante.
**Vérifier** — Migrations qui renomment ou suppriment une colonne utilisée, changent un type,
ajoutent un `not null` ou un index (sans `concurrently`) sur une grosse table. Une marche arrière
existe-t-elle (migration inverse ou procédure écrite) ? Une sauvegarde récente précède-t-elle les
migrations risquées (REP) ?
**Corriger** — La méthode expand/contract (élargir, puis resserrer), en plusieurs déploiements :
1) ajouter la nouvelle colonne, facultative ; 2) le code écrit dans les deux ; 3) recopier
l'existant, par lots ; 4) le code lit la nouvelle ; 5) supprimer l'ancienne, plus tard. En tête
d'une migration risquée, `set lock_timeout = '5s';` : elle échoue proprement au lieu de bloquer le
site. Ajouter une colonne avec une valeur par défaut constante est instantané depuis Postgres 11.
**Piège** — Appliquer tout ça à un projet sans utilisateurs : une migration directe suffit. La
méthode compte dès qu'il y a du trafic pendant les déploiements.
**Notions** — Database Migrations, Schema Versioning

---

### BDD-18 · Les deadlocks sont évités, et retentés quand ils arrivent
`conseillé` · `bdd`

**Pourquoi** — Un deadlock (interblocage) : la transaction A verrouille la ligne 1 et attend la
ligne 2 ; la transaction B tient la ligne 2 et attend la ligne 1. Aucune ne peut avancer. Postgres
le détecte (après une seconde d'attente, par défaut) et annule l'une des deux avec l'erreur
`40P01`. Rare à petite échelle, fréquent quand le trafic se concentre sur les mêmes lignes (stocks,
soldes, compteurs).
**Vérifier** — Journaux de la base : `deadlock detected`. Transactions qui modifient plusieurs
lignes dans un ordre variable (virement de A vers B pendant un autre de B vers A) ; transactions
longues ; appels réseau pendant une transaction.
**Corriger** — Toujours verrouiller dans le même ordre, par exemple par identifiant croissant :
`select … where id = any($1) order by id for update`. Transactions courtes, sans attente réseau
dedans. Retenter automatiquement une transaction annulée pour `40P01` ou `40001` (quelques essais
avec backoff, API-08) : annulée, elle n'a rien écrit.
**Notions** — Deadlocks, Transactions, Pessimistic Locking

---

### BDD-19 · La suppression douce est un choix assumé, avec ses pièges traités
`conseillé` · `bdd`

**Pourquoi** — La suppression douce (soft delete) marque une ligne comme supprimée (`deleted_at`)
au lieu de l'effacer : on peut annuler, garder l'historique. Mais chaque requête doit penser à
filtrer, une contrainte `unique` bloque la réinscription avec le même e-mail, et une donnée
personnelle « supprimée » qui reste en base est toujours une donnée personnelle (RGPD : LEG).
**Vérifier** — Avec une colonne `deleted_at` ou `is_deleted` : chaque lecture la filtre-t-elle ?
Les unicités en tiennent-elles compte ? Les policies RLS cachent-elles les lignes supprimées ? Une
purge définitive existe-t-elle ?
**Corriger** —
```sql
create unique index on comptes (email) where deleted_at is null;   -- unique parmi les lignes vivantes
create policy "notes vivantes" on notes for select to authenticated
  using (deleted_at is null and (select auth.uid()) = user_id);
```
Une vue `security_invoker` (BDD-03) qui filtre évite les oublis. Purge réelle après un délai
décidé (tâche planifiée : ASY), et effacement sans délai quand la personne le demande (LEG). Sans
besoin d'annulation ni d'historique, une vraie suppression est plus simple.
**Notions** — Suppression douce, Contraintes, Row Level Security

---

### BDD-20 · Répliques, partitionnement et sharding n'arrivent que quand les mesures le demandent
`conseillé` · `échelle`

**Pourquoi** — Ces techniques répondent à de vrais problèmes de très grosses bases, et chacune
ajoute une complexité durable. Une base Postgres bien indexée tient bien plus qu'on ne le croit :
on grandit d'abord verticalement (une instance plus grosse, plus de mémoire), ce qui ne coûte
aucune ligne de code.
**Vérifier** — Les mesures : CPU et mémoire du serveur principal sur la durée, requêtes les plus
lentes (BDD-15), taille des plus grosses tables. Index, N+1, cache et montée en taille de
l'instance sont-ils déjà faits ?
**Corriger** — Quand chaque technique devient utile :
| Technique | Ce que c'est | Quand y penser |
|---|---|---|
| Replication | Copier la base en continu vers d'autres serveurs | Pour survivre à la panne d'un serveur (REP) ; généralement fourni par l'hébergeur |
| Read Replicas | Copies en lecture seule qui absorbent les lectures | Quand les lectures saturent le serveur principal malgré index et cache, ou pour lire près d'utilisateurs lointains ; Supabase en propose sur ses offres payantes |
| Partitioning | Découper une table en morceaux (par mois, par client) dans la même base | Quand une table dépasse la mémoire du serveur (règle empirique de la documentation Postgres), ou pour effacer d'un bloc les vieilles données (journaux, événements) |
| Sharding | Répartir les données sur plusieurs serveurs de base | Quand aucune machine, même la plus grosse, ne tient plus le volume ou les écritures. Rarissime ; avec un outil dédié (Citus…) |

Une réplique a du retard (replication lag) : juste après une écriture, elle peut encore renvoyer
l'ancienne valeur. Lire sur le serveur principal ce que l'utilisateur vient de modifier.
**Piège** — Partitionner ou « sharder » par anticipation une base de quelques gigaoctets : chaque
requête et chaque migration devient plus compliquée, pour aucun gain mesurable (YAGNI).
**Notions** — Read Replicas, Replication, Partitioning, Sharding
