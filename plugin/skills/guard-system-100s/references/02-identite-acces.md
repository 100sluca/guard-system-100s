# 02 · Identité, connexion, droits d'accès (IAM)

Deux questions à ne jamais confondre. L'**authentification** répond à « qui es-tu ? » : c'est la
connexion. L'**autorisation** répond à « as-tu le droit de faire ça, sur cette donnée-là ? ». La
plupart des fuites viennent de la seconde : un utilisateur bien connecté qui lit les factures d'un
autre en changeant un numéro dans l'URL. Les règles : le serveur (ou la base, avec la Row Level
Security) vérifie l'identité **et** le droit à chaque requête ; le navigateur ne décide jamais
rien ; et la connexion elle-même se confie à un fournisseur éprouvé plutôt qu'à du code maison.

---

### IAM-01 · Chaque accès vérifie le droit sur cette ressource précise, pas seulement que l'utilisateur est connecté
`bloquant` · `comptes`

**Pourquoi** — C'est la faille n° 1 du classement OWASP des API (API Top 10, 2023), sous le nom de
BOLA (Broken Object Level Authorization), aussi appelée IDOR (Insecure Direct Object Reference,
référence directe non protégée). L'API reçoit `GET /api/factures/1042`, vérifie que quelqu'un est
connecté, et renvoie la facture… sans vérifier qu'elle lui appartient. L'attaquant essaie 1041,
1043, et ainsi de suite. Même chose pour la modification et la suppression.
**Vérifier** — Pour chaque route, Server Action, Edge Function, Worker ou `doGet(e)`/`doPost(e)`
d'Apps Script qui reçoit un identifiant (`params.id`, `searchParams`, corps de requête) : la requête
en base filtre-t-elle aussi par propriétaire ou par organisation ? Chercher les
`findUnique({ where: { id } })`, `.eq('id', id)`, `WHERE id = ?` sans condition sur l'utilisateur.
Test manuel : deux comptes ; A rejoue l'URL ou la requête de B.
**Corriger** — Lier la donnée à l'utilisateur dans la requête elle-même :
```ts
const facture = await db.facture.findFirst({ where: { id, ownerId: user.id } })
if (!facture) return new Response(null, { status: 404 }) // 404 : ne confirme même pas que la facture existe
```
Dans une app à plusieurs organisations (multi-tenant), l'`org_id` vient de la table des membres,
lue côté serveur, jamais du client. Avec Supabase, la Row Level Security applique ce filtre à
toutes les requêtes (IAM-03).
**Piège** — Croire que des identifiants imprévisibles (UUID) protègent. Ils gênent l'énumération,
mais un identifiant finit toujours par fuiter (lien partagé, journal, capture d'écran). Le contrôle
du droit reste obligatoire.
**Notions** — IDOR, Authentification et autorisation

---

### IAM-02 · Le droit est vérifié côté serveur à chaque point d'entrée, pas seulement dans le middleware ou l'interface
`bloquant` · `comptes`

**Pourquoi** — Cacher un bouton n'empêche pas d'appeler l'action. Et un contrôle placé à un seul
endroit, en amont, peut sauter : en mars 2025, la faille CVE-2025-29927 permettait de contourner
entièrement le middleware d'un Next.js auto-hébergé en ajoutant l'en-tête `x-middleware-subrequest`.
Les applications qui ne vérifiaient les droits que là étaient grandes ouvertes. Autre point : dans
Next.js, chaque Server Action est un endpoint public, appelable par une simple requête POST sans
passer par la page.
**Vérifier** — Projet Next.js App Router : chaque fichier `'use server'`, chaque `route.ts` et chaque
composant serveur qui lit des données privées vérifie-t-il la session **et** le droit ? Le
`middleware.ts` (renommé `proxy.ts` depuis Next.js 16) ne doit faire que des redirections de
confort. Un contrôle dans un `layout.tsx` ne suffit pas : le layout n'est pas réexécuté à chaque
navigation et n'empêche pas les pages enfants de s'exécuter. Version de Next.js au moins 15.2.3
(ou 14.2.25, 13.5.9, 12.3.5). Ailleurs : les routes Express, Hono ou FastAPI ont-elles une garde,
et l'oubli est-il impossible (garde posée sur tout le routeur) ?
**Corriger** — Une couche d'accès aux données (« Data Access Layer », recommandée par la doc
Next.js) : un module `server-only` par lequel passe toute lecture et écriture, et qui vérifie
session et droit à chaque appel.
```ts
// data/projets.ts
import 'server-only'
export async function supprimerProjet(id: string) {
  const user = await exigerUtilisateur()                       // jeton vérifié (IAM-04), sinon erreur
  await db.projet.delete({ where: { id, ownerId: user.id } }) // droit sur la ressource (IAM-01)
}
```
Pages, routes et Server Actions appellent ces fonctions et ne touchent jamais la base directement.
En Express ou Hono, un middleware d'authentification monté sur tout `/api`, avec une liste
explicite des routes publiques.
**Piège** — Mettre Next.js à jour corrige CVE-2025-29927, pas l'architecture : la prochaine faille
du même genre touchera de nouveau ceux qui n'ont qu'un seul verrou.
**Notions** — Authentification et autorisation, Principe du moindre privilège

