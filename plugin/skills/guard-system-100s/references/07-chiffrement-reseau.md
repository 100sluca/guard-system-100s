# 07 · Chiffrement, réseau et protocoles (NET)

Une donnée est soit en voyage (in transit), soit au repos (at rest). En voyage, elle traverse des
réseaux que tu ne contrôles pas (Wi-Fi public, opérateurs, proxys) : TLS, le « s » de HTTPS, la
chiffre et prouve qu'on parle au bon serveur. Au repos, les plateformes chiffrent déjà les disques.
L'essentiel du travail n'est donc pas d'inventer, mais de **ne rien casser** (vérification
désactivée, mode « Flexible ») et de **bien régler le domaine** (DNS, certificats, e-mail). Les
secrets eux-mêmes : SEC. Les en-têtes de sécurité du navigateur : WEB. Les mots de passe : IAM.

---

### NET-01 · Tout passe en HTTPS, HTTP redirige vers HTTPS, et HSTS est en place
`bloquant` · `prod`

**Pourquoi** — En HTTP simple, tout circule en clair : sur un Wi-Fi public, n'importe qui lit les
mots de passe et les cookies de session, et peut modifier la page en route (injecter une pub, un
faux formulaire). TLS (Transport Layer Security) chiffre l'échange et prouve, grâce au certificat,
que le serveur est bien celui du domaine. HSTS (HTTP Strict Transport Security) dit au navigateur
« ce site, c'est HTTPS uniquement, même si on tape http:// » : il supprime la première requête en
clair, celle qu'un attaquant peut détourner.
**Vérifier** — `curl -sI http://ton-domaine.fr` répond `301` ou `308` vers `https://`, et chaque
sous-domaine aussi (`www.`, `api.`, `admin.`). L'en-tête `Strict-Transport-Security` est présent
sur les réponses HTTPS (WEB). TLS 1.2 au minimum.
**Corriger** — Vercel, Netlify, Cloudflare Pages : HTTPS automatique ; GitHub Pages : cocher
« Enforce HTTPS ». Cloudflare : SSL/TLS → Edge Certificates → « Always Use HTTPS », et « Minimum
TLS Version » à 1.2. Serveur à soi : Caddy (HTTPS automatique) ou nginx avec certbot. L'en-tête
HSTS et la liste de préchargement des navigateurs (`hstspreload.org`) : WEB.
**Piège** — Laisser une API en `http://` parce que « ce n'est pas le site » : les jetons qui y
passent valent autant que les mots de passe.
**Notions** — TLS, Encryption in Transit, HSTS

---

### NET-02 · La vérification des certificats TLS n'est jamais désactivée
`bloquant` · `tout` · `auto`

**Pourquoi** — Chiffrer ne suffit pas : il faut aussi vérifier qu'on parle au bon serveur.
Désactiver la vérification « pour faire disparaître l'erreur de certificat » rend le chiffrement
inutile : n'importe qui placé sur le trajet (Wi-Fi, proxy, DNS piégé) présente son propre
certificat et lit tout, clés d'API comprises. C'est l'attaque de l'homme du milieu
(man-in-the-middle).
**Vérifier** — `node audit.mjs` signale `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`
(code, `.env`, scripts de `package.json`, CI), `verify=False` (requests, httpx),
`ssl._create_unverified_context`, `CERT_NONE`, `curl -k` ou `--insecure`, `InsecureSkipVerify: true`
(Go). Côté base : `sslmode=disable` ou `no-verify`, `ssl: { rejectUnauthorized: false }` dans la
config de `pg`.
**Corriger** — Traiter la vraie cause : certificat expiré ou mal installé (NET-06), certificat
intermédiaire manquant, horloge de la machine fausse, proxy d'entreprise (ajouter **son**
certificat racine : `NODE_EXTRA_CA_CERTS=/chemin/ca.pem`, `REQUESTS_CA_BUNDLE` en Python),
certificat auto-signé de dev (le fournir explicitement : `ssl: { ca: fs.readFileSync('ca.pem') }`).
Base Supabase : télécharger son certificat d'autorité dans les paramètres de la base et se
connecter en `sslmode=verify-full`.
**Piège** — Le `NODE_TLS_REJECT_UNAUTHORIZED=0` ajouté un jour de dépannage dans un `.env` ou un
script de démarrage, puis oublié : il coupe la vérification pour **tout** le processus Node, y
compris les appels à Stripe ou à OpenAI.
**Notions** — TLS, Certificats, Encryption in Transit

