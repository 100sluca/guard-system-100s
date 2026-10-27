# Les notions

Chaque notion en une ou deux phrases simples, rangée dans le domaine qui la met en pratique, avec
les contrôles du référentiel (`references/`) où elle sert. Pour une explication plus longue, avec
un exemple tiré du projet ouvert : `/guard-system-100s -notion <nom>`.

<!-- SECTIONS -->

## 01 · Secrets et configuration (SEC)

- **Configuration (12-factor)** — Le même code tourne partout (poste de dev, préversion, prod) ; seul l'environnement change, par des variables. Le principe vient du manifeste « The Twelve-Factor App ». → SEC-04, SEC-12
- **Push protection** — Le contrôle de GitHub qui refuse un `git push` contenant une clé reconnue, avant qu'elle n'arrive sur le serveur. Gratuit sur les dépôts publics. → SEC-16
- **Rotation des secrets** — Remplacer régulièrement une clé par une neuve, en gardant les deux valides le temps de la bascule. Une rotation déjà répétée se fait sans panique le jour d'une fuite. → SEC-06, SEC-10
- **Secrets Management** — L'art de ranger les secrets (clés, jetons, mots de passe) hors du code : dans l'environnement du serveur, le coffre de la plateforme ou un gestionnaire dédié, avec des droits minimaux et une rotation prévue. → SEC-01 à SEC-16

## 02 · Identité, connexion, droits d'accès (IAM)