---

### IAM-03 · La Row Level Security est activée sur chaque table exposée, avec des policies fondées sur `auth.uid()`
`bloquant` · `bdd` · `auto`

**Pourquoi** — Avec Supabase, le navigateur parle directement à la base avec la clé publique (`anon`
ou `sb_publishable_…`, voir SEC-09). La Row Level Security (RLS) est le filtre que Postgres applique
ligne par ligne selon qui demande. Sans elle, toute personne qui a ouvert ton site peut lire,
modifier ou vider la table avec cette clé. En 2025, des chercheurs ont trouvé de nombreuses
applications créées avec un générateur d'apps par IA dont les tables étaient lisibles ainsi
(CVE-2025-48757).
**Vérifier** — `node audit.mjs` (tables créées dans les migrations sans `enable row level
security`). Dans le tableau de bord : Advisors → Security Advisor (alertes `rls_disabled_in_public`,
`policy_exists_rls_disabled`, `rls_references_user_metadata`, `security_definer_view`). Une table
créée avec l'éditeur de tables a la RLS active ; une table créée en SQL ou par migration, **non**.
Regarder aussi les vues, les fonctions `security definer` et les policies du stockage
(`storage.objects`).
**Corriger** —
```sql
alter table public.notes enable row level security;

create policy "lire ses notes" on public.notes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "créer ses notes" on public.notes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "modifier ses notes" on public.notes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
```
`using` filtre les lignes visibles ; `with check` refuse d'écrire une ligne qui n'appartiendrait
pas à l'utilisateur. `(select auth.uid())` plutôt que `auth.uid()` évite de recalculer la fonction
à chaque ligne. Les vues : `with (security_invoker = true)` (Postgres 15+), sinon elles contournent
la RLS. Une table avec RLS active et aucune policy refuse tout : c'est le bon point de départ.
**Piège** — La RLS filtre des **lignes**, pas des colonnes : une policy « modifier sa ligne de
profil » laisse aussi modifier la colonne `role` de cette ligne (IAM-05, INJ-06). Et la clé
`service_role` / `sb_secret_…` contourne toute RLS : côté serveur uniquement, après tes propres
vérifications. Reste du domaine base de données : BDD.
**Notions** — Row Level Security, Principe du moindre privilège

---

### IAM-04 · Côté serveur, l'identité vient d'un jeton vérifié, jamais de `getSession()` ni d'un identifiant envoyé par le client
`bloquant` · `comptes`

**Pourquoi** — Tout ce qui vient du navigateur se falsifie : un champ `userId` dans le corps de la
requête, un cookie lu sans vérifier sa signature, un en-tête `X-User-Id`. Avec Supabase,
`supabase.auth.getSession()` lit la session dans le cookie **sans la revalider** ; la doc Supabase
dit de ne jamais s'y fier dans du code serveur.
**Vérifier** — Chercher `getSession()` dans le code serveur (`middleware.ts`/`proxy.ts`, `route.ts`,
Server Actions, Edge Functions, `+page.server.ts`). Chercher tout `userId`, `user_id`, `ownerId` lu
dans `body`, `formData`, `searchParams` ou un en-tête, puis utilisé pour lire ou écrire.
**Corriger** — Côté serveur avec Supabase :
```ts
const { data, error } = await supabase.auth.getClaims()   // vérifie la signature du JWT
if (error || !data?.claims) return new Response(null, { status: 401 })
const userId = data.claims.sub                              // l'identité vient du jeton, jamais de la requête
```
`getClaims()` vérifie le jeton localement grâce aux clés de signature asymétriques du projet ;
`getUser()` interroge le serveur d'auth, voit donc un compte supprimé ou banni, au prix d'un appel
réseau. Même logique ailleurs : le jeton de session d'une app Shopify intégrée se vérifie avec la
bibliothèque officielle ; une session Flask ou FastAPI se lit côté serveur, signée.
**Piège** — Dans une Edge Function Supabase, la vérification du JWT faite par la passerelle dit
seulement « ce jeton est valide », pas « cet utilisateur a le droit » : l'autorisation reste dans
la fonction (IAM-01).
**Notions** — Authentification et autorisation, JWT, Sessions