---

### NET-03 · Derrière Cloudflare, le chiffrement est en « Full (strict) », jamais en « Flexible »
`bloquant` · `prod`

**Pourquoi** — Cloudflare se place entre le visiteur et ton serveur (l'origine). En mode
« Flexible », le cadenas s'affiche chez le visiteur, mais le trajet Cloudflare → serveur passe
**en clair** : l'apparence de la sécurité, sans la sécurité. En « Full », ce trajet est chiffré
mais le certificat du serveur n'est pas vérifié, donc un imposteur passe. Seul « Full (strict) »
chiffre **et** vérifie.
**Vérifier** — Tableau de bord Cloudflare → SSL/TLS → Overview : mode affiché. Le mode « Automatic
SSL/TLS », qui devient le réglage par défaut, choisit le mode le plus sûr que l'origine supporte :
regarder lequel il a retenu. Ne concerne pas Workers et Pages, servis par Cloudflare lui-même sans
origine séparée.
**Corriger** — Installer sur l'origine un certificat valide : public (Let's Encrypt) ou « Origin
CA » gratuit de Cloudflare (SSL/TLS → Origin Server ; reconnu par Cloudflare seulement, ce qui
suffit puisque seul Cloudflare parle à l'origine). Puis passer en « Full (strict) ». Les
hébergeurs comme Vercel, Netlify ou Render ont déjà un certificat valide : « Full (strict) »
directement.
**Piège** — « Flexible » avec une origine qui redirige elle-même vers HTTPS : boucle de
redirections sans fin. Le remède est « Full (strict) », pas de retirer la redirection.
**Notions** — TLS, Certificats, Encryption in Transit

---

### NET-04 · Aucune donnée ne circule en clair vers un hôte non local
`important` · `tout` · `auto`

**Pourquoi** — Un seul appel en `http://` vers une API, un webhook ou un script suffit à exposer
une clé, un jeton ou des données personnelles, et permet de modifier la réponse en route. Côté
serveur, la connexion à la base, au cache ou au serveur d'e-mail doit aussi être chiffrée : ce
trajet passe souvent par Internet.
**Vérifier** — `node audit.mjs` signale les URL `http://` vers un hôte qui n'est ni `localhost`,
ni `127.0.0.1`, ni un nom local. Regarder aussi les chaînes de connexion (`sslmode=disable`, Redis
en `redis://` au lieu de `rediss://`), le SMTP sans TLS, les URL de webhook déclarées chez les
fournisseurs, les ressources chargées par la page (contenu mixte : WEB), le manifeste d'une
extension de navigateur.
**Corriger** — `https://`, `wss://` (WebSocket chiffré), `rediss://`, Postgres en `sslmode=require`
au minimum (mieux : `verify-full`, NET-02). Supabase : « Enforce SSL on incoming connections »
dans les paramètres de la base (ses API HTTP imposent déjà TLS ; le changement redémarre la base).
Exception légitime : le réseau privé entre deux conteneurs d'une même machine (`http://api:3000`
dans Docker Compose).
**Notions** — Encryption in Transit, TLS

---

### NET-05 · Le domaine est verrouillé chez le registrar et se renouvelle tout seul
`important` · `prod`