- **Aléa cryptographique** — Un nombre tiré au hasard de façon imprévisible, même pour quelqu'un qui a vu les tirages précédents (`crypto.randomUUID`, `crypto.getRandomValues`, `secrets` en Python). `Math.random` n'en est pas un : c'est un dé truqué dont on peut deviner les prochains lancers. → IAM-08
- **Authentification et autorisation** — L'authentification répond à « qui es-tu ? » (la connexion) ; l'autorisation répond à « as-tu le droit, sur cette donnée-là ? ». Montrer son badge à l'entrée de l'immeuble ne donne pas la clé de tous les bureaux. → IAM-01, IAM-02, IAM-04, IAM-09
- **Brute force** — Essayer des milliers de mots de passe sur un même compte jusqu'à trouver le bon. On s'en protège en limitant et en ralentissant les essais. → IAM-11
- **Comptes de service** — Une identité pour un programme et non pour une personne : compte de service Google Cloud, clé `service_role` de Supabase, bot, script Apps Script. Souvent puissant et sans surveillance, il doit avoir le strict nécessaire. → IAM-16
- **Credential stuffing** — Essayer sur ton site des couples e-mail + mot de passe volés ailleurs, en pariant sur la réutilisation des mots de passe. Se combat par la limitation des essais, le refus des mots de passe ayant fuité et la MFA. → IAM-11
- **Énumération de comptes** — Deviner qui est inscrit à partir de réponses différentes (« compte inconnu » contre « mot de passe incorrect ») ou d'un temps de réponse. Fournit des cibles, et révèle parfois à lui seul une information sensible. → IAM-19
- **Hachage de mot de passe** — Transformer un mot de passe en empreinte non réversible avec une fonction volontairement lente et salée (argon2id, bcrypt). md5 ou sha256 sont trop rapides : une carte graphique en teste des milliards par seconde. → IAM-07, IAM-11
- **IAM** — Identity and Access Management : l'ensemble de ce qui décide qui est qui et qui peut faire quoi (comptes, rôles, clés, comptes de service). Au niveau d'un projet, c'est la liste des badges et des portes qu'ils ouvrent. → IAM-09, IAM-15, IAM-16, IAM-20, SEC-08
- **IDOR** — Insecure Direct Object Reference (appelée BOLA dans l'OWASP API Top 10, où elle est n° 1) : l'API donne accès à un objet sur la seule base de son identifiant, sans vérifier qu'il appartient au demandeur. Changer `1042` en `1043` dans l'URL suffit à lire la facture d'un autre. → IAM-01
- **JWT** — JSON Web Token : un badge signé qui contient l'identité (`sub`), des droits et une date d'expiration (`exp`). Tout le monde peut le lire ; seule la vérification de sa signature prouve qu'il est authentique. → IAM-04, IAM-06, IAM-12
- **JWT Rotation** — Changer régulièrement la clé qui signe les JWT, en gardant l'ancienne valide le temps de la transition (les clés sont identifiées par un `kid`). Permet de remplacer une clé compromise sans déconnecter tout le monde. → IAM-06, SEC-10
- **Magic links** — Liens de connexion envoyés par e-mail, qui remplacent le mot de passe. La boîte mail devient la clé du compte : lien court, à usage unique, et attention aux scanners de messagerie qui le consomment. → IAM-18
- **MFA** — Authentification multifacteur : une seconde preuve en plus du mot de passe (code d'application, clé physique, passkey). Un mot de passe volé ne suffit plus à entrer. → IAM-10, IAM-15, IAM-17
- **OAuth** — Protocole qui permet à une application d'obtenir un accès délégué à un compte chez un autre service (« autoriser l'app à lire ton Drive »), sans recevoir le mot de passe. Un badge visiteur limité, plutôt que la clé de la maison. → IAM-14
- **OIDC** — OpenID Connect : la couche d'identité ajoutée à OAuth, qui dit « qui est connecté » par un jeton d'identité ; c'est ce qu'il y a derrière « Se connecter avec Google ». L'identité stable est le couple `iss` + `sub`, pas l'e-mail. → IAM-14
- **Passkeys** — Clés de connexion (standard WebAuthn) gardées dans le téléphone ou le gestionnaire de mots de passe, qui remplacent le mot de passe. Liées au nom de domaine, elles ne fonctionnent pas sur un site d'hameçonnage. → IAM-17
- **PKCE** — Proof Key for Code Exchange : dans un flux OAuth, le client prouve au moment d'échanger le code qu'il est bien celui qui a lancé la demande. Un code intercepté devient inutilisable, comme un ticket de vestiaire qui ne vaut qu'avec sa moitié. → IAM-14, IAM-18
- **Principe du moindre privilège** — Chaque personne, clé, rôle, outil ou programme reçoit exactement les droits dont il a besoin, rien de plus. Si quelque chose fuit ou est manipulé, les dégâts restent petits : le livreur a la clé du hall, pas celle de l'appartement. → IAM-02, IAM-03, IAM-05, IAM-10, IAM-15, IAM-16, IAM-20, SEC-08, SEC-15, LIV-02, WEB-14, IA-06, IA-12
- **RBAC** — Role-Based Access Control : les droits sont donnés à des rôles (admin, éditeur, membre) et chaque utilisateur reçoit un rôle. Simple, et suffisant tant que les règles ne deviennent pas un graphe de partages. → IAM-05, IAM-10, IAM-20
- **Réinitialisation de mot de passe** — Le parcours « mot de passe oublié », porte d'entrée sans mot de passe : jeton aléatoire, court, à usage unique, lien construit depuis la configuration et non depuis l'en-tête `Host`. → IAM-13
- **Révocation** — Rendre invalide avant son terme un jeton, une session ou une clé (déconnexion, compte volé, départ d'un collaborateur). Un JWT ne se révoque pas : seule une expiration courte limite ce qui reste. → IAM-06, IAM-12, IAM-13
- **Sessions** — La preuve, gardée entre deux requêtes, que l'utilisateur s'est connecté (cookie ou jeton). Elle doit expirer, changer à la connexion et pouvoir être révoquée côté serveur. → IAM-04, IAM-12, WEB-12

## 03 · Entrées hostiles et injections (INJ)

- **Désérialisation non sûre** — Reconstruire un objet à partir d'octets avec un format qui sait créer n'importe quel objet, y compris un qui lance une commande (`pickle`, `yaml.load` complet). Ouvrir un tel fichier reçu, c'est exécuter le code de l'expéditeur. → INJ-09
- **Encodage de sortie** — Transformer une donnée pour qu'elle reste une donnée là où elle atterrit : échappement HTML, paramètre SQL, apostrophe devant une formule de tableur. On ne colle jamais une donnée dans un langage, on la passe à côté. → INJ-17, WEB-01, WEB-02
- **Injection d'en-têtes** — Abuser des en-têtes HTTP : faire confiance à `Host` ou `X-Forwarded-For` écrits par le client, ou glisser un retour à la ligne pour ajouter un en-tête (un `Bcc:` dans un e-mail). → IAM-13, INJ-13
- **Injection de code** — Faire exécuter comme programme un texte venu de l'extérieur (`eval`, `new Function`, `exec`). L'attaquant écrit alors directement le code de ton serveur. → INJ-03
- **Injection de commande** — Glisser une commande système dans une chaîne passée à un shell (`exec("convert " + fichier)`). Un nom de fichier `a.png; rm -rf /` exécute la seconde commande. → INJ-04
- **Injection de formule** — Aussi appelée CSV injection : un texte qui commence par `=`, `+`, `-` ou `@` devient une formule quand l'export s'ouvre dans un tableur (lien piégé, envoi de cellules ailleurs). Se neutralise par une apostrophe devant. → INJ-17
- **Log injection** — Glisser des retours à la ligne ou des caractères de contrôle dans une entrée pour écrire de fausses lignes dans les journaux, ou piéger l'outil qui les affiche. Les journaux structurés en JSON l'évitent. → INJ-19
- **Mass assignment** — Enregistrer en base tout l'objet reçu (`update(req.body)`), ce qui laisse l'utilisateur ajouter `"role": "admin"` à sa requête. On choisit explicitement les champs modifiables. → INJ-06
- **NoSQL injection** — Envoyer un objet là où le code attend une valeur, pour changer le sens d'un filtre MongoDB : `{"password": {"$ne": null}}` veut dire « n'importe quel mot de passe ». → INJ-11
- **Open redirect** — Un paramètre de redirection (`?next=`) qui accepte n'importe quelle adresse : un lien qui commence par ton vrai domaine envoie vers un faux site. → INJ-12
- **Path traversal** — Utiliser `../` dans un nom de fichier pour remonter l'arborescence et lire ou écrire hors du dossier prévu (`?fichier=../../.env`). → INJ-07, INJ-08, INJ-16
- **Prototype pollution** — En JavaScript, écrire par une clé `__proto__` sur l'objet dont héritent presque tous les autres, en passant par une fusion d'objets venus de l'extérieur. Un `isAdmin: true` ajouté ainsi apparaît sur tous les objets. → INJ-14
- **ReDoS** — Déni de service par expression régulière : un motif mal construit met un temps qui explose avec la longueur du texte, et une seule requête piégée fige un serveur Node.js. → INJ-15
- **SQL Injection** — Une donnée collée dans une requête SQL en change le sens (`' OR '1'='1` renvoie toute la table). Les requêtes paramétrées l'éliminent. → INJ-02, INJ-20
- **SSRF** — Server-Side Request Forgery : faire faire à ton serveur une requête vers une adresse choisie par l'attaquant, souvent interne (`169.254.169.254`, `localhost`, IP privées). Concerne toute fonction qui « récupère une URL ». → INJ-05, INJ-18, INJ-20
- **Template injection** — L'utilisateur écrit le modèle (Jinja2, Nunjucks, EJS, HtmlService) au lieu d'en remplir les variables, et donc du code : `{{ 7*7 }}` affiche 49, et pire avec certains moteurs. → INJ-10
- **Upload de fichiers** — Accepter des fichiers envoyés par des utilisateurs : type vérifié par le contenu, taille maximale, nom regénéré, stockage hors du dossier servi, jamais d'exécution, SVG traité comme un vecteur de XSS. → INJ-07, INJ-20, WEB-18
- **Validation des entrées** — Vérifier côté serveur, avec un schéma (zod, valibot, pydantic), que chaque entrée a le type, la longueur et le format attendus, et refuser le reste. La validation du navigateur n'est que du confort. → INJ-01, INJ-06, INJ-11
- **XXE** — XML External Entity : un document XML déclare une entité qui va chercher un fichier du serveur ou une URL interne, et l'analyseur la résout. Touche aussi SVG, DOCX, XLSX et SAML. → INJ-18
- **Zip slip** — Une archive contient une entrée nommée `../../app/server.js` qui, décompressée sans contrôle, écrit hors du dossier prévu. Cousine de la « bombe zip », minuscule compressée et énorme décompressée. → INJ-16

## 04 · Sécurité côté navigateur (WEB)

- **Cache partagé** — Les copies de réponses qu'un CDN ou un proxy garde pour les resservir à tous les visiteurs. Une page personnelle qui y entre est montrée au visiteur suivant, comme une lettre glissée dans la mauvaise boîte. → WEB-12
- **Clickjacking** — Afficher ton site dans un cadre invisible posé sur un faux bouton, pour que l'utilisateur clique chez toi sans le savoir. Se bloque avec `frame-ancestors` ou `X-Frame-Options`. → WEB-05, WEB-10
- **Cookies** — Petites valeurs que le navigateur garde et renvoie automatiquement au site à chaque requête, souvent la clé de session. Leurs attributs `HttpOnly`, `Secure` et `SameSite` décident qui peut les lire et quand ils partent. → WEB-04, WEB-07, WEB-09
- **CORS** — Le mécanisme qui permet à un serveur d'autoriser certains autres sites à lire ses réponses depuis un navigateur. Il assouplit la same-origin policy ; il ne protège pas le serveur, car `curl` l'ignore. → WEB-06, WEB-07
- **CSP** — Content Security Policy : un en-tête qui dit au navigateur quels scripts, styles, images et cadres ta page a le droit de charger. La ceinture de sécurité qui retient un XSS passé malgré l'échappement. → WEB-01, WEB-08, WEB-11, WEB-19, IA-09
- **CSRF** — Cross-Site Request Forgery : un autre site fait envoyer à ton serveur, par le navigateur de la victime et avec ses cookies, une action qu'elle n'a pas voulue. Ne concerne que l'auth par cookie ; se bloque par `SameSite` et la vérification de l'origine. → WEB-04, WEB-07
- **Extensions de navigateur** — Petits programmes ajoutés au navigateur, capables de lire et modifier les pages visitées. Leur `manifest.json` déclare leurs permissions, à garder minimales (Manifest V3). → WEB-14, WEB-15
- **Mixed content** — Contenu mixte : une page HTTPS qui charge un élément en HTTP, qui voyage alors en clair et peut être modifié en route. Les navigateurs le bloquent ou le corrigent, souvent en cassant la page. → WEB-17
- **Mode debug** — Réglage de développement qui affiche les traces d'erreur, les requêtes et parfois une console (Flask `debug=True`, Django `DEBUG`). En prod, il donne ces informations et ces pouvoirs à tous les visiteurs. → WEB-03
- **postMessage** — Fonction qui permet à deux fenêtres de sites différents (iframe, popup, extension) de s'échanger des messages. Il faut vérifier l'origine à la réception et viser un destinataire précis à l'envoi. → WEB-13, WEB-15
- **Same-origin policy** — Politique de même origine : la règle de base du navigateur qui empêche une page d'un site de lire les données d'un autre site. CORS, `postMessage` et les iframes `sandbox` sont des façons contrôlées de l'assouplir ou de la renforcer. → WEB-06, WEB-13, WEB-18
- **Scripts tiers** — Scripts chargés depuis le domaine d'un autre (statistiques, chat, publicité, CDN, Google Tag Manager). Ils ont tous les pouvoirs de ton propre code ; si leur fournisseur est compromis, tes visiteurs le sont. → WEB-11
- **Security headers** — En-têtes HTTP qui activent des protections du navigateur : HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP. Quelques lignes de configuration, posées selon la stack (`next.config`, `vercel.json`, `_headers`, `helmet`, `secureHeaders`). → WEB-05, WEB-08, WEB-10
- **Source maps** — Fichiers `.map` qui relient le JavaScript compressé au code d'origine, pour déboguer. Publiés en prod, ils livrent ton code source lisible, commentaires compris. → WEB-16, OBS-08
- **SRI** — Subresource Integrity : l'attribut `integrity` d'un `<script>` donne l'empreinte attendue du fichier, et le navigateur le refuse s'il a changé. Un sceau sur le colis, pour les fichiers tiers figés et versionnés. → WEB-11
- **Stockage des jetons** — L'endroit où le navigateur garde le jeton de connexion. `localStorage` et les cookies sans `HttpOnly` sont lisibles par tout script de la page, donc par un XSS. → WEB-09
- **XSS** — Cross-site scripting : un attaquant fait exécuter son script dans ta page, chez tes visiteurs, souvent par du HTML affiché sans échappement. Le script a alors tous les pouvoirs de l'utilisateur connecté. → INJ-07, WEB-01, WEB-02, WEB-08, WEB-09, WEB-15, WEB-18, WEB-19

## 05 · API, abus, appels sortants et coûts (API)

- **API Gateways** — Une porte d'entrée unique placée devant plusieurs services, qui centralise les vérifications d'accès, le rate limiting, les journaux et l'aiguillage. C'est l'accueil d'un grand immeuble de bureaux : utile avec beaucoup de services, superflu pour une seule application. → API-18
- **API Versioning** — Garder plusieurs versions d'une API (`/v1/`, `/v2/`) pour que les clients qu'on ne met pas à jour soi-même (app mobile, extension, partenaire) ne cassent pas quand la forme des réponses change. → API-17
- **Circuit breaker** — Un disjoncteur logiciel : après trop d'échecs vers un service, on arrête de l'appeler un moment et on répond tout de suite par un repli, puis on reteste de temps en temps. La panne d'un fournisseur ne devient pas la tienne. → API-16
- **Cost Optimization** — Payer moins pour le même service : cache des réponses coûteuses, appels regroupés, le modèle d'IA le moins cher qui suffit, plafonds et quotas. → API-07, API-15
- **DDoS Protection** — La défense contre le déni de service distribué, où des milliers de machines noient un serveur de requêtes. Elle se fait au niveau d'un CDN mondial (Cloudflare, Vercel), jamais dans le code de l'application. → API-14
- **Denial of wallet** — Une attaque qui ne fait pas tomber le service mais fait exploser la facture : un robot appelle en boucle ta route d'IA, de SMS ou d'e-mail payée à l'usage. → API-01, API-07, API-10, API-15, IA-05, IA-10
- **Exponential Backoff** — Attendre de plus en plus longtemps entre deux essais (0,5 s, 1 s, 2 s, 4 s…), pour laisser au service le temps de se remettre au lieu de le marteler. → API-08, ASY-06, BDD-18, NET-15
- **Idempotency** — Une opération est idempotente si la répéter donne le même résultat que la faire une fois, comme appuyer deux fois sur le bouton d'appel d'un ascenseur. C'est ce qui rend sans danger les retries et les webhooks reçus en double. → API-05, API-08, API-09
- **Jitter** — Une part de hasard ajoutée au temps d'attente entre deux essais, pour que mille clients en panne ne reviennent pas tous à la même seconde. → API-08, NET-15
- **Pagination** — Découper une liste en pages au lieu de tout renvoyer d'un coup. La pagination par curseur (« les 20 après celle-ci ») reste rapide et stable même très loin dans la liste. → API-11, BDD-16
- **Problem Details** — Le format d'erreur standard des API HTTP (RFC 9457, `application/problem+json`) : `type`, `title`, `status`, `detail`. Un seul format pour toutes les routes, sans détail interne. → API-12
- **Protection anti-robots** — Un défi (Cloudflare Turnstile, hCaptcha, reCAPTCHA) ou un piège (champ « pot de miel ») qui distingue un humain d'un robot sur les formulaires publics, toujours vérifié par le serveur. → API-13
- **Rate Limiting** — Plafonner le nombre de requêtes qu'un même client (IP ou utilisateur) peut faire dans une fenêtre de temps, comme un guichet qui ne sert qu'un ticket par minute et par personne. Le compteur doit être partagé entre instances ; au-delà, le serveur répond `429`. → API-01, API-02, API-13, API-15, IA-05, IA-13
- **Retries** — Retenter automatiquement une requête qui a échoué. Utile pour les erreurs passagères (réseau, `429`, `503`), inutile voire dangereux pour les autres, et toujours avec un nombre maximum d'essais. → API-08, BDD-18
- **Timeouts** — Un délai au-delà duquel on abandonne un appel. Sans lui, un service tiers lent bloque tes requêtes, puis tout ton site. → API-03, API-16
- **WAF** — Web Application Firewall : un pare-feu qui inspecte les requêtes web et bloque celles qui ressemblent à des attaques connues (injections, scanners, robots), fourni par le CDN. → API-14
- **Webhooks** — Une URL de ton serveur qu'un service externe appelle pour te prévenir d'un événement (« paiement réussi »). Comme elle est publique, on vérifie sa signature, on traite les doublons et on répond vite. → API-04, API-05, API-06

## 06 · Base de données et intégrité (BDD)

- **ACID** — Les quatre garanties d'une transaction : Atomicité (tout ou rien), Cohérence (les règles restent vraies), Isolation (les opérations simultanées ne se mélangent pas), Durabilité (ce qui est validé survit à une panne). C'est ce qui empêche un virement de débiter un compte sans créditer l'autre. → BDD-06
- **Connection Pooling** — Un intermédiaire qui garde quelques vraies connexions à la base et les prête à tour de rôle aux requêtes, comme un parc de vélos partagés. Indispensable en serverless, où des centaines d'instances satureraient sinon la base. → BDD-09
- **Contraintes** — Des règles écrites dans la base elle-même (`not null`, `unique`, clé étrangère, `check`) qu'aucune écriture ne peut violer, ni deux requêtes simultanées, ni un script qui contourne ton code. → BDD-05, BDD-08, BDD-19
- **Database Indexing** — Créer des index, l'équivalent de l'index d'un livre : la base saute directement aux bonnes lignes au lieu de tout lire. Chaque index ralentit un peu les écritures, donc on n'indexe que ce qui sert. → BDD-04, BDD-11, BDD-13, BDD-15, BDD-16
- **Database Migrations** — Des fichiers versionnés qui décrivent chaque changement de schéma (« ajouter la colonne téléphone »), appliqués dans l'ordre. Ils permettent de recréer la base à l'identique et de savoir qui a changé quoi. → BDD-10, BDD-17
- **Deadlocks** — Un interblocage : deux transactions attendent chacune un verrou que tient l'autre, comme deux voitures face à face sur un pont étroit. Postgres en annule une ; on l'évite en verrouillant toujours dans le même ordre. → BDD-18
- **EXPLAIN** — La commande SQL qui montre comment la base compte exécuter une requête ; `EXPLAIN ANALYZE` l'exécute et donne le temps réel de chaque étape. C'est le point de départ de toute optimisation. → BDD-15
- **N+1 Queries** — Une requête pour la liste, puis une par élément : 50 articles et leurs auteurs font 51 allers-retours au lieu d'un. Invisible en local, lent en prod. → BDD-12
- **Niveaux d'isolation** — Le réglage qui dit ce qu'une transaction voit des autres transactions en cours. Postgres est par défaut en `read committed`, qui n'empêche pas à lui seul les race conditions ; `serializable` les empêche, au prix d'échecs à retenter. → BDD-07
- **Optimistic Locking** — Un verrou « optimiste » : on ne bloque personne, mais chaque ligne a un numéro de version, et une écriture échoue si quelqu'un est passé entre-temps. Idéal quand les conflits sont rares (édition d'un document). → BDD-07
- **Partitioning** — Découper une très grande table en morceaux (par mois, par client) à l'intérieur d'une même base, pour accélérer certaines requêtes et effacer d'un bloc les vieilles données. → BDD-20
- **Pessimistic Locking** — Un verrou « pessimiste » : on verrouille la ligne avant de la modifier (`select … for update`) et les autres attendent leur tour. Sûr pour les ressources très disputées, mais fait patienter. → BDD-07, BDD-18
- **Query Optimization** — Rendre une requête plus rapide à partir de son plan d'exécution : ajouter le bon index, éviter le N+1, ne lire que les colonnes utiles. On mesure avant et après. → BDD-11, BDD-12, BDD-13, BDD-15
- **Race Conditions** — Deux opérations simultanées lisent la même donnée puis écrivent chacune en se croyant seules : deux commandes pour un double clic, un stock à -1. Le remède est dans la base (contrainte, requête atomique, verrou). → BDD-05, BDD-07, ASY-05
- **Read Replicas** — Des copies de la base en lecture seule qui absorbent les lectures pour soulager le serveur principal. Elles ont un léger retard sur l'original. → BDD-20
- **Replication** — Copier en continu une base vers d'autres serveurs, pour survivre à une panne ou servir des répliques de lecture. → BDD-20
- **Row Level Security** — Un filtre que Postgres applique à chaque requête pour qu'un utilisateur ne voie et ne modifie que ses propres lignes. Avec Supabase, c'est la seule barrière entre la clé publique du navigateur et toutes tes données. → BDD-01, BDD-02, BDD-03, BDD-04, BDD-13, BDD-19, IAM-03, IAM-05, IA-08
- **Schema Versioning** — Savoir à tout moment quelle version du schéma tourne dans chaque environnement, grâce aux migrations numérotées et rangées dans le dépôt. → BDD-10, BDD-17
- **Sharding** — Répartir les données d'une base sur plusieurs serveurs, chacun en détenant une partie. Réservé aux très gros volumes qu'aucune machine ne tient plus. → BDD-20
- **Suppression douce** — Marquer une ligne comme supprimée (`deleted_at`) au lieu de l'effacer, pour pouvoir annuler. Elle oblige à filtrer partout, à adapter les contraintes uniques, et à purger vraiment les données personnelles. → BDD-19
- **Transactions** — Un groupe d'opérations en base exécuté « tout ou rien » : si une étape échoue, tout est annulé. Avec supabase-js, on passe par une fonction SQL appelée en `.rpc()`. → BDD-06, BDD-18
- **UUID** — Un identifiant aléatoire de 128 bits (`3f2a…`) qu'on ne peut pas deviner, contrairement à un numéro qui se suit (`/facture/1042`). Les UUID v7 sont en plus ordonnés dans le temps. → BDD-14
- **Virgule flottante** — La façon dont les ordinateurs stockent les nombres décimaux de manière approchée : `0.1 + 0.2` donne `0.30000000000000004`. D'où l'argent en centimes entiers ou en `numeric`. → BDD-08

## 07 · Chiffrement, réseau et protocoles (NET)

- **AES-GCM** — L'algorithme de chiffrement symétrique recommandé par défaut : il chiffre et détecte en même temps toute modification du message. Il exige un vecteur d'initialisation (IV) aléatoire neuf à chaque chiffrement. → NET-08, NET-09
- **CAA** — Un enregistrement DNS qui liste les autorités de certification autorisées à émettre un certificat pour ton domaine. Les autres doivent refuser, ce qui complique la création d'un faux certificat. → NET-12
- **Certificats** — La carte d'identité numérique du serveur, signée par une autorité de confiance, qui prouve que `ton-domaine.fr` est bien toi. Ils expirent (200 jours au plus depuis mars 2026), d'où le renouvellement automatique. → NET-02, NET-03, NET-06, NET-12
- **DKIM** — Une signature ajoutée à chaque e-mail envoyé, vérifiable grâce à une clé publique publiée dans le DNS du domaine. Elle prouve que l'e-mail vient bien de toi et n'a pas été modifié. → NET-11
- **DMARC** — Un enregistrement DNS qui dit aux messageries quoi faire d'un e-mail qui échoue à SPF et DKIM (rien, spam, rejet) et qui t'envoie des rapports. C'est lui qui bloque l'usurpation de ton domaine. → NET-11
- **DNS** — L'annuaire d'Internet, qui traduit un nom (`ton-domaine.fr`) en adresse de serveur. Qui contrôle le DNS contrôle où vont les visiteurs et les e-mails. → NET-05, NET-11, NET-12
- **DNSSEC** — La signature des réponses DNS, pour qu'un résolveur détecte une fausse réponse qui enverrait tes visiteurs vers un faux site. → NET-12
- **Encryption at Rest** — Le chiffrement des données stockées (disques, sauvegardes) : un disque volé ne livre rien. Fourni par les plateformes, il ne protège pas de ce qui passe par la base allumée. → NET-09
- **Encryption in Transit** — Le chiffrement des données pendant leur voyage sur le réseau, par TLS : personne sur le trajet (Wi-Fi public, proxy) ne peut les lire ni les modifier. → NET-01, NET-02, NET-03, NET-04
- **Gestion des clés** — Tout ce qui entoure une clé de chiffrement : où elle est rangée (jamais avec les données), comment on la remplace (rotation), comment on la sauvegarde. Une clé perdue rend les données illisibles pour toujours. → NET-09, NET-13
- **gRPC** — Un protocole d'appel entre programmes (créé par Google), aux messages binaires typés, sur HTTP/2. Excellent entre services internes, mais inutilisable directement depuis un navigateur sans proxy. → NET-18
- **Hachage et chiffrement** — Le hachage est à sens unique (une empreinte, pour vérifier sans pouvoir retrouver : mots de passe, intégrité, HMAC) ; le chiffrement est réversible avec la clé (pour cacher puis retrouver). L'encodage (base64) n'est ni l'un ni l'autre : tout le monde le décode. → API-04, NET-07, NET-08, NET-09
- **HSTS** — Un en-tête HTTP qui dit au navigateur « ce site, c'est HTTPS uniquement » ; il ne tentera plus jamais la version en clair, même si on tape `http://`. → NET-01
- **HTTP/2 & HTTP/3** — Les versions récentes de HTTP : HTTP/2 fait passer beaucoup de requêtes en parallèle sur une seule connexion, HTTP/3 remplace TCP par QUIC (sur UDP), plus à l'aise sur les réseaux mobiles. Elles s'activent au CDN, sans code. → NET-16, NET-17, NET-18
- **Long Polling** — Le client pose une question, le serveur garde la requête ouverte jusqu'à avoir du neuf (ou un délai), répond, puis le client redemande. Un repli simple et robuste au temps réel. → NET-14
- **Pare-feu** — Un filtre réseau qui ne laisse passer que les connexions prévues (ports 80 et 443, par exemple) et bloque le reste, comme une porte d'immeuble qui ne s'ouvre qu'avec un badge. → NET-10, API-14
- **Server-Sent Events** — Une connexion HTTP qui reste ouverte pour que le serveur envoie un flux d'événements au navigateur, dans un seul sens. Simple, passe les proxys, idéale pour afficher une réponse d'IA mot à mot. → NET-14, NET-16
- **SPF** — Un enregistrement DNS qui liste les serveurs autorisés à envoyer des e-mails pour ton domaine. Un seul par domaine, 10 recherches DNS au plus. → NET-11
- **TCP vs UDP** — Les deux grands modes de transport d'Internet : TCP garantit que tout arrive dans l'ordre (comme une lettre recommandée), UDP envoie vite sans garantie (comme une radio en direct). HTTP/3 s'appuie sur UDP via QUIC. → NET-17
- **TLS** — Le protocole qui chiffre une connexion et prouve, par le certificat, l'identité du serveur ; c'est le « s » de HTTPS. Chiffrer sans vérifier le certificat ne protège de rien. → NET-01, NET-02, NET-03, NET-04, NET-06
- **WebSockets** — Une connexion permanente et bidirectionnelle entre le navigateur et le serveur, pour le chat, le multijoueur ou l'édition à plusieurs. Plus puissante que SSE, mais il faut gérer l'authentification, l'origine et les reconnexions. → NET-14, NET-15

## 08 · Tâches de fond, files, systèmes distribués (ASY)

- **At-least-once** — Livraison « au moins une fois » : un message n'est jamais perdu, mais il peut arriver deux fois. C'est la règle de presque toutes les files, crons et webhooks. → ASY-03, ASY-10
- **Backpressure** — Contre-pression : un système ralentit ce qui l'alimente au lieu d'accumuler sans limite, comme un guichet qui fait patienter la file plutôt que de prendre 10 000 dossiers d'un coup. → ASY-11
- **CAP Theorem** — Quand le réseau est coupé entre ses machines, un système réparti doit choisir entre cohérence (toujours la dernière valeur) et disponibilité (toujours une réponse). Une base Postgres seule choisit la cohérence, Cloudflare KV la disponibilité. → ASY-12, ASY-20
- **Clock Skew** — Le décalage entre les horloges de machines différentes. Comparer deux horloges pour savoir « qui a écrit en dernier » donne parfois un résultat faux. → ASY-16
- **Consommateur idempotent** — Le programme qui traite les messages est écrit pour qu'un deuxième passage du même message ne change rien de plus. Indispensable avec une livraison « au moins une fois ». → ASY-03, ASY-08
- **Cron Jobs** — Des tâches lancées automatiquement à heure fixe (« tous les jours à 6 h »). Elles peuvent sauter, partir deux fois ou s'arrêter sans prévenir. → ASY-04, ASY-08, ASY-09, ASY-14
- **Dead Letter Queues** — La file où l'on range les messages qui ont échoué trop de fois, pour les examiner et les rejouer au lieu de les perdre : le service des lettres sans destinataire de la poste. → ASY-07
- **Distributed Locks** — Un verrou partagé entre plusieurs machines pour qu'une seule fasse un travail à la fois. Il doit expirer et porter un jeton de clôture (fencing token), pour que les écritures d'un ancien détenteur soient refusées. → ASY-08, ASY-18
- **Distributed Transactions** — Une transaction qui engloberait d'un seul bloc plusieurs systèmes (base, file, API tierce), par exemple avec le commit à deux phases (2PC). Rarement possible et fragile : on lui préfère l'outbox et les sagas. → ASY-10, ASY-17
- **Durable Execution** — L'exécution en plusieurs étapes d'un traitement dont l'avancement est enregistré, pour qu'il reprenne là où il s'était arrêté après une panne (Inngest, Trigger.dev, Cloudflare Workflows, Vercel Workflows). → ASY-02, ASY-17
- **Event-Driven Architecture** — Une architecture où les parties réagissent à des événements publiés (« commande payée ») au lieu de s'appeler directement. Souple, mais plus difficile à suivre et à déboguer. → ASY-01, ASY-15, ASY-19
- **Eventual Consistency** — Cohérence à terme : une écriture finit par être visible partout, mais pas tout de suite. Sur Cloudflare KV, elle peut mettre 60 secondes ou plus à apparaître ailleurs. → ASY-12, ASY-20
- **Heartbeat monitoring** — Surveillance par battement de cœur : la tâche signale chacune de ses réussites à un service, qui alerte si le signal n'arrive plus. C'est ce qui détecte un cron arrêté sans bruit. → ASY-09
- **Leader Election** — Élection de leader : plusieurs instances désignent l'une d'elles pour faire seule un travail unique. Sur une plateforme gérée, le cron de la plateforme joue déjà ce rôle. → ASY-18, ASY-20
- **Message Queues** — File de messages : une liste d'attente durable où un programme dépose du travail, qu'un autre programme (le consommateur) vide à son rythme, comme la pile de bons de commande au passe d'une cuisine. → ASY-01, ASY-02, ASY-03, ASY-06, ASY-07, ASY-13, ASY-15
- **Network Partitions** — Partition réseau : deux parties d'un système ne peuvent plus se parler, alors que chacune fonctionne. En pratique, c'est la requête partie dont la réponse ne revient jamais. → ASY-20
- **Outbox pattern** — Écrire le message à publier dans une table de la base, dans la même transaction que la donnée, puis le publier ensuite : jamais l'un sans l'autre. → ASY-10
- **Pub/Sub** — Publication/abonnement : un message publié une seule fois est reçu par tous les abonnés intéressés, sans que l'émetteur les connaisse. → ASY-19
- **Saga Pattern** — Découper une opération sur plusieurs services en étapes, chacune avec une action de compensation qui l'annule si une étape suivante échoue (libérer le créneau, rembourser). → ASY-17
- **Service Discovery** — La façon dont un service trouve l'adresse d'un autre. Sur une plateforme gérée, une URL dans une variable d'environnement suffit. → ASY-20
- **Thread Safety** — Un code est sûr face aux accès concurrents quand plusieurs traitements peuvent toucher en même temps à un état partagé sans le corrompre. En JavaScript, les requêtes s'entrelacent à chaque `await`. → ASY-05

## 09 · Performance, montée en charge, fluidité de l'interface (PERF)

- **Accessibilité** — Permettre à tout le monde d'utiliser l'interface : au clavier seul, avec un lecteur d'écran, avec une vue faible. La référence est le WCAG 2.2 niveau AA ; comme une rampe à côté de l'escalier, elle sert aussi aux poussettes. → PERF-05, PERF-06, LEG-15
- **Autoscaling** — Ajout et retrait automatiques d'instances selon la charge. Vercel, Workers et Edge Functions le font déjà ; il faut le plafonner pour éviter la facture surprise. → PERF-20
- **Cache Invalidation** — Décider quand une copie en cache doit être jetée ou rafraîchie : durée de vie, purge, clé versionnée. Trop tard, on affiche un vieux prix ; trop tôt, le cache ne sert à rien. → PERF-18
- **Cache stampede** — Avalanche : une entrée très demandée expire, et des centaines de requêtes la recalculent en même temps et écrasent la base. On l'évite avec un seul recalcul à la fois et stale-while-revalidate. → PERF-18
- **Caching** — Garder une copie d'un résultat pour ne pas refaire le travail : dans le navigateur, sur un CDN, en mémoire, dans Redis. → PERF-10, PERF-18
- **CDN** — Content Delivery Network : un réseau de serveurs répartis dans le monde qui gardent une copie des fichiers près des visiteurs. Un dépôt de pain dans chaque quartier plutôt qu'une seule boulangerie. → PERF-10, PERF-18
- **CLS** — Cumulative Layout Shift : la mesure des sauts de mise en page pendant le chargement, bonne si ≤ 0,1. C'est le bouton qui descend juste au moment où on clique. → PERF-01, PERF-02, PERF-03, PERF-12
- **Code splitting** — Découper le JavaScript en morceaux chargés seulement quand on en a besoin (par page, par composant lourd). → PERF-08
- **Cold Starts** — Démarrage à froid : la première requête sur une nouvelle instance serverless attend que le code se charge. Plus le paquet est lourd, plus elle attend. → PERF-11
- **Compression** — Réduire le poids des réponses texte (HTML, CSS, JS, JSON) avec Brotli ou gzip avant de les envoyer ; le navigateur les décompresse. → PERF-10
- **Core Web Vitals** — Les trois mesures de Google pour l'expérience d'une page : LCP, INP et CLS, évaluées sur 75 % des visites réelles. → PERF-01, PERF-03
- **Debounce** — Agir seulement quand les événements se sont arrêtés depuis un court délai, par exemple 300 ms après la dernière touche frappée. → PERF-14
- **Edge Caching** — Mettre en cache des réponses dynamiques (API, HTML) sur les serveurs du CDN, au plus près des visiteurs. → PERF-18
- **Garbage Collection** — Le ramasse-miettes libère automatiquement la mémoire que plus rien n'utilise. Ses pauses peuvent ralentir certaines requêtes. → PERF-09
- **Horizontal Scaling** — Tenir plus de charge en ajoutant des machines. Il faut une application sans état et un répartiteur de charge. → PERF-20
- **INP** — Interaction to Next Paint : le délai entre un clic ou une frappe et l'affichage qui suit, bon si ≤ 200 ms. → PERF-01, PERF-07, PERF-16
- **Latency** — Latence : le temps entre l'envoi d'une requête et l'arrivée de la réponse. → PERF-19
- **Lazy loading** — Chargement différé : on ne charge une image ou un morceau de code qu'au moment où on en a besoin (quand l'image approche de l'écran, quand on ouvre un écran). → PERF-02, PERF-08
- **LCP** — Largest Contentful Paint : le moment où le plus gros élément visible (photo d'accroche, grand titre) s'affiche, bon si ≤ 2,5 s. → PERF-01, PERF-02, PERF-03, PERF-17
- **Load Balancing** — Répartition de charge : distribuer les requêtes entre plusieurs serveurs et écarter ceux qui ne répondent plus. → PERF-20
- **Long Tasks** — Tâche longue : un travail du navigateur qui occupe le fil principal plus de 50 ms d'affilée. Pendant ce temps, clics et frappes attendent. → PERF-07
- **Memory Leaks** — Fuite de mémoire : de la mémoire gardée sans le vouloir (écouteur, intervalle, cache sans borne), qui grossit jusqu'au ralentissement ou au plantage. → PERF-09
- **Optimistic UI** — Afficher tout de suite le résultat d'une action, avant la confirmation du serveur, et revenir en arrière si elle échoue. → PERF-13
- **P99 Latency** — La durée sous laquelle passent 99 % des requêtes. Elle montre ce que la moyenne cache. → PERF-19
- **Performance perçue** — La rapidité ressentie par l'utilisateur : retour immédiat, squelettes, états clairs. Une attente annoncée paraît plus courte qu'une attente muette. → PERF-04, PERF-05, PERF-12, PERF-13, PERF-16
- **Rendu (SSR, SSG, ISR, CSR)** — Les quatre façons de produire le HTML d'une page : au build (SSG), au build puis régénéré (ISR), à chaque requête sur le serveur (SSR), ou dans le navigateur après le JavaScript (CSR). → PERF-17
- **Reverse proxies** — Un serveur placé devant l'application (Caddy, Nginx, Cloudflare) qui reçoit les requêtes, gère le HTTPS, compresse, met en cache et répartit. → PERF-20
- **Serverless Limits** — Les limites d'une fonction serverless : durée maximale, mémoire, temps CPU, taille des requêtes. Les dépasser provoque une erreur. → PERF-11
- **Tail Latency** — Latence de queue : les requêtes les plus lentes (le 1 % du bout). Elle s'additionne quand une page fait beaucoup d'appels. → PERF-19
- **Throttle** — Limiter un traitement à au plus une exécution toutes les X ms, quel que soit le nombre d'événements (défilement, redimensionnement). → PERF-14
- **Throughput** — Débit : le nombre de requêtes ou de tâches traitées par seconde. → PERF-19, PERF-20
- **Vertical Scaling** — Tenir plus de charge en prenant une machine plus puissante. Le code ne change pas : c'est la première chose à essayer. → PERF-20
- **Virtualisation de liste** — N'afficher que les lignes visibles d'une longue liste, et les recycler pendant le défilement. → PERF-15
- **Web Workers** — Un fil d'exécution séparé dans le navigateur pour les calculs lourds, qui laisse l'interface réactive. → PERF-07

## 10 · Livraison, déploiement, dépendances (LIV)

- **Blue-Green Deployment** — Deux environnements complets : « bleu » sert les utilisateurs pendant qu'on installe la nouvelle version sur « vert », puis on bascule tout le trafic d'un coup. Revenir en arrière, c'est rebasculer. → LIV-17
- **Build Caching** — Garder d'une construction à l'autre ce qui n'a pas changé (dépendances téléchargées, couches Docker, fichiers compilés) pour ne refaire que le nécessaire. On ne remet pas la pâte à lever chaque fois qu'on change la garniture. → LIV-08, LIV-12
- **Canary Releases** — La nouvelle version reçoit d'abord une petite part du trafic (5 %, 10 %) ; si les erreurs n'augmentent pas, on élargit. Le nom vient du canari que les mineurs emportaient pour détecter le gaz. → LIV-17
- **CI/CD** — L'intégration continue (CI) relance automatiquement lint, types, tests et build à chaque envoi de code ; le déploiement continu (CD) met en ligne ce qui a passé. Un robot qui relit chaque copie avant de l'imprimer. → LIV-02, LIV-06, LIV-08, LIV-15, SEC-13
- **Dependency Hell** — L'enfer des dépendances : des paquets qui exigent des versions incompatibles entre elles, des mises à jour impossibles sans tout casser. On y arrive en restant longtemps sans mettre à jour. → LIV-03, LIV-14
- **Docker** — Un outil qui emballe une application avec tout ce dont elle a besoin (système, bibliothèques) dans une « image » qui tourne pareil partout. On la veut petite, épinglée, multi-étapes et sans root. → LIV-12, LIV-18, SEC-13
- **Environnements** — Des copies séparées de l'application (dev, préversion, prod), chacune avec sa configuration, ses clés et ses données. Une cuisine d'essai à côté du restaurant : on rate ses recettes sans servir les clients. → LIV-09, LIV-19, SEC-07
- **Feature Flags** — Un interrupteur dans le code qui active ou cache une fonctionnalité sans redéployer, pour tout le monde ou une partie des utilisateurs. À retirer une fois la fonctionnalité ouverte, sinon il devient du code mort. → LIV-16
- **Helm Charts** — Les « paquets » de Kubernetes : un chart regroupe tous les fichiers qui décrivent une application, avec des valeurs différentes par environnement. → LIV-18
- **Infrastructure as Code** — Décrire l'infrastructure (DNS, bases, buckets, droits) dans des fichiers versionnés au lieu de la cliquer dans des tableaux de bord : un historique, une relecture avant application, et la possibilité de tout recréer. → LIV-19, REP-08
- **Kubernetes** — Un orchestrateur qui place, redémarre, multiplie et met à jour des conteneurs sur un groupe de machines. Puissant mais lourd : un PaaS suffit à la grande majorité des projets. → LIV-18, OBS-16
- **Lockfile** — Le fichier qui note la version exacte de chaque dépendance, sous-dépendances comprises, avec une empreinte de contrôle (`package-lock.json`, `pnpm-lock.yaml`, `uv.lock`…). Il garantit que chaque installation est identique. → LIV-03, LIV-04, LIV-14
- **Preview deployments** — Une mise en ligne automatique de chaque branche ou PR sur une URL à part, pour vérifier avant de fusionner. Vercel, Netlify et Cloudflare en créent à chaque push. → LIV-09
- **Protection de branche** — Des règles sur la branche principale qui interdisent le force-push et la suppression, et exigent une CI verte (et en équipe une relecture) avant fusion. → LIV-15
- **Rollbacks** — Revenir à la version précédente quand une mise en ligne casse, avant même de chercher la cause. À connaître et à avoir essayé avant d'en avoir besoin ; une migration de base ne se défait pas ainsi. → LIV-10, LIV-11, LIV-17, OBS-07
- **Rolling Deployments** — Remplacer les serveurs un par un par la nouvelle version ; pendant ce temps, ancienne et nouvelle versions tournent ensemble. D'où des migrations de base compatibles avec les deux. → LIV-11, LIV-17
- **SBOM** — « Software Bill of Materials » : la liste complète des composants d'un logiciel livré, avec versions et licences, dans un format standard (CycloneDX, SPDX). La liste des ingrédients sur l'emballage. → LIV-20
- **Semantic Versioning** — La numérotation `MAJEUR.MINEUR.CORRECTIF` : le correctif répare, le mineur ajoute sans casser, le majeur peut casser. Dans `package.json`, `~` accepte les correctifs et `^` les mineures. → LIV-04, LIV-05, LIV-14
- **Slopsquatting** — Enregistrer un paquet malveillant sous un nom inventé par une IA, en attendant que quelqu'un suive le conseil de l'IA. D'où la règle : vérifier qu'un paquet proposé par une IA existe vraiment et est le bon. → LIV-01, IA-15
- **Supply chain** — La chaîne d'approvisionnement logicielle : tout ce qu'on n'a pas écrit mais qu'on exécute (paquets, actions GitHub, images Docker, outils de build). Un maillon compromis compromet tout le projet. → LIV-01 à LIV-07, LIV-12, LIV-13, LIV-20
- **Terraform** — L'outil d'Infrastructure as Code le plus répandu (OpenTofu en est la version libre) : il compare des fichiers de description à l'infrastructure réelle et applique la différence après un `plan` relu. → LIV-19
- **Typosquatting** — Publier un paquet malveillant sous un nom proche d'un paquet célèbre (`expres` pour `express`), en pariant sur une faute de frappe. Un faux site bancaire à une lettre près. → LIV-01

## 11 · Journaux, métriques, alertes, incidents (OBS)

- **Alerts** — Un message automatique qui exige une action humaine, envoyé quand un symptôme grave apparaît (site injoignable, erreurs en hausse). Une alerte qui sonne pour rien apprend à ignorer les autres, comme une alarme de voiture qui hurle à chaque passant. → OBS-02, OBS-03, OBS-05, OBS-15
- **Distributed Tracing** — Enregistrer le parcours complet d'une requête à travers plusieurs services, découpé en étapes chronométrées (spans). On voit où le temps s'est perdu, comme le suivi d'un colis étape par étape. → OBS-10, OBS-18
- **Error Budgets** — La part de panne qu'un objectif de fiabilité autorise : avec 99,9 % sur 30 jours, environ 43 minutes par mois. Tant qu'il en reste, on livre ; épuisé, on consolide. → OBS-17
- **Golden signals** — Les quatre mesures de base d'un service selon Google : latence, trafic, erreurs, saturation. Si on n'en suit que quatre, ce sont celles-là. → OBS-11
- **Healthchecks** — Une route (souvent `/health`) qui dit si le service va bien, en vérifiant ce qui compte vraiment (la base répond) sans rien exposer. Les sondes et les plateformes s'en servent pour savoir s'il est vivant. → OBS-02, OBS-05, OBS-09, OBS-16
- **Identifiant de corrélation** — Un code unique donné à chaque requête et répété sur toutes ses lignes de journal, ses appels et ses tâches. Comme un numéro de dossier : un seul filtre retrouve toute l'histoire. → OBS-10, OBS-18
- **Journal d'audit** — Le registre « qui a fait quoi, quand, sur quoi » des actions sensibles (connexion, changement de droits, suppression, paiement), qu'on ne modifie jamais : le registre des entrées et sorties d'un coffre. → OBS-06
- **Journaux structurés** — Des journaux écrits comme des objets JSON aux champs fixes (`level`, `msg`, `orderId`) plutôt qu'en phrases libres. On peut alors les filtrer comme une base de données. → OBS-04
- **Liveness & Readiness Probes** — Deux questions posées à un conteneur : « es-tu vivant ? » (sinon on le redémarre) et « es-tu prêt à recevoir du trafic ? » (sinon on le met de côté sans le tuer). Les confondre peut transformer une lenteur en panne totale. → OBS-16
- **Logging** — L'écriture par le programme d'un journal de ce qu'il fait, pour comprendre après coup ce qui s'est passé. Utile à condition d'avoir des niveaux, des champs choisis, ni secret ni donnée personnelle. → OBS-04, OBS-06, OBS-10, OBS-14, QUA-05, SEC-11, IA-18
- **Metrics** — Des chiffres mesurés dans le temps : requêtes par seconde, taux d'erreur, temps de réponse P95, connexions à la base. Ils disent « combien » et « à quelle vitesse », là où les journaux disent « quoi ». → OBS-11
- **Monitoring** — La surveillance des questions qu'on a prévues : le site répond-il, combien d'erreurs, la tâche a-t-elle tourné ? C'est le tableau de bord de la voiture. → OBS-01, OBS-05, OBS-11
- **Observability** — La capacité de comprendre ce qui se passe dans un système, y compris pour des questions qu'on n'avait pas prévues, à partir de ses journaux, métriques et traces. Le monitoring dit que ça va mal ; l'observabilité aide à trouver pourquoi. → OBS-04, OBS-14, OBS-18
- **On-Call** — L'astreinte : qui répond aux alertes urgentes, à quelles heures, et qui prend le relais. Seul, la question devient : comment suis-je prévenu, et que puis-je promettre ? → OBS-03, OBS-15
- **OpenTelemetry** — La norme ouverte pour produire traces, métriques et journaux une seule fois et les envoyer vers l'outil de son choix. Une prise universelle qui évite de s'enfermer chez un fournisseur. → OBS-18
- **Postmortems** — Le compte rendu écrit après un incident : ce qui s'est passé, pourquoi, et ce qui change. « Sans coupable » : on cherche ce qui, dans le système, a permis l'erreur, pas qui l'a commise. → OBS-13
- **Production Incidents** — Un problème qui touche les utilisateurs réels : panne, données fausses, fuite. On le gère dans l'ordre : constater, communiquer, atténuer (souvent par un rollback), réparer, apprendre. → OBS-07, OBS-12, OBS-13, SEC-06, LEG-13
- **Runbook** — Le manuel des gestes de secours, une section par situation prévue (« la base est corrompue : faire 1, 2, 3 »), avec les commandes exactes, écrit pour quelqu'un de fatigué ou qui découvre le projet. → OBS-07, OBS-12, OBS-15, REP-15
- **SLIs** — « Service Level Indicators » : la mesure de ce que vit l'utilisateur, par exemple la part des requêtes réussies en moins de 500 ms. → OBS-17
- **SLOs** — « Service Level Objectives » : l'objectif chiffré fixé sur un SLI, par exemple 99,9 % sur 30 jours. Jamais plus que ce que garantissent ensemble les services dont on dépend. → OBS-17
- **Suivi des erreurs** — Un service (Sentry ou équivalent) qui reçoit automatiquement les erreurs du serveur et du navigateur, les regroupe et dit quelle version les a introduites. On sait qu'un paiement plante avant le premier e-mail d'utilisateur. → OBS-01, OBS-08
- **Uptime monitoring** — Une sonde extérieure qui visite le site toutes les minutes et prévient s'il ne répond plus. Elle voit ce que voit l'utilisateur, même quand le serveur est trop en panne pour signaler quoi que ce soit. → OBS-02, OBS-09

## 12 · Sauvegardes, reprise, tolérance aux pannes (REP)

- **Backups** — Sauvegardes : des copies des données pour revenir en arrière après une erreur, une attaque ou une panne. Elles ne valent que si on a déjà réussi à les restaurer. → REP-01, REP-02, REP-03, REP-04, REP-10
- **Chaos Engineering** — Provoquer exprès des pannes pour vérifier que le système résiste, au lieu de le découvrir pendant une vraie panne : un exercice d'évacuation incendie, pour du logiciel. → REP-18
- **Dégradation gracieuse** — Quand une partie tombe, ne perdre que cette fonction et garder le reste du site en marche. Une panne de l'IA grise le bouton « Résumer », pas toute la page. → REP-07
- **Disaster Recovery** — Le plan et les moyens pour remettre le service en route après un sinistre : base effacée, compte perdu, fournisseur à terre. → REP-05, REP-08, REP-09, REP-15
- **Failover** — Basculement : passer automatiquement sur un exemplaire de secours quand le principal tombe. Il ne marche que s'il a été testé. → REP-16
- **Graceful shutdown** — Arrêt propre : quand le signal SIGTERM arrive, le serveur refuse les nouvelles requêtes, finit celles en cours, ferme ses connexions, puis s'arrête. → REP-11
- **Multi-Region Deployment** — Faire tourner l'application dans plusieurs régions du monde, pour survivre à la panne d'une région ou servir des utilisateurs lointains. Très coûteux en complexité. → REP-17
- **Page de statut** — Une page publique, hébergée à part, qui dit si le service fonctionne et ce qui se passe pendant une panne. → REP-14
- **Point-in-Time Recovery (PITR)** — Restaurer une base à un instant précis (« hier à 14 h 32 ») grâce à l'enregistrement continu des modifications. Sur Supabase, on perd au pire environ 2 minutes. → REP-01
- **Point unique de défaillance** — SPOF : un élément dont la panne arrête tout. Un serveur, un compte, une carte bancaire, ou une seule personne qui a les accès. → REP-05, REP-06, REP-12
- **Redondance** — Avoir au moins deux exemplaires de ce qui est critique, pour que la perte de l'un n'arrête rien. → REP-12, REP-16, REP-17
- **Règle 3-2-1** — 3 copies des données, sur 2 supports différents, dont 1 hors site (ici, hors du fournisseur). → REP-02, REP-04, REP-10
- **RPO** — Recovery Point Objective : combien de données on accepte de perdre. Avec une sauvegarde quotidienne, c'est jusqu'à 24 heures. → REP-09
- **RTO** — Recovery Time Objective : combien de temps on accepte d'être hors ligne avant que le service revienne. → REP-03, REP-09
- **Test de restauration** — Restaurer pour de vrai une sauvegarde sur une base séparée, pour vérifier qu'elle est complète et mesurer le temps que ça prend. → REP-03
- **Vendor lock-in** — Enfermement chez un fournisseur : partir coûterait si cher (données non exportables, code propriétaire) qu'on ne peut plus vraiment choisir. → REP-13

## 13 · Qualité, code mort, tests, lisibilité (QUA)

- **Code mort** — Du code que plus rien n'appelle : fichiers, fonctions, exports, dépendances, routes, styles ou flags oubliés. Il ne sert à rien, mais il faut toujours le lire, le mettre à jour et s'en méfier. → QUA-03, QUA-04, QUA-05, QUA-10, LIV-16
- **Commentaires** — Le texte laissé dans le code pour le lecteur humain. Un bon commentaire dit pourquoi (la contrainte, le bug contourné), jamais ce que le code dit déjà. → QUA-10, QUA-11, QUA-17
- **Commits atomiques** — Un commit qui contient un seul changement logique, complet, après lequel le projet marche. On peut alors le relire, l'annuler ou le retrouver sans défaire autre chose. → QUA-18, QUA-20
- **Complexité** — Le nombre de chemins possibles dans un morceau de code (chaque `if`, boucle ou `try` en ajoute). Plus il y en a, plus c'est difficile à comprendre et à tester : on vise du code « à plat », avec des retours anticipés. → QUA-12, QUA-15
- **Conventions** — Les façons de faire qu'un projet a choisies : noms, structure des fichiers, gestion des erreurs, bibliothèques. Suivies partout, le projet se lit comme s'il avait été écrit par une seule personne ; chaque variante ajoutée double ce qu'il faut connaître. → QUA-22
- **Définition de fini** — La courte liste de ce qui doit être vrai avant de dire « c'est fini » : build et types sans erreur, tests verts, parcours réel essayé, ce qui n'a pas pu être vérifié dit en clair. Sans elle, « fini » veut seulement dire « écrit ». → QUA-21
- **Dette technique** — Le raccourci pris aujourd'hui qu'il faudra « rembourser » plus tard (code dupliqué, test manquant, solution provisoire). Notée et voulue, c'est un choix ; cachée, elle grossit avec des intérêts. → QUA-03, QUA-06, QUA-11, LIV-16
- **Documentation** — Ce qui explique le projet à celui qui arrive : README pour lancer, commentaires de contrat pour les fonctions publiques, fichiers de décisions. Courte et juste vaut mieux que longue et fausse. → QUA-17, QUA-19
- **DRY** — « Don't Repeat Yourself » : une même règle (calcul, validation, constante) ne doit exister qu'à un seul endroit. Limite : deux codes qui se ressemblent ne portent pas toujours la même règle. → QUA-13, QUA-22
- **Duplication** — Le même code ou la même règle recopiés à plusieurs endroits, qu'on corrige ici et qu'on oublie là. Règle de trois : on tolère deux copies, on factorise à la troisième. → QUA-13
- **Effets de bord** — Tout ce qu'une fonction fait d'autre que renvoyer un résultat : écrire en base, envoyer un e-mail, modifier une variable ou l'objet reçu. On les regroupe aux bords pour garder une logique pure, facile à tester. → QUA-16
- **Formatage** — La mise en page automatique du code (espaces, guillemets, retours à la ligne) par un outil comme Prettier, Biome ou Ruff. Plus de débats de style, et des diffs qui ne montrent que les vrais changements. → QUA-07
- **Gestion des erreurs** — La manière de réagir quand quelque chose échoue : jamais en silence, le plus tôt possible, avec un message utile pour le développeur et un autre pour l'utilisateur. → QUA-01, QUA-02
- **KISS** — « Keep It Simple, Stupid » : la solution la plus simple qui répond au besoin est la meilleure. La complexité se paie à chaque lecture. → QUA-12, LIV-13
- **Lint** — L'analyse automatique du code qui signale les erreurs probables (variable inutilisée, promesse oubliée, comparaison douteuse) avant l'exécution. ESLint, Biome et Ruff en sont des exemples. → QUA-07
- **Nombres magiques** — Des valeurs en dur dans le code (`86400000`, `0.2`) dont personne ne sait plus d'où elles viennent. On les remplace par une constante nommée (`UN_JOUR_MS`, `TAUX_TVA`). → QUA-15
- **Nommage** — L'art de choisir des noms qui disent l'intention (`estAbonneActif` plutôt que `flag`). Un bon nom évite un commentaire, un mauvais oblige à tout relire. → QUA-14
- **Pyramide des tests** — Beaucoup de tests unitaires, moins de tests d'intégration, quelques tests de bout en bout. Pour une appli web, l'étage du milieu (intégration) donne souvent le plus de confiance par minute écrite. → QUA-08, QUA-09
- **Refactoring** — Changer la structure du code sans changer ce qu'il fait, par petits pas, sous la protection des tests. On range l'atelier sans changer ce qu'il fabrique. → QUA-04, QUA-11, QUA-13, QUA-20
- **Régression** — Un bug qui casse ce qui marchait avant, souvent loin de l'endroit modifié. Les tests automatiques et l'essai des parcours voisins après chaque changement sont là pour l'attraper avant l'utilisateur. → QUA-08, QUA-21
- **Revue de code** — La relecture d'un changement une fois qu'il marche, par un collègue ou par soi-même à froid (diff, `/guard-system-100s -relire`, `/code-review`, `/simplify`). Elle cherche plus simple et plus court, et attrape oublis, code mort, incohérences, secrets et logique incompréhensible. → QUA-18, QUA-20, LIV-15
- **Séparation des responsabilités** — Chaque fonction ou module n'a qu'une raison de changer (afficher, calculer, enregistrer, envoyer). Une fonction qui fait tout casse dès qu'une seule chose change. → QUA-14, QUA-16
- **SOLID** — Cinq principes de conception objet : responsabilité unique, ouvert-fermé, substitution de Liskov, ségrégation des interfaces, inversion des dépendances. Une boussole utile, pas une loi : appliqués à la lettre dans un petit projet, ils produisent une forêt d'interfaces. → QUA-14
- **Tests** — Du code qui vérifie automatiquement que le code fait ce qu'on attend, et qui crie le jour où une modification casse quelque chose. À placer là où ça casse et où ça coûte (argent, droits, analyse de données). → QUA-08, QUA-09, QUA-16, QUA-21
- **Tests de bout en bout** — Des tests qui pilotent un vrai navigateur comme un utilisateur (Playwright) sur les parcours critiques : inscription, connexion, paiement. Peu nombreux, stables, et lancés en CI. → QUA-09
- **Typage strict** — Le mode où le compilateur (TypeScript `strict`, pyright ou mypy en Python) refuse les valeurs peut-être vides et les types flous, sans `any` ni `@ts-ignore` injustifiés. Une partie des bugs est arrêtée avant même l'exécution. → QUA-06
- **YAGNI** — « You Aren't Gonna Need It » : ne pas construire pour un besoin qui n'existe pas encore. Limite : ce qui coûte très cher à changer plus tard (sécurité, modèle de données, API publique) se réfléchit avant. → QUA-03, QUA-12, LIV-13

## 14 · Applications qui utilisent une IA (IA)

- **Agents et outils** — Un agent est un modèle qui choisit seul quelles fonctions de ton code (ses outils) appeler, et avec quels arguments, en boucle jusqu'à finir sa tâche. Chaque outil doit vérifier les droits lui-même. → IA-03, IA-06, IA-07, IA-10
- **Épinglage du modèle** — Utiliser un identifiant de modèle figé plutôt qu'un alias qui change tout seul, et prévoir sa date de retrait. C'est comme fixer la version d'une dépendance. → IA-16, IA-20
- **Evals** — Les tests unitaires de l'IA : un jeu d'exemples (entrée → résultat attendu) qu'on rejoue à chaque changement de prompt ou de modèle pour voir ce qui casse. → IA-02, IA-16, IA-20
- **Fuite du prompt système** — Les consignes cachées d'une application d'IA finissent par être révélées. Rien de secret ni aucune règle de droits ne doit donc y vivre. → IA-01
- **Hallucinations** — Des réponses fausses énoncées avec assurance (source inventée, prix faux). On les limite en citant des sources et en tirant les faits critiques de la base, pas du modèle. → IA-15
- **Human-in-the-loop** — « Un humain dans la boucle » : le modèle propose une action, un humain la valide d'un clic avant qu'elle s'exécute, comme un virement qui attend ta confirmation. → IA-07
- **Lethal trifecta** — Le trio dangereux dans un même agent : accès à des données privées, lecture de contenu non fiable, et un moyen d'envoyer des données dehors. Retirer l'un des trois casse la plupart des attaques. → IA-03
- **OWASP Top 10 for LLM Applications** — La liste de référence, publiée par l'OWASP, des dix grands risques des applications qui utilisent un LLM (injection de prompt, sortie non fiable, agence excessive, consommation sans limite…). L'édition 2025 fait référence ; vérifier sur owasp.org s'il en existe une plus récente. → IA-01 à IA-08, IA-15
- **Plafond de jetons** — La limite du nombre de jetons (morceaux de mots, l'unité de facturation) qu'un appel peut produire (`max_tokens`) ou qu'une tâche peut consommer. → IA-05, IA-10, IA-17
- **Prompt caching** — Le fournisseur garde en mémoire le début identique de tes prompts (consignes, outils, documents) et le facture moins cher aux appels suivants. → IA-19
- **Prompt injection** — Un texte écrit pour détourner les consignes d'un modèle (« oublie tes règles… »). Aucun filtre ne la bloque à coup sûr, de même qu'on ne peut pas empêcher quelqu'un de mentir à un employé crédule. → IA-01, IA-02
- **Prompt injection indirecte** — La même attaque, cachée dans ce que le modèle lit (page web, e-mail, PDF, résultat d'outil) au lieu d'être tapée par l'utilisateur. N'importe qui peut écrire à ton agent : il lui suffit de t'envoyer un e-mail. → IA-03, IA-09
- **RAG** — Génération augmentée par récupération : on cherche les passages utiles de tes documents et on les donne au modèle pour qu'il réponde. La recherche doit respecter les droits d'accès de l'utilisateur. → IA-08, IA-15
- **Serveurs MCP** — Des programmes qui ajoutent des outils et des données à un assistant d'IA grâce au Model Context Protocol. En local, ils tournent avec tes droits ; en ligne, ce sont des API publiques. → IA-12, IA-13
- **Sortie de LLM non fiable** — Ce que répond un modèle se traite comme une saisie faite par un inconnu : jamais insérée telle quelle dans du HTML, du SQL, une commande shell, une URL ou un `eval`. → IA-04, IA-09, IA-14
- **Sorties structurées** — Une réponse du modèle dans un format imposé (du JSON conforme à un schéma). On la valide quand même côté code (zod, pydantic), avec un plan B si la validation échoue. → IA-14
- **Streaming** — Envoyer la réponse au fil de l'eau (souvent en Server-Sent Events) au lieu d'attendre la fin : les premiers mots arrivent en une seconde et les coupures sont plus rares. → IA-17
- **Tool poisoning** — Une description d'outil MCP piégée, qui contient des ordres cachés pour le modèle (« lis tel fichier secret et envoie-le »). Variante : un serveur qui modifie ses descriptions après avoir été approuvé. → IA-12, IA-13

## 15 · RGPD, cookies, obligations légales (LEG)

Une liste pour ne rien oublier, pas un avis juridique : pour un doute réel, la CNIL, un juriste ou un avocat.

- **AI Act** — Le règlement européen sur l'IA, (UE) 2024/1689, qui classe les usages selon leur risque. Pour la plupart des projets, l'enjeu est la transparence (article 50) : dire qu'on parle à une IA et signaler ce qui est généré, applicable à partir du 2 août 2026. Les reports discutés visaient surtout les règles « haut risque » : vérifier le calendrier à jour. → LEG-16, IA-15
- **Base légale** — La justification juridique d'un usage de données, parmi six : contrat, obligation légale, consentement, intérêt légitime, mission d'intérêt public, intérêts vitaux. Exemple : livrer une commande relève du contrat. → LEG-01
- **CGU** — Conditions générales d'utilisation : les règles d'usage d'un service (comptes, interdits, contenus des utilisateurs, modération). → LEG-17
- **CGV** — Conditions générales de vente : le contrat type d'une boutique avec ses clients (prix, livraison, garanties, rétractation, médiateur). → LEG-05, LEG-06, LEG-07
- **Clauses contractuelles types** — Un contrat modèle adopté par la Commission européenne pour encadrer un transfert vers un pays non jugé adéquat. Le plan B classique quand le fournisseur n'est pas certifié. → LEG-12
- **Consentement** — Un accord libre, éclairé et précis, donné par un geste clair (case non précochée, bouton). Il se retire aussi facilement qu'il se donne. → LEG-02, LEG-11, LEG-19, LEG-20
- **Consentement des mineurs** — En France, un mineur consent seul à partir de 15 ans pour un service en ligne ; en dessous, il faut aussi l'accord d'un titulaire de l'autorité parentale. → LEG-20
- **Cookies et traceurs** — Tout ce qui dépose ou lit une information dans l'appareil du visiteur : cookie, pixel, stockage local, empreinte du navigateur. En dehors des usages strictement nécessaires, il faut un consentement préalable. → LEG-02
- **Copyleft** — Une clause qui oblige à redistribuer les œuvres dérivées sous la même licence libre : dès qu'on les distribue pour la GPL, dès qu'on les propose en ligne pour l'AGPL. → LEG-14
- **Data Privacy Framework** — Le cadre d'adéquation UE–États-Unis de 2023 : le transfert est permis vers une entreprise américaine certifiée. En vigueur en octobre 2026, mais contesté en justice : à surveiller. → LEG-12
- **Données sensibles** — Les catégories protégées par l'article 9 du RGPD (santé, opinions, religion, orientation sexuelle, biométrie, génétique…). Leur traitement est interdit, sauf exceptions. → LEG-19
- **DPA** — Data Processing Agreement : le contrat RGPD avec un sous-traitant (ce qu'il peut faire des données, où, avec quelle sécurité). Il est souvent intégré aux conditions du service. → LEG-08, IA-11
- **Droit de rétractation** — Le droit d'un particulier qui achète à distance de changer d'avis sans donner de raison pendant 14 jours. Depuis le 19 juin 2026, il doit pouvoir l'exercer en ligne grâce à une fonctionnalité dédiée. → LEG-05, LEG-06
- **Droits d'auteur** — Les droits du créateur sur son œuvre (texte, image, musique, code, police). Pour la réutiliser, il faut une licence ou une exception (courte citation, par exemple). → LEG-14
- **Droits des personnes** — Accès, rectification, effacement, portabilité, opposition, limitation. On les honore gratuitement sous un mois, y compris chez les sous-traitants. → LEG-04, LEG-10
- **DSA** — Le règlement européen sur les services numériques. Il impose à tout hébergeur de contenus d'utilisateurs un moyen de signalement, un point de contact et des règles de modération claires, et il interdit aux plateformes la publicité par profilage envers les mineurs. → LEG-17, LEG-20
- **Durée de conservation** — Le temps pendant lequel on garde une donnée, fixé selon son but ; ensuite, on la supprime ou on l'anonymise. Une durée sans purge automatique ne vaut rien. → LEG-09, IA-18
- **European Accessibility Act** — La directive (UE) 2019/882, applicable depuis le 28 juin 2025, qui impose l'accessibilité à de nombreux services, dont le commerce électronique. Les microentreprises de services (moins de 10 personnes et CA ou bilan ≤ 2 M€) en sont exemptées. → LEG-15, PERF-06
- **HDS** — Hébergeur de données de santé : une certification obligatoire en France pour héberger, pour le compte d'autrui, des données de santé recueillies lors de soins ou d'un suivi médical. → LEG-19
- **Hypertrucage** — Un deepfake : une image, un son ou une vidéo réaliste qui fait croire à une personne, un lieu ou un événement réel. Il doit être signalé comme artificiel. → LEG-16
- **Licences logicielles** — Le contrat qui dit ce qu'on peut faire d'un code : licences permissives (MIT, Apache) ou copyleft (GPL, AGPL). Sans licence, tous les droits sont réservés. → LEG-14
- **Médiateur de la consommation** — Un tiers indépendant, gratuit pour le client, qui aide à régler un litige à l'amiable. Tout vendeur aux particuliers doit en proposer un et afficher ses coordonnées. → LEG-05
- **Mentions légales** — La page qui identifie l'éditeur du site, le directeur de la publication et l'hébergeur (loi pour la confiance dans l'économie numérique, LCEN). Obligatoire pour tout site public. → LEG-03
- **Minimisation des données** — Ne collecter que ce qui sert le but. Une donnée jamais collectée ne peut ni fuir ni être réclamée. → LEG-01, LEG-09, IA-11, IA-18
- **Politique de confidentialité** — La page qui explique simplement quelles données sont collectées, pourquoi, chez qui elles passent, combien de temps on les garde, et comment exercer ses droits. → LEG-04, IA-11
- **Prix de référence** — Le prix barré d'une promotion : ce doit être le plus bas pratiqué dans les 30 jours qui précèdent la réduction. → LEG-07
- **Prospection par e-mail** — L'envoi de messages commerciaux. Vers un particulier, il faut son accord préalable (sauf un client existant, pour des produits analogues), et chaque message permet de se désinscrire simplement. → LEG-11
- **Registre des traitements** — Le tableau qui recense chaque usage de données personnelles (but, données, destinataires, durées, sécurité). C'est le premier document demandé lors d'un contrôle. → LEG-18
- **Responsable de traitement** — Celui qui décide pourquoi et comment les données sont traitées (toi, pour ton site). C'est lui qui répond du respect du RGPD. → LEG-08
- **RGAA** — Référentiel général d'amélioration de l'accessibilité : la grille française de critères, fondée sur les WCAG. → LEG-15
- **RGPD** — Le règlement européen, appliqué depuis 2018, qui encadre tout usage de données personnelles : un but précis, une base légale, la minimisation, une durée limitée, les droits des personnes et la sécurité. → LEG-01
- **Sous-traitant** — Un prestataire qui traite des données pour ton compte (hébergeur, base de données, e-mail, IA, statistiques). Il faut un contrat avec chacun. → LEG-04, LEG-08, LEG-10, IA-11
- **Transferts hors UE** — Envoyer des données personnelles hors de l'Espace économique européen, ou y donner accès. Permis seulement avec une garantie (décision d'adéquation, clauses types). → LEG-12, IA-11
- **Violation de données** — Toute perte de confidentialité, d'intégrité ou de disponibilité de données personnelles (fuite, effacement, envoi au mauvais destinataire). On la notifie à la CNIL sous 72 h s'il y a un risque. → LEG-13