---

### IAM-05 · Rôles et droits ne viennent jamais de `user_metadata` ni d'un champ que l'utilisateur peut modifier
`bloquant` · `comptes`

**Pourquoi** — Chez Supabase, `user_metadata` (colonne `raw_user_meta_data`) se remplit à
l'inscription (`signUp({ options: { data } })`) et reste modifiable à tout moment par l'utilisateur
lui-même (`updateUser({ data })`). Une policy ou un `if` qui lit `user_metadata.role === 'admin'`
donne le rôle admin à quiconque se l'écrit. Même piège avec une colonne `is_admin` dans une table
`profiles` que l'utilisateur a le droit de modifier.
**Vérifier** — Chercher `user_metadata` dans les policies SQL et le code serveur (le Security
Advisor le signale : `rls_references_user_metadata`). Pour chaque colonne de droit (`role`,
`is_admin`, `plan`, `credits`, `org_id`) : qui peut l'écrire ?
**Corriger** — Le rôle vit là où seul le serveur écrit : `app_metadata` (modifiable seulement avec
la clé secrète), ou une table `user_roles` sans aucune policy d'écriture pour `authenticated`. Pour
l'avoir dans le jeton, Supabase propose un « Custom Access Token Hook » qui ajoute le rôle aux
claims ; la policy lit alors `(select auth.jwt() ->> 'user_role')`. Si le profil reste modifiable
par l'utilisateur, limiter les colonnes :
```sql
revoke update on public.profiles from authenticated;
grant update (pseudo, avatar_url) on public.profiles to authenticated;
```
Le contrôle par rôles (RBAC) reste simple : deux ou trois rôles fixes, une fonction
`peut(user, action)` côté serveur, refus par défaut.
**Piège** — Un rôle mis dans le jeton n'est relu qu'au prochain rafraîchissement : retirer un droit
d'admin ne prend effet qu'à l'expiration du jeton. Pour une révocation immédiate, relire le rôle en
base sur les actions sensibles (IAM-12).
**Notions** — RBAC, Row Level Security, Principe du moindre privilège

---

### IAM-06 · Chaque JWT est vérifié : signature, algorithme imposé, expiration courte, émetteur et audience
`bloquant` · `api` · `auto`