**Pourquoi** — Le registrar (là où le domaine a été acheté : OVH, Gandi, Namecheap, Cloudflare
Registrar…) détient la clé de tout. Qui contrôle ce compte change les DNS, détourne le site,
reçoit les e-mails du domaine, et peut donc réinitialiser les mots de passe de tous tes autres
comptes. Un domaine qui expire, c'est le site, les e-mails et les connexions qui s'arrêtent d'un
coup, et parfois un domaine racheté par quelqu'un d'autre.
**Vérifier** — Sur le compte du registrar : double authentification (2FA) active ? Verrou de
transfert (« transfer lock », statut `clientTransferProhibited`) actif ? Renouvellement automatique
avec un moyen de paiement valide ? Date d'expiration (`whois ton-domaine.fr`) ? L'adresse de
contact du compte est-elle sur **un autre** domaine (sinon, domaine expiré = plus de rappels reçus) ?
**Corriger** — Activer les trois (2FA par application, verrou, renouvellement automatique),
renouveler pour plusieurs années les domaines importants, un rappel dans l'agenda un mois avant
l'échéance. Mêmes protections sur le compte Cloudflare ou l'hébergeur DNS.
**Notions** — DNS

---

### NET-06 · Les certificats se renouvellent seuls, et leur expiration est surveillée
`important` · `prod`

**Pourquoi** — Un certificat TLS a une date de fin. Expiré, le navigateur affiche une alerte plein
écran et les appels d'API échouent. Les durées raccourcissent : depuis le 15 mars 2026, un
certificat public dure 200 jours au plus, puis 100 jours en mars 2027 et 47 jours en mars 2029
(décision du CA/Browser Forum, qui fixe les règles des autorités de certification). Le
renouvellement à la main devient intenable. Et Let's Encrypt n'envoie plus d'e-mails de rappel
depuis juin 2025.
**Vérifier** — Qui renouvelle chaque certificat ? Plateformes (Vercel, Netlify, Cloudflare,
Render) : automatique. Serveur à soi : `certbot renew --dry-run`, ou Caddy. Date de fin actuelle :
`echo | openssl s_client -connect ton-domaine.fr:443 2>/dev/null | openssl x509 -noout -enddate`.
Un enregistrement CAA n'exclut-il pas l'autorité réellement utilisée (NET-12) ?
**Corriger** — Renouvellement automatique partout (ACME, le protocole qu'utilisent Let's Encrypt et
les plateformes). Une surveillance externe qui prévient avant l'échéance (la plupart des services
de surveillance de disponibilité le font : OBS). Certificats « Origin CA » de Cloudflare : noter
leur date de fin, lointaine mais réelle.
**Notions** — Certificats, TLS

---

### NET-07 · Hachage, chiffrement et encodage ne sont pas confondus
`important` · `tout`

**Pourquoi** — Trois opérations différentes, souvent mélangées :
| Opération | Réversible ? | Sert à | Exemples |
|---|---|---|---|
| Encodage | Oui, par n'importe qui, sans clé | Écrire des octets sous forme de texte | base64, hexadécimal, encodage d'URL |
| Hachage | Non, sens unique | Empreinte, intégrité, mots de passe | SHA-256 ; pour les mots de passe Argon2id ou bcrypt (IAM) ; HMAC = hachage avec clé, pour signer (API-04) |
| Chiffrement | Oui, avec la clé | Cacher un contenu à qui n'a pas la clé | AES-GCM, ChaCha20-Poly1305 |

Des données « protégées » en base64 se décodent en une seconde. Le contenu d'un JWT est seulement
encodé : tout le monde peut le lire, la signature empêche juste de le modifier. Un mot de passe
chiffré (donc réversible) au lieu d'être haché se retrouve en clair le jour où la clé fuit.
**Vérifier** — `btoa`, `Buffer.from(…).toString('base64')`, `base64.b64encode` appliqués à des
secrets ou à des données sensibles « pour les cacher » ; données sensibles dans un JWT ; mots de
passe en `md5`, `sha1` ou `sha256` simple, ou chiffrés de façon réversible.
**Corriger** — Choisir selon le besoin : retrouver la donnée plus tard → chiffrement (NET-08,
NET-09) ; vérifier sans jamais retrouver → hachage (mots de passe : Argon2id ou bcrypt, IAM) ;
transporter → encodage, sans aucune prétention de sécurité. Rien de secret dans un JWT.
**Notions** — Hachage et chiffrement

---

### NET-08 · Pas de cryptographie maison : bibliothèques éprouvées, AES-GCM, vrai hasard
`important` · `tout`

**Pourquoi** — La cryptographie échoue sur des détails invisibles : un vecteur d'initialisation
(IV, la valeur aléatoire qui rend chaque chiffrement unique) réutilisé, un mode sans contrôle
d'intégrité, un hasard prévisible. Un algorithme « maison » (XOR avec une clé, décalage de
lettres) se casse en minutes ; et même avec un bon algorithme, l'assembler soi-même mène à ces
erreurs.
**Vérifier** — Fonctions de chiffrement écrites à la main ; `crypto.createCipher` (sans IV, retirée
de Node) ; modes `ecb`, ou `cbc` sans authentification ; IV fixe ou réutilisé ; `Math.random()`
(ou `random` en Python) pour générer des jetons, des codes de vérification, des identifiants de
session, des mots de passe temporaires.
**Corriger** — Web Crypto (`crypto.subtle`, présent dans les navigateurs, Node, Deno et Workers)
ou libsodium ; en Python, la bibliothèque `cryptography`. Pour chiffrer : AES-256-GCM, qui chiffre
**et** détecte toute modification, avec un IV aléatoire de 12 octets **neuf à chaque message**,
rangé à côté du texte chiffré.
```ts
const iv = crypto.getRandomValues(new Uint8Array(12))
const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, new TextEncoder().encode(texte))
```
```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
nonce = os.urandom(12)
chiffre = AESGCM(cle).encrypt(nonce, donnees, None)
```
Hasard sûr : `crypto.randomUUID()`, `crypto.getRandomValues()` ; en Python, `secrets.token_urlsafe(32)`.
**Piège** — Un code à 6 chiffres tiré avec `Math.random()` « a l'air » aléatoire, mais
`Math.random()` n'est pas conçu pour la sécurité : ses tirages peuvent être prédits.
**Notions** — Hachage et chiffrement, AES-GCM

---

### NET-09 · Le chiffrement au repos est connu, et les champs très sensibles sont chiffrés en plus, avec une clé hors de la base
`important` · `bdd`

**Pourquoi** — Le chiffrement au repos (encryption at rest) protège les disques : un disque volé ou
mal recyclé ne livre rien. Supabase chiffre ainsi ses bases et ses sauvegardes, comme les grands
clouds leurs disques. Mais il ne protège pas de ce qui passe par la base allumée : une requête
SQL, une RLS mal réglée, un export, un accès au tableau de bord. Pour les données qui feraient de
vrais dégâts en cas de fuite, on chiffre en plus le champ lui-même, avec une clé rangée
**ailleurs** que dans la base : qui vole la base n'obtient que du charabia.
**Vérifier** — Quelles colonnes contiennent des jetons OAuth ou des clés d'API de services tiers
confiés par tes utilisateurs, des numéros d'identité, des données de santé, des IBAN ? Sont-elles
en clair ? La clé de chiffrement est-elle dans la même base (ce qui l'annule) ?
**Corriger** — Chiffrer côté serveur avant d'écrire (AES-GCM, NET-08), clé dans le coffre de
secrets de la plateforme (SEC-07), jamais dans la base. Sur Supabase, Vault stocke des secrets
chiffrés dont la clé n'est pas gardée dans la base (`vault.create_secret(…)`, lecture par la vue
`vault.decrypted_secrets`, à réserver aux rôles serveur). Ne chiffrer que ce qui le mérite : un
champ chiffré ne se recherche plus et ne se trie plus.
**Piège** — Tout chiffrer « par sécurité » : recherches impossibles, code alourdi, et la clé
devient un point de rupture (perdue = données perdues, NET-13).
**Notions** — Encryption at Rest, Gestion des clés, Hachage et chiffrement