**Pourquoi** — Un JWT (JSON Web Token) est un badge signé : trois morceaux en base64 dont le
contenu (`sub`, `role`, `exp`) se lit sans aucune clé. Le **décoder** ne prouve rien ; seule la
**vérification** de la signature prouve qu'il vient bien de ton fournisseur. `jwt.decode()` de
`jsonwebtoken` ne vérifie rien, et un jeton à l'algorithme `none` n'a pas de signature du tout.
Autre attaque classique : la confusion d'algorithme, où l'on présente un jeton HS256 signé avec la
clé *publique* prévue pour RS256.
**Vérifier** — `node audit.mjs` (`jwt.decode` utilisé pour authentifier, option `algorithms`
absente, `none`, `verify_signature: False` en Python). Durée de vie (`exp`) des jetons émis.
Vérification de `iss` (qui l'a émis) et de `aud` (à qui il est destiné).
**Corriger** — Avec `jose` (Node, Workers, Deno, Bun) :
```ts
import { jwtVerify, createRemoteJWKSet } from 'jose'
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
const { payload } = await jwtVerify(jeton, JWKS, {
  issuer: `${SUPABASE_URL}/auth/v1`, audience: 'authenticated', algorithms: ['ES256', 'RS256'],
})
```
En Python : `jwt.decode(jeton, cle, algorithms=["RS256"], audience="...")` (PyJWT), jamais
`options={"verify_signature": False}`. Jeton d'accès court (15 min à 1 h) et jeton de
rafraîchissement révocable (IAM-12). Pour changer de clé de signature sans déconnecter tout le
monde : SEC-10. Une API ou un serveur MCP qui reçoit des jetons OAuth vérifie l'audience : un jeton
émis pour une autre application ne doit pas passer (IA).
**Piège** — Mettre des données sensibles dans le jeton en le croyant chiffré. Il est seulement
signé : tout le monde peut le lire.
**Notions** — JWT, JWT Rotation, Révocation

---

### IAM-07 · Les mots de passe sont hachés avec argon2id ou bcrypt, jamais md5, sha1 ou sha256 seuls
`bloquant` · `comptes` · `auto`

**Pourquoi** — Le hachage transforme le mot de passe en empreinte qu'on ne peut pas inverser. Mais
md5, sha1 et sha256 sont conçus pour être **rapides** : une carte graphique en calcule des
milliards par seconde, et une base volée se « casse » en quelques heures. Les fonctions faites pour
les mots de passe (argon2id, bcrypt, scrypt) sont volontairement lentes et salées : un aléa
différent par compte, pour que deux mots de passe identiques n'aient pas la même empreinte.
**Vérifier** — `node audit.mjs` (`createHash('md5'|'sha1'|'sha256')`, `hashlib.md5/sha1/sha256`
près de `password`). Si l'auth est maison : quelle fonction, quels paramètres ? Un mot de passe
chiffré de façon réversible (AES) est aussi une faute.
**Corriger** — Le mieux : ne stocker aucun mot de passe (fournisseur d'auth, IAM-09). Sinon :
```ts
import argon2 from 'argon2'                        // argon2id par défaut
const empreinte = await argon2.hash(motDePasse)    // contrôle : await argon2.verify(empreinte, motDePasse)
```
```python
from argon2 import PasswordHasher                  # paquet argon2-cffi, argon2id par défaut
empreinte = PasswordHasher().hash(mot_de_passe)
```
Minimums de l'OWASP : argon2id avec 19 Mio de mémoire et 2 itérations ; bcrypt avec un coût d'au
moins 10 (bcrypt ignore tout ce qui dépasse 72 octets). Côté saisie, la référence du NIST
(SP 800-63B, révision 4) : au moins 15 caractères quand le mot de passe est le seul facteur
(8 avec MFA), au moins 64 acceptés, aucune règle de composition imposée (« une majuscule, un
chiffre… »), aucun changement périodique forcé, refus des mots de passe connus (IAM-11),
copier-coller et gestionnaires de mots de passe autorisés.
**Piège** — Un sha256 « salé » reste rapide, donc cassable. À l'inverse, un hachage rapide convient
pour un jeton aléatoire long (IAM-08, IAM-13) : on ne peut pas le deviner, donc sha256 suffit.
**Notions** — Hachage de mot de passe

---

### IAM-08 · Jetons, codes et liens secrets viennent d'un aléa cryptographique et se comparent en temps constant
`bloquant` · `tout` · `auto`

**Pourquoi** — `Math.random()` (et le module `random` de Python) produit une suite prévisible :
qui observe quelques valeurs peut deviner les suivantes. Un jeton de réinitialisation, un lien de
partage, un code d'invitation ou un identifiant de session tirés ainsi se devinent.
**Vérifier** — `node audit.mjs` (`Math.random` près de `token`, `code`, `secret`, `session`,
`invite`, `reset`). En Python : `random.` au lieu de `secrets.`. Secrets comparés avec `===` ou
`==`.
**Corriger** —
```ts
crypto.randomUUID()                                           // Node 20+, navigateurs, Workers, Deno
crypto.getRandomValues(new Uint8Array(32))                    // octets bruts
import { randomBytes } from 'node:crypto'; randomBytes(32).toString('base64url')
```
```python
import secrets
jeton = secrets.token_urlsafe(32)
```
En Apps Script, `Utilities.getUuid()`. Pour comparer un secret reçu à la valeur attendue (signature
de webhook, jeton d'API) : `crypto.timingSafeEqual` en Node (tampons de même longueur),
`hmac.compare_digest` en Python. Une comparaison ordinaire s'arrête au premier caractère différent,
et cet écart de temps se mesure.
**Piège** — Un code à 6 chiffres bien aléatoire ne vaut que s'il expire vite et si les essais sont
limités (IAM-11, IAM-18) : un million de possibilités se parcourent en peu de temps.
**Notions** — Aléa cryptographique

---

### IAM-09 · La connexion repose sur un fournisseur ou une bibliothèque éprouvée, pas sur un système maison
`important` · `comptes`

**Pourquoi** — Une authentification complète, c'est : hachage (IAM-07), sessions (IAM-12),
réinitialisation (IAM-13), vérification de l'e-mail, limitation des essais (IAM-11), MFA
(IAM-17), OAuth (IAM-14). Chaque morceau a ses pièges ; un fournisseur maintenu les a déjà
rencontrés et corrigés. Tout écrire soi-même, ce sont des semaines de travail et autant de failles
possibles.
**Vérifier** — Le projet a-t-il une table `users` avec une colonne `password`, des routes `/login`
et `/reset` écrites à la main, des JWT signés à la main ?
**Corriger** — Selon la stack : Supabase Auth (déjà là si le projet utilise Supabase), Clerk, Auth0,
WorkOS, Firebase Auth ; ou une bibliothèque hébergée chez toi : Better Auth, Auth.js (NextAuth).
En Python : l'auth intégrée de Django, ou un fournisseur via OIDC (IAM-14). Quand NE PAS monter
une auth complète : un outil réservé à toi ou à une petite équipe se protège plus simplement avec
Cloudflare Access devant l'application, ou avec la seule connexion Google.
**Piège** — Le fournisseur gère la connexion, pas l'autorisation : décider qui voit quoi (IAM-01,
IAM-03) reste ton travail.
**Notions** — IAM, Authentification et autorisation

---

### IAM-10 · L'espace d'administration est vérifié côté serveur, à part, et protégé par MFA
`important` · `comptes`

**Pourquoi** — Les fonctions d'admin (voir tous les comptes, rembourser, supprimer, changer un rôle)
sont la cible n° 1. Une URL « secrète » (`/admin-x7k2`) se retrouve dans le bundle JavaScript,
l'historique ou un robot d'exploration. L'OWASP classe l'oubli de vérifier le droit sur une
**fonction** (BFLA, Broken Function Level Authorization) au 5e rang des risques des API.
**Vérifier** — Chaque page, route et action d'admin vérifie-t-elle le rôle côté serveur (IAM-02,
IAM-05) ? Le code de l'admin est-il chargé chez les utilisateurs normaux ? Les admins ont-ils la
MFA ? Les actions d'admin laissent-elles une trace ?
**Corriger** — Un groupe de routes à part (`app/(admin)/`, ou un sous-domaine `admin.`) avec une
garde serveur unique `exigerAdmin()` appelée dans chaque page et chaque action. MFA obligatoire
pour ce rôle ; avec Supabase, une policy qui exige le niveau `aal2` :
`(select auth.jwt() ->> 'aal') = 'aal2'`. Les opérations avec la clé `service_role` n'ont lieu
qu'après cette garde. Journal des actions d'admin : qui, quoi, quand (OBS). Pour un outil interne,
Cloudflare Access devant l'admin en plus.
**Piège** — Un paramètre `?admin=true`, un cookie `role=admin` ou un `localStorage.isAdmin` lus
côté client : tout se modifie dans le navigateur.
**Notions** — RBAC, MFA, Principe du moindre privilège

---

### IAM-11 · La connexion résiste au brute force et au credential stuffing
`important` · `comptes`

**Pourquoi** — Le brute force essaie des milliers de mots de passe sur un compte. Le credential
stuffing essaie sur ton site des couples e-mail + mot de passe volés ailleurs : comme beaucoup de
gens réutilisent leur mot de passe, une partie fonctionne. Les deux sont automatisés et coûtent
presque rien à l'attaquant.
**Vérifier** — Combien d'essais par minute une même IP, et un même compte, peuvent-ils faire ? Les
mots de passe connus pour avoir fuité sont-ils refusés ? Chez Supabase : Authentication → Rate
Limits, protection CAPTCHA (Turnstile ou hCaptcha), option de refus des mots de passe ayant fuité
(selon l'offre).
**Corriger** — Limiter par IP **et** par compte (mise en œuvre du rate limiting : API), avec un
délai qui grandit après chaque échec. Un CAPTCHA discret (Cloudflare Turnstile) après quelques
échecs et sur l'inscription. Refuser les mots de passe présents dans les fuites : l'API Pwned
Passwords de Have I Been Pwned s'interroge sans envoyer le mot de passe (seuls les 5 premiers
caractères de son empreinte sha1 partent). Proposer la MFA (IAM-17). Prévenir par e-mail d'une
connexion depuis un nouvel appareil.
**Piège** — Bloquer le compte après 5 échecs : l'attaquant peut alors bloquer qui il veut.
Préférer des délais croissants et un CAPTCHA au verrouillage dur.
**Notions** — Brute force, Credential stuffing, Hachage de mot de passe

---

### IAM-12 · Les sessions expirent, changent à la connexion et peuvent être révoquées
`important` · `comptes`

**Pourquoi** — Une session est la preuve, gardée entre deux requêtes, que l'utilisateur s'est
connecté (cookie ou jeton). Si elle ne meurt jamais, un ordinateur partagé ou un jeton volé donne
un accès sans fin. Si son identifiant ne change pas à la connexion, un attaquant peut en imposer un
qu'il connaît avant que la victime se connecte (fixation de session). Et un JWT ne se révoque pas :
il reste valide jusqu'à son `exp`.
**Vérifier** — Durée de vie des sessions et des jetons d'accès. Après déconnexion, l'ancien cookie
ou jeton est-il refusé par le serveur ? Après un changement de mot de passe, les autres appareils
sont-ils déconnectés ? Existe-t-il un « se déconnecter partout » ?
**Corriger** — Jeton d'accès court (Supabase : 1 h par défaut, réglable) et jeton de
rafraîchissement à usage unique, remplacé à chaque utilisation (rotation). Déconnexion côté
serveur, pas seulement suppression du cookie : `supabase.auth.signOut()` révoque les sessions
(portée `global` par défaut en JS, `others` pour les autres appareils seulement) ; les jetons
d'accès déjà émis restent valides jusqu'à leur expiration. Session maison : `req.session.regenerate()`
(express-session) à la connexion, `session.clear()` en Flask, expiration d'inactivité et
expiration absolue. Attributs des cookies de session : WEB-04.
**Piège** — Croire que supprimer le cookie déconnecte. Si le jeton a été copié, il marche toujours :
la révocation se fait côté serveur, et seule une durée de vie courte limite ce qui reste.
**Notions** — Sessions, Révocation, JWT

---

### IAM-13 · La réinitialisation de mot de passe passe par un lien à usage unique, court, construit sans l'en-tête `Host`
`important` · `comptes`

**Pourquoi** — Le formulaire « mot de passe oublié » est une porte d'entrée sans mot de passe.
Jeton prévisible, réutilisable ou valable une semaine : le compte est à prendre. Lien fabriqué à
partir de l'en-tête `Host` de la requête : l'attaquant demande la réinitialisation pour la victime
avec `Host: site-pirate.com`, et l'e-mail légitime contient un lien vers chez lui, qui capte le
jeton au clic (empoisonnement de l'en-tête Host).
**Vérifier** — Si c'est maison : aléa du jeton (IAM-08), durée de validité, usage unique,
stockage. D'où vient le domaine du lien ? Que deviennent les sessions ouvertes après le
changement ?
**Corriger** — Jeton de 32 octets aléatoires, stocké **haché** (sha256 suffit ici), valable 15 à
60 minutes, effacé après usage. Le lien se construit avec l'URL de configuration (`APP_URL`), jamais
avec `req.headers.host` (INJ-13). Même message que le compte existe ou non (IAM-19). Après
réinitialisation : révoquer les autres sessions et prévenir l'utilisateur par e-mail. Avec
Supabase : `resetPasswordForEmail(email, { redirectTo })`, où `redirectTo` doit figurer dans la
liste des URL autorisées (Authentication → URL Configuration).
**Piège** — Les questions secrètes (« nom de votre premier animal ») : la réponse traîne souvent
sur les réseaux sociaux. N'en pas mettre.
**Notions** — Réinitialisation de mot de passe, Révocation, Injection d'en-têtes

---

### IAM-14 · OAuth et OIDC : flux avec PKCE et `state`, URL de retour exactes, identité par `sub` et non par e-mail
`important` · `comptes`

**Pourquoi** — OAuth permet à une application d'obtenir un accès délégué (« autoriser l'app à lire
ton Google Drive ») ; OIDC (OpenID Connect) ajoute par-dessus « qui est connecté » (« Se connecter
avec Google »). Erreurs classiques : une URL de retour trop permissive, qui laisse un attaquant
récupérer le code d'autorisation ; l'absence de `state`, qui permet de connecter la victime au
compte de l'attaquant ; la fusion de comptes sur la seule base de l'e-mail, alors que des
fournisseurs ont déjà renvoyé des e-mails non vérifiés (cas « nOAuth » avec Microsoft Entra ID, 2023).
**Vérifier** — Quel flux ? Le flux « implicite » (jeton renvoyé directement dans l'URL) est
déconseillé par la RFC 9700 (bonnes pratiques de sécurité OAuth, 2025). URL de retour autorisées
chez le fournisseur et dans Supabase (Authentication → URL Configuration) : exactes en production,
jokers (`**`) réservés aux préversions. Comment un compte social est-il relié à un compte
existant ?
**Corriger** — Flux « Authorization Code » avec PKCE (Proof Key for Code Exchange : le client prouve,
au moment d'échanger le code, qu'il est bien celui qui a lancé la demande ; un code intercepté ne
sert donc à rien). Les SDK récents le font par défaut (`@supabase/ssr` utilise PKCE). Un `state`
aléatoire vérifié au retour. L'identité d'un compte externe, c'est le couple `iss` + `sub` du jeton
d'identité, pas l'e-mail ; ne relier deux comptes par e-mail que si `email_verified` est vrai.
Scopes demandés au minimum (IAM-16).
**Piège** — Se servir du jeton d'identité (ID token) pour appeler une API, ou d'un jeton d'accès
pour prouver l'identité : ce sont deux badges différents, pour des destinataires (`aud`)
différents.
**Notions** — OAuth, OIDC, PKCE

---

### IAM-15 · Tes comptes d'outils (GitHub, hébergeur, base, nom de domaine, npm) sont protégés par MFA et nominatifs
`important` · `prod`

**Pourquoi** — Le compte le plus puissant de ton projet, c'est le tien. Qui prend ton GitHub, ton
Vercel, ton Supabase ou ton registrar (l'endroit où le nom de domaine est enregistré) prend tout :
code, base, domaine et e-mails compris. Ces comptes sont visés par l'hameçonnage (phishing) et par
la réutilisation de mots de passe.
**Vérifier** — MFA active sur : GitHub, Vercel/Netlify, Cloudflare, Supabase, le compte Google qui
possède les scripts Apps Script et les projets Cloud, le registrar, npm, le compte partenaire
Shopify, le compte développeur du Chrome Web Store, les fournisseurs d'IA. Codes de récupération
rangés hors de l'ordinateur. Collaborateurs : un compte chacun, pas de mot de passe partagé, accès
retirés au départ.
**Corriger** — Passkey ou application d'authentification plutôt que SMS. Un gestionnaire de mots de
passe. Dans les organisations (GitHub, Supabase, Cloudflare…), le rôle le plus faible qui suffit,
et la MFA exigée par l'organisation quand le service le permet. Une revue des membres et des jetons
tous les trois mois, et à chaque départ.
**Notions** — MFA, IAM, Principe du moindre privilège

---

### IAM-16 · Comptes de service et scripts « exécutés en ton nom » ont des droits minimaux et un accès restreint
`important` · `api`

**Pourquoi** — Un compte de service est une identité pour un programme, pas pour une personne :
compte de service Google Cloud, clé `service_role` de Supabase, jeton de bot, script Apps Script.
Il agit souvent avec des droits larges, sans MFA, et personne ne le surveille. Cas typique : une
web app Apps Script déployée avec « Exécuter en tant que : moi » et « Accès : tout le monde » donne
à n'importe quel visiteur les droits de ton compte Google sur tout ce que le script touche.
**Vérifier** — Liste des comptes de service et de leurs droits (IAM du projet Google Cloud, clés
Supabase, jetons Cloudflare et GitHub). Fichiers JSON de clés de compte de service (SEC-03).
Déploiements Apps Script : « Exécuter en tant que » et « Qui a accès ». Scopes déclarés dans
`appsscript.json` (`oauthScopes`) et scopes OAuth demandés aux utilisateurs.
**Corriger** — Un compte de service par usage, avec un rôle étroit plutôt qu'« Éditeur ». Pas de
clé JSON quand on peut s'en passer : compte de service attaché à la ressource (Cloud Run,
Functions) ou fédération d'identité depuis GitHub Actions (SEC-13). En Apps Script :
`/** @OnlyCurrentDoc */` en tête du script limite l'accès au seul document lié ; une web app
publique valide ce qu'elle reçoit (INJ-01) et n'expose que l'action prévue. Côté OAuth, demander
`drive.file` (seulement les fichiers créés ou ouverts par l'app) plutôt que `drive` (tout le
Drive) : Google impose une vérification de l'app pour les scopes sensibles, et une évaluation de
sécurité pour certains scopes « restreints » (Gmail, Drive complet). Rotation des clés : SEC-10.
**Notions** — Comptes de service, Principe du moindre privilège, IAM

---

### IAM-17 · La MFA est proposée aux utilisateurs, exigée pour les comptes à pouvoir ; passkeys quand le fournisseur les gère
`conseillé` · `comptes`

**Pourquoi** — La MFA (authentification multifacteur) demande une deuxième preuve en plus du mot de
passe : code d'une application, clé physique, passkey. Un mot de passe volé ne suffit plus. Les
passkeys (standard WebAuthn) remplacent le mot de passe par une clé gardée dans le téléphone ou le
gestionnaire de mots de passe, liée au nom de domaine : un faux site d'hameçonnage ne peut pas
s'en servir.
**Vérifier** — La MFA existe-t-elle ? Est-elle exigée pour les admins (IAM-10) et pour les actions
sensibles (changer d'e-mail, exporter des données, voir un moyen de paiement) ? Y a-t-il des codes
de récupération ?
**Corriger** — Activer ce que le fournisseur propose : Supabase Auth gère le TOTP (code d'une
application d'authentification) et le SMS, et propose les passkeys en bêta depuis 2026 ; Clerk,
Auth0 et Better Auth gèrent les passkeys. En auth maison : `@simplewebauthn/server` (Node) ou
`py_webauthn` (Python). Préférer TOTP ou passkey au SMS, détournable par échange frauduleux de
carte SIM.
**Piège** — Imposer la MFA à tous les utilisateurs d'une petite app grand public fait fuir. La
proposer à tous ; l'exiger là où il y a du pouvoir ou de l'argent.
**Notions** — MFA, Passkeys

---

### IAM-18 · Magic links et codes envoyés par e-mail : courts, à usage unique, résistants aux scanners de messagerie
`conseillé` · `comptes`

**Pourquoi** — Un magic link (lien de connexion envoyé par e-mail) remplace le mot de passe : la
boîte mail devient la clé du compte. Il doit donc expirer vite et ne servir qu'une fois. Souci
réel : les outils de sécurité des messageries d'entreprise ou d'école ouvrent les liens pour les
analyser et consomment le jeton avant l'utilisateur ; Supabase en fait la première cause de
l'erreur `otp_expired`.
**Vérifier** — Durée de validité des liens et des codes (Supabase : réglages e-mail de
l'authentification, durée de l'OTP). Usage unique. Nombre d'essais permis sur un code à 6 chiffres.
Plaintes « lien expiré » venant d'adresses professionnelles.
**Corriger** — Validité courte (quelques minutes à une heure), usage unique, essais limités
(IAM-11). Contre les scanners : un code à recopier dans l'e-mail (`{{ .Token }}` dans le modèle
Supabase), ou un lien vers ta page qui demande un clic sur un bouton avant de valider. Avec le flux
PKCE, le lien ne fonctionne en général que dans le navigateur qui a fait la demande (le secret du
PKCE y est gardé) : le dire dans l'e-mail.
**Notions** — Magic links, PKCE

---

### IAM-19 · Connexion, inscription et réinitialisation ne révèlent pas qui a un compte
`conseillé` · `comptes`

**Pourquoi** — L'énumération de comptes consiste à déduire qu'une adresse est inscrite à partir
d'une réponse différente : « mot de passe incorrect » contre « compte inconnu », « e-mail déjà
utilisé », ou une réponse plus lente quand le compte existe. Sur un site de santé, de rencontre ou
de crédit, savoir que quelqu'un est inscrit est déjà une fuite ; partout ailleurs, cela fournit une
liste de cibles au credential stuffing (IAM-11).
**Vérifier** — Comparer messages et temps de réponse pour une adresse inscrite et une inconnue, sur
la connexion, la réinitialisation et l'inscription.
**Corriger** — Un seul message : « E-mail ou mot de passe incorrect ». Réinitialisation : « Si un
compte existe pour cette adresse, un e-mail vient d'être envoyé ». Inscription : envoyer un e-mail
au titulaire (« vous avez déjà un compte ») au lieu d'afficher l'erreur. Supabase, quand la
confirmation d'e-mail est active, renvoie un utilisateur factice pour une adresse déjà inscrite
plutôt qu'une erreur.
**Piège** — Quand NE PAS s'acharner : si les pseudos sont publics (forum, réseau social), cacher
l'existence d'un compte n'a pas de sens. Limiter les essais (IAM-11) protège alors bien mieux.
**Notions** — Énumération de comptes

---

### IAM-20 · Un moteur d'autorisation dédié seulement quand les règles deviennent un graphe de partages
`conseillé` · `échelle`

**Pourquoi** — Tant que les règles tiennent en « propriétaire » + quelques rôles, une fonction
`peut()` et la RLS suffisent. Quand arrivent les partages à la Google Docs (dossiers, équipes,
invités, droits hérités du dossier parent), les `if` se multiplient et se contredisent. Les moteurs
dédiés centralisent ces règles : par relations (ReBAC : OpenFGA, SpiceDB) ou par politiques
(Cerbos, Oso). Mais c'est un service de plus à faire tourner, à sauvegarder et à comprendre.
**Vérifier** — Les règles de droit sont-elles écrites à un seul endroit ? Combien de sortes de
relations (propriétaire, membre, invité, lecteur d'un dossier parent…) ? Plusieurs applications
doivent-elles partager les mêmes règles ?
**Corriger** — D'abord : un seul module d'autorisation, refus par défaut, et un test automatique
« l'utilisateur B ne voit pas les données de A » (QUA ; avec Supabase, des tests pgTAP lancés par
`supabase test db`). Le moteur dédié seulement quand les partages imbriqués ou plusieurs
applications le rendent nécessaire, typiquement une équipe produit et des centaines de règles.
**Notions** — RBAC, Principe du moindre privilège, IAM