---

### NET-10 · Seuls les ports nécessaires sont ouverts, et la base n'est pas ouverte à tout Internet
`important` · `prod`

**Pourquoi** — Chaque port ouvert est une porte. Une base Postgres, Redis ou MongoDB joignable
depuis Internet est trouvée en quelques heures par des robots qui balaient toutes les adresses et
essaient les mots de passe faibles ; des milliers de bases ont été vidées puis rançonnées ainsi.
Un pare-feu ne laisse passer que ce qui doit passer.
**Vérifier** — Serveur à soi : `ss -tlnp` (ce qui écoute, et sur quelle adresse : `0.0.0.0` = tout
le monde), `ufw status`, règles du fournisseur (groupes de sécurité). Ports 5432, 3306, 6379,
27017 et panneaux d'administration exposés. Docker publie ses ports (`ports: "5432:5432"`) en
contournant `ufw`. Supabase : les « Network Restrictions » de la base sont-elles réglées ?
**Corriger** — N'ouvrir que 80 et 443 (et SSH par clé, restreint à ton IP ou remplacé par un
tunnel). Base et cache n'écoutent que sur le réseau privé ou `127.0.0.1` (`ports:
"127.0.0.1:5432:5432"` en Docker Compose). Supabase : Network Restrictions limitées aux IP de tes
serveurs quand elles sont fixes ; impossible avec du serverless à IP changeante, alors mot de
passe long et unique, et SSL imposé (NET-04). Origine derrière Cloudflare : n'accepter que les
plages IP de Cloudflare, ou Cloudflare Tunnel (API-14).
**Notions** — Pare-feu

---

### NET-11 · Le domaine qui envoie des e-mails a SPF, DKIM et DMARC
`important` · `prod`

**Pourquoi** — Sans eux, tes e-mails (confirmation d'inscription, mot de passe oublié, factures)
finissent en spam ou sont refusés, et n'importe qui peut envoyer un e-mail « de » ton domaine pour
piéger tes clients. SPF liste les serveurs autorisés à envoyer pour le domaine ; DKIM signe chaque
e-mail avec une clé publiée dans le DNS ; DMARC dit aux messageries quoi faire d'un e-mail qui
échoue (rien, spam, rejet) et t'envoie des rapports. Gmail exige SPF ou DKIM de tout expéditeur, et
les trois au-delà de 5 000 e-mails par jour vers ses utilisateurs ; Yahoo et Outlook ont des
exigences proches.
**Vérifier** — `dig txt ton-domaine.fr` (un seul enregistrement `v=spf1`), `dig txt
_dmarc.ton-domaine.fr`, clé DKIM publiée et validée dans le tableau de bord du service d'envoi
(Resend, Postmark, Brevo, Google Workspace…). Dans Gmail, « Afficher l'original » d'un e-mail reçu :
SPF, DKIM et DMARC doivent indiquer `PASS`.
**Corriger** —
```dns
ton-domaine.fr.         TXT  "v=spf1 include:_spf.google.com ~all"   ; + l'include de ton service d'envoi
_dmarc.ton-domaine.fr.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@ton-domaine.fr"
```
DMARC commence en `p=none` (observation), puis passe à `quarantine`, puis `reject` une fois les
rapports propres. SPF : un seul enregistrement, 10 recherches DNS au plus (chaque `include` en
compte). Les envois automatiques partent d'un sous-domaine (`envoi.ton-domaine.fr`) pour protéger
la réputation du domaine principal. Un domaine qui n'envoie **aucun** e-mail : `v=spf1 -all` et
DMARC `p=reject`, contre l'usurpation.
**Notions** — SPF, DKIM, DMARC, DNS

---

### NET-12 · Le DNS est propre : TTL adaptés, CAA, DNSSEC, aucun sous-domaine orphelin
`conseillé` · `prod`

**Pourquoi** — Le DNS est l'annuaire d'Internet : il traduit `ton-domaine.fr` en adresse de
serveur. Le TTL (durée pendant laquelle les résolveurs gardent une réponse en cache) décide de la
vitesse d'un changement. L'enregistrement CAA liste les autorités de certification autorisées à
émettre un certificat pour ton domaine. DNSSEC signe les réponses DNS, contre les fausses réponses
qui envoient tes visiteurs vers un faux site. Et un sous-domaine qui pointe encore vers un service
abandonné (Heroku, GitHub Pages, stockage cloud) peut être réclamé par un inconnu, qui sert alors
son contenu sous ton nom (prise de contrôle de sous-domaine).
**Vérifier** — `dig ton-domaine.fr` (TTL), `dig caa ton-domaine.fr`, DNSSEC avec un testeur en
ligne (dnsviz.net). La liste des enregistrements : chacun pointe-t-il vers un service encore à toi ?
**Corriger** — TTL court (300 s) quelques jours avant une migration, plus long ensuite ; les
enregistrements proxifiés par Cloudflare sont en « Auto ». CAA : n'autoriser que les autorités
utilisées (`0 issue "letsencrypt.org"`) ; avec Cloudflare et son certificat universel, Cloudflare
ajoute lui-même les autorités dont il a besoin dès qu'un CAA existe. DNSSEC : un interrupteur chez
Cloudflare (DNS → Settings), puis l'enregistrement DS à publier chez le registrar (automatique avec
Cloudflare Registrar). Supprimer les enregistrements des services abandonnés.
**Piège** — Un CAA qui oublie l'autorité de ta plateforme (Vercel, Netlify) : le prochain
renouvellement échoue sans bruit, et le site tombe à l'expiration du certificat (NET-06).
**Notions** — DNS, CAA, DNSSEC, Certificats

---

### NET-13 · Les clés de chiffrement sont gérées : rangées à part, identifiées, remplaçables, sauvegardées
`conseillé` · `prod`

**Pourquoi** — Le chiffrement ne vaut que ce que vaut la gestion de sa clé. Une clé dans le code
est publiée (SEC-01) ; une clé sans version ne peut jamais changer sans tout casser ; une clé perdue
rend les données illisibles pour toujours, sauvegardes comprises.
**Vérifier** — Où est la clé ? Peut-on la remplacer (rotation) sans tout rechiffrer d'un coup ?
Existe-t-il une copie sûre hors de la plateforme principale ? Chaque valeur chiffrée dit-elle avec
quelle clé elle l'a été ?
**Corriger** — Préfixer chaque valeur chiffrée par l'identifiant de sa clé (`v1:iv:texte`). Pour
changer de clé : ajouter `v2`, chiffrer le neuf avec `v2`, rechiffrer l'ancien petit à petit, puis
retirer `v1`. Une copie de la clé dans un gestionnaire de secrets séparé (REP). À plus grande
échelle (`échelle`), un service de gestion de clés (KMS : AWS KMS, Google Cloud KMS) et le
chiffrement d'enveloppe : une clé par donnée, elle-même chiffrée par une clé maîtresse qui ne
quitte jamais le KMS.
**Notions** — Gestion des clés

---

### NET-14 · Le temps réel utilise le protocole le plus simple qui suffit
`conseillé` · `web`

**Pourquoi** — HTTP classique, c'est « je demande, tu réponds ». Pour que le serveur pousse des
nouvelles (réponse d'IA qui s'écrit, notification, chat), il existe trois techniques, de la plus
simple à la plus lourde. Prendre trop gros (des WebSockets pour afficher une barre de progression)
ajoute un serveur qui garde un état, des reconnexions à gérer et des coûts.
**Vérifier** — Quel est le vrai besoin : le serveur parle seul (un flux), les deux parlent en
continu, ou une mise à jour de temps en temps ? Le choix actuel correspond-il ?
**Corriger** —
| Besoin | Choix | Pourquoi |
|---|---|---|
| Le serveur envoie un flux : réponse d'IA mot à mot, progression, notifications | Server-Sent Events (SSE) | Du HTTP ordinaire qui reste ouvert ; passe les proxys et les CDN ; `EventSource` se reconnecte seul. C'est ce qu'utilisent les API d'OpenAI et d'Anthropic pour streamer (NET-16) |
| Échanges fréquents dans les deux sens : chat, multijoueur, édition à plusieurs | WebSockets | Une connexion permanente, bidirectionnelle (NET-15) ; ou un service géré : Supabase Realtime, Durable Objects de Cloudflare |
| Mises à jour rares, ou réseau qui bloque le reste | Long Polling | Le client demande, le serveur répond dès qu'il a du neuf (ou après un délai), le client redemande : un repli robuste |
| Rien d'urgent | Rafraîchir à l'action de l'utilisateur, ou toutes les N minutes | Le plus simple de tous |

**Piège** — Interroger le serveur chaque seconde pour une donnée qui change deux fois par jour :
des dizaines de milliers de requêtes inutiles, facturées.
**Notions** — Server-Sent Events, WebSockets, Long Polling

---

### NET-15 · Une connexion WebSocket est authentifiée, vérifie son origine et survit aux coupures
`important` · `web`

**Pourquoi** — Une WebSocket est une connexion qui reste ouverte, dans les deux sens. Elle échappe
à une partie des protections habituelles : l'API WebSocket du navigateur ne peut pas envoyer
d'en-tête `Authorization`, et CORS ne s'y applique pas. Un site malveillant peut donc ouvrir une
WebSocket vers ton serveur avec les cookies de ta victime si tu ne vérifies pas l'en-tête `Origin`
(Cross-Site WebSocket Hijacking). Et une connexion permanente finit toujours par couper (réseau
mobile, mise en veille, redéploiement).
**Vérifier** — L'utilisateur est-il authentifié à l'ouverture, et ses droits revérifiés pour chaque
canal ou salon ? `Origin` est-il comparé à une liste autorisée ? Le client se reconnecte-t-il avec
backoff et jitter (API-08) ? Un battement de cœur (heartbeat : ping/pong régulier) repère-t-il les
connexions mortes ? Taille et fréquence des messages sont-elles limitées (API-01, API-10) ?
**Corriger** — Authentifier à la connexion : cookie de session (avec vérification d'`Origin`), ou
ticket à usage unique et de courte durée, obtenu par une requête HTTP authentifiée puis présenté à
l'ouverture. Où héberger :
| Plateforme | Ce qu'il faut savoir |
|---|---|
| Cloudflare | Durable Objects avec l'API d'hibernation : la connexion reste ouverte sans facturer l'attente |
| Supabase Realtime | Broadcast et Presence en canaux privés, autorisés par des policies RLS sur `realtime.messages` ; Postgres Changes respecte la RLS |
| Vercel | Les fonctions acceptent les WebSockets depuis 2026, mais une connexion reste liée à une instance et se coupe à la durée maximale de la fonction ; salons et présence vivent ailleurs (Redis) |
| Serveur qui dure | `ws` (Node), Socket.IO, FastAPI |

**Piège** — Un jeton de longue durée dans l'URL de connexion (`wss://…?token=…`) : il finit dans
les journaux (SEC-11). Si l'URL doit porter quelque chose, un ticket à usage unique valable
quelques secondes.
**Notions** — WebSockets

---

### NET-16 · Un flux SSE est servi correctement et s'arrête quand le client part
`conseillé` · `web`

**Pourquoi** — SSE est simple, mais quelques détails cassent le flux : un proxy qui garde la
réponse en mémoire tampon et la livre d'un bloc à la fin (l'IA « ne streame plus »), une connexion
silencieuse coupée au bout de quelques dizaines de secondes, ou une génération d'IA qui continue,
et se facture, alors que l'utilisateur a fermé l'onglet.
**Vérifier** — En-têtes de la réponse ; mise en tampon par nginx ou un autre proxy ; ce qui se
passe côté serveur quand le client se déconnecte ; l'authentification (`EventSource` ne permet pas
d'ajouter un en-tête `Authorization`).
**Corriger** —
```ts
return new Response(flux, { headers: {
  'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
  'X-Accel-Buffering': 'no' } })   // demande à nginx de ne pas mettre en tampon
```
Arrêter la génération quand le client part : passer le signal d'annulation de la requête entrante
(`request.signal`, à tester sur ta plateforme) à l'appel d'IA. Envoyer un commentaire (`: ping`)
toutes les 15 à 30 secondes pour garder la connexion vivante. Authentifier par cookie, ou lire le
flux avec `fetch` et `response.body.getReader()`, qui accepte les en-têtes. Pour reprendre après
une coupure, numéroter les événements (`id:`) : le navigateur renvoie `Last-Event-ID` en se
reconnectant.
**Piège** — En HTTP/1.1, un navigateur ouvre environ 6 connexions par domaine : six onglets avec
chacun son flux SSE bloquent le reste du site. HTTP/2 lève cette limite (NET-17).
**Notions** — Server-Sent Events, HTTP/2 & HTTP/3

---

### NET-17 · HTTP/2 et HTTP/3 sont activés au CDN ; TCP contre UDP, c'est de la culture utile
`conseillé` · `prod`

**Pourquoi** — TCP, le transport le plus courant d'Internet, garantit que tout arrive, dans
l'ordre, quitte à attendre ce qui s'est perdu. UDP envoie sans garantie, plus vite : bon pour la
voix, la vidéo, les jeux. HTTP/1.1 traite une requête à la fois par connexion ; HTTP/2 en fait
passer beaucoup en parallèle sur une seule connexion TCP ; HTTP/3 remplace TCP par QUIC, construit
sur UDP, qui supporte mieux les réseaux mobiles qui perdent des paquets ou changent d'antenne. Pour
un site, tout cela se règle au CDN, sans une ligne de code.
**Vérifier** — Outils de développement → Réseau → colonne « Protocole » (`h2`, `h3`). Cloudflare :
Speed → Settings → Protocol Optimization → HTTP/3. Les hébergeurs (Vercel, Netlify, Cloudflare
Pages) servent déjà au moins HTTP/2.
**Corriger** — Activer HTTP/3 au CDN quand l'option existe. Conséquence pratique : avec HTTP/2,
servir plusieurs petits fichiers coûte beaucoup moins cher qu'avant, et les vieilles astuces
(domaines multiples pour paralléliser, images regroupées en « sprites ») ne servent plus (PERF).
Rien d'autre à faire.
**Notions** — TCP vs UDP, HTTP/2 & HTTP/3

---

### NET-18 · gRPC seulement entre services, pas pour le navigateur sans proxy
`conseillé` · `échelle`

**Pourquoi** — gRPC est un protocole d'appel entre programmes, créé par Google : messages binaires
compacts (Protocol Buffers), contrat typé partagé entre les services, flux dans les deux sens, le
tout sur HTTP/2. Excellent entre microservices qui s'appellent beaucoup. Mais un navigateur ne sait
pas le parler directement : il faut gRPC-Web avec un proxy (Envoy), ou le protocole Connect. Une
machinerie lourde pour un projet qui a une seule API.
**Vérifier** — Y a-t-il plusieurs services internes, peut-être en plusieurs langages, qui
s'appellent intensément et dont les contrats doivent rester synchronisés ? Sinon, gRPC n'a pas de
raison d'être.
**Corriger** — Pour un navigateur, une app mobile, un partenaire : REST et JSON (ou tRPC entre un
front et un back TypeScript du même dépôt). gRPC quand plusieurs services internes s'appellent
beaucoup, et seulement là. Entre services aussi, chiffrer : TLS, voire TLS mutuel (chaque côté
présente son certificat).
**Notions** — gRPC, HTTP/2 & HTTP/3
