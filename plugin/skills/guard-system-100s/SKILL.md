---
name: guard-system-100s
description: "Le garde-fou de tout ce qu'on code, au niveau d'un architecte expert, sans sur-ingénierie, à chaque étape d'un projet : d'abord du code qui marche (prouvé par le build, les types, les tests et le parcours réel), puis optimal et cohérent (le plus court qui fait le travail, sans code inutile, sans réinventer l'existant, dans les conventions du projet), relu après chaque création, sûr et fluide. Relecture de ce qui vient d'être écrit (plus simple, plus court, autrement ?). Contrôle automatique (clés d'API en dur, .env commité, secrets dans l'historique git, variables publiques VITE_/NEXT_PUBLIC_, injections SQL, XSS, CORS, TLS, Row Level Security Supabase, rate limiting, webhooks, dépendances vulnérables, Docker, GitHub Actions, traceurs sans consentement, code mort), revue complète en 15 domaines et 289 contrôles, conception sécurisée d'un projet ou d'une fonctionnalité, checklist avant mise en ligne, nettoyage du code inutile, explication simple de chaque notion (rate limiting, idempotency, CAP, JWT, CSRF…). Mode par projet : -activer allume le suivi automatique d'un projet pendant qu'il se construit (un bloc dans son CLAUDE.md, le scanner qui repasse seul quand le code change, un journal JOURNAL.md de ce qui a été trouvé, corrigé et adapté, avec la notion à retenir). Commandes : /guard-system-100s (contrôle rapide), -activer, -phase <phase>, -desactiver, -relire, -audit, -concevoir, -prod, -nettoyer, -notion <nom>, -installer. À utiliser dès que l'utilisateur veut que guard suive ou supervise un projet, demande le journal ou ce qui a été corrigé, ou dès que l'utilisateur parle de sécurité, de faille, de fuite de données, de clé API, de secret, de .env, de rate limiting, de RLS, d'audit, de revue de code ou de sécurité, de relire ou d'optimiser ce qui vient d'être écrit, de « est-ce que ça marche / c'est propre / optimisé / sécurisé / prêt pour la prod », de mise en ligne, de déploiement, de code mort, de fluidité, de RGPD, ou demande d'expliquer une notion de ce domaine ; et de soi-même à la fin d'une fonctionnalité, avant une mise en ligne, et au début d'un projet ou d'une fonctionnalité qui touche des comptes, de l'argent, des données personnelles ou une IA."
argument-hint: "[-activer | -phase <phase> | -desactiver | -relire | -audit | -concevoir | -prod | -nettoyer | -notion <nom> | -installer]"
---

# guard-system-100s : le garde-fou de ce qu'on code

Argument reçu : `$ARGUMENTS`

## Pourquoi

Ce qu'on crée doit d'abord marcher, puis être optimal, cohérent, sûr et fluide, sans rien oublier
et sans en faire trop. Dans cet ordre : un code élégant qui ne marche pas ne vaut rien (QUA-21) ;
un code qui marche se relit ensuite pour être le plus simple et le plus court possible (QUA-20,
QUA-22). Le système agit sur trois étages :

| Étage | Quand | Ce qui se passe |
|---|---|---|
| Toujours | chaque session, sans rien demander | Le plugin ajoute ses règles au prompt système. Son garde refuse l'écriture d'une clé dans le code ou d'un secret dans ce qui part au navigateur, arrête un `git commit` ou un `git push` qui emporterait un secret, signale le code à risque, et relance Claude avant qu'il rende la main quand du code a changé : pour prouver qu'il marche, et le relire s'il dépasse une trentaine de lignes. |
| Dans un projet en mode guard | pendant qu'il se construit, une fois `-activer` lancé | Un bloc dans le `CLAUDE.md` du projet donne les règles propres à ses contextes et à sa phase. Après chaque réponse qui a écrit du code, le scanner repasse seul ; un nouveau point grave arrive dans la conversation. `JOURNAL.md` garde ce qui a été trouvé, corrigé et adapté, avec la notion à retenir. |
| À la demande | à chaque jalon, à la fin d'une fonctionnalité, avant un commit important | `/guard-system-100s` : le scanner, puis les corrections. `-relire` : la relecture à froid de ce qui a changé. |
| Aux grands moments | début de projet, avant la mise en ligne, de temps en temps | `-concevoir`, `-audit`, `-prod`, `-nettoyer` : la revue avec le référentiel. |

Le savoir est dans ce dossier : `references/` (15 domaines, format dans `references/LISEZ-MOI.md`)
et `NOTIONS.md` (le glossaire). Le scanner `audit.mjs` vérifie ce qu'une machine peut voir seule ;
le reste (qui a le droit de faire quoi, la logique métier, les réglages des fournisseurs) demande
une revue. Dans les commandes ci-dessous, `audit.mjs` désigne `"${CLAUDE_SKILL_DIR}/audit.mjs"`.

## Où vivent les choses

- **Dans le projet** : `__guard-system-100s/`, que le scanner ajoute à `.gitignore`, car il liste
  les points faibles du projet et ne doit pas partir dans un dépôt public.
  - `audit.json` : le dernier contrôle, que lit le bandeau.
  - `revue.json` : les constats d'une revue, que le scanner recompte à chaque passage.
  - `AUDIT.md` : le rapport de la dernière revue complète.
  - `CONCEPTION.md` : les décisions de sécurité prises à la conception.
  - `mode.json` : le mode guard du projet (allumé ou non, phase, contextes).
  - `JOURNAL.md` : le journal à lire pour comprendre et apprendre. Le scanner y écrit les
    « Trouvé » (avec le risque, la correction et la notion à retenir) et les « Résolu » ; Claude
    y écrit les « Corrigé » et les « Adapté ».
- **Seule pièce hors du dossier** : le bloc entre `<!-- guard-system-100s:debut -->` et `:fin` du
  `CLAUDE.md` du projet, posé par `-activer`, après celui du mode recap s'il y en a un. Il est relu
  à chaque session, même sur une machine sans le plugin.
- **Dans ce skill** : `audit.mjs` (le scanner), `regles.mjs` (les motifs, partagés avec le garde du
  plugin), `references/`, `NOTIONS.md`.

## Lire l'argument

Le tiret est facultatif, la casse et les accents aussi :

| Argument et variantes | Action |
|---|---|
| (rien), `-check`, `-controle`, `-rapide` | Contrôle rapide |
| `-activer`, `-allumer`, `-mode`, `-suivre` | Allumer le mode guard du projet |
| `-phase <conception \| en cours \| en ligne>` | Changer la phase du projet |
| `-desactiver`, `-eteindre` | Éteindre le mode guard du projet |
| `-journal` | Montrer le journal du projet |
| `-relire`, `-relecture`, `-revue`, `-review` | Relire ce qui a changé |
| `-audit`, `-complet` | Revue complète |
| `-concevoir`, `-conception`, `-plan`, `-design` | Sécurité dès la conception |
| `-prod`, `-mise-en-ligne`, `-deploy`, `-lancement` | Avant la mise en ligne |
| `-nettoyer`, `-clean`, `-menage`, `-optimiser` | Code mort, propreté, fluidité |
| `-notion <nom>`, `-apprendre <nom>`, `-explique <nom>` | Expliquer une notion |
| `-installer`, `-setup`, `-outils` | Outils et gardes en plus |

Un argument inconnu : montrer ce tableau, ne rien faire d'autre.

## Toujours

1. **La racine** : le dépôt git du dossier de travail (hors git : le dossier de travail). Une
   session ouverte au-dessus de plusieurs projets : demander lequel.
2. **Aucun secret affiché** : ni dans les réponses, ni dans les rapports, ni dans les commandes.
   Le scanner masque (début et longueur) ; faire de même. Ne jamais demander une clé.
3. **La proportion** : un contrôle dont le contexte ne correspond pas au projet est « sans objet ».
   Un contrôle `échelle` se mentionne (« plus tard, si… ») mais ne s'installe pas sans besoin réel.
4. **Apprendre en corrigeant** : chaque constat et chaque correction s'expliquent en une phrase
   simple, avec le nom de la notion (celui de `NOTIONS.md`). L'utilisateur apprend au fil de l'eau.
5. **Rien d'inventé** : chaque problème cite un fichier et une ligne, ou une absence vérifiée.
   Avant d'annoncer un bloquant du scanner, lire la ligne : un faux positif se dit comme tel.
6. **Ne rien commiter** sans l'accord de l'utilisateur.
7. **Ça marche d'abord** : chaque correction faite par ce skill est suivie du build, de la
   vérification des types et des tests du projet. Ce qui casse se répare ou se défait avant
   d'annoncer quoi que ce soit ; ce qui n'a pas pu être vérifié se dit.
8. **Le journal**, quand le mode est allumé : chaque faille ou point faible corrigé, et chaque
   règle appliquée en codant d'une façon qui n'est pas évidente, s'ajoute à la fin de
   `__guard-system-100s/JOURNAL.md`, en trois lignes au plus :
   ```markdown
   ### 24/10 18:20 · Corrigé · BDD-01 · RLS activée sur story_arcs
   Ce qui a été fait : migration `0058_rls.sql`, policy `is_app_user()` comme les autres tables.
   - **À retenir** — **Row Level Security** : la définition de `NOTIONS.md`, ou une phrase à soi.
   ```
   « Adapté » à la place de « Corrigé » pour une règle appliquée en codant, avec « Pourquoi : » à la
   place de « Ce qui a été fait : ». L'heure est celle de la machine. Le journal ne se réécrit
   jamais : on ajoute à la fin.
9. **Un projet sans mode** qui va durer (des comptes, des données, une mise en ligne prévue) : à la
   première commande, proposer `-activer` en une ligne.

## Les actions

### -activer : le mode guard du projet

Le suivi d'un projet pendant qu'il se construit, comme le mode recap : on l'allume une fois, il
reste allumé.
1. `node audit.mjs <racine> --activer`, avec `--phase <conception|en cours|en ligne>` si la phase
   n'est pas évidente (sans elle : « conception » pour un projet sans code, « en cours » sinon) et
   `--nom "<nom>"` si le nom du dossier n'est pas parlant. En une commande : `mode.json`, le bloc du
   `CLAUDE.md` (créé s'il n'existe pas), `__guard-system-100s/` ignoré par git, `JOURNAL.md`, et le
   premier contrôle, dont tout ce qu'il trouve est noté « Trouvé » dans le journal.
2. Montrer le résultat comme un contrôle rapide, et dire en une ligne ce qui change maintenant : le
   bloc du `CLAUDE.md`, le suivi automatique après chaque réponse qui écrit du code, le journal.
3. Pas de `CONCEPTION.md` et un projet qui touche des comptes, de l'argent, des données
   personnelles ou une IA : proposer `-concevoir`.
4. Le mode recap aussi allumé : les deux blocs se suivent dans le `CLAUDE.md`, rien d'autre à faire.

Relancer `-activer` sur un projet déjà en mode met à jour le bloc et refait un contrôle, sans
renoter tout le journal. Les contextes suivent le projet seuls : quand une IA ou des paiements
arrivent, le scanner ajoute leurs règles au bloc et le note au journal.

### -phase, -desactiver, -journal

- **`-phase <phase>`** : `node audit.mjs <racine> --phase "<phase>"`. « en ligne » ajoute au bloc
  les règles d'un projet en production (`-prod` avant chaque mise en ligne, migrations compatibles).
- **`-desactiver`** : `node audit.mjs <racine> --desactiver`. Retire le bloc du `CLAUDE.md`, garde le
  dossier et le journal ; le suivi automatique s'arrête.
- **`-journal`** : lire `__guard-system-100s/JOURNAL.md` et en faire le résumé : l'état du jour, puis
  les dernières entrées (ce qui a été trouvé, corrigé, adapté), et les notions qui reviennent le
  plus, à approfondir avec `-notion`.

### Contrôle rapide (sans argument)

1. `node audit.mjs <racine> --ecrire` (ajouter `--sans-reseau` hors connexion).
2. Lire chaque bloquant et chaque important à sa ligne pour confirmer que c'est réel.
3. Montrer le résultat condensé : le compte, puis une ligne par problème réel, avec ce que c'est,
   pourquoi ça compte (une phrase, sans jargon) et la correction. Les conseillés en un résumé.
4. Proposer de corriger, bloquants d'abord :
   - ce qui se corrige dans le code (ajouter `.env` à `.gitignore`, paramétrer une requête, poser
     un timeout, activer la RLS par une migration) : le faire si l'utilisateur dit oui ;
   - ce que seul l'utilisateur peut faire (révoquer une clé, activer un réglage dans un tableau de
     bord) : lui donner les étapes exactes, l'endroit précis du tableau de bord compris.
5. Relancer `node audit.mjs <racine> --ecrire` et montrer le nouveau compte. Mode allumé : une
   entrée « Corrigé » au journal pour chaque correction (le scanner a déjà noté « Résolu »).
6. Dire en une ligne ce que le scanner ne voit pas. Proposer `-audit` si le projet a des comptes,
   des données personnelles, de l'argent ou de l'IA et qu'aucune revue n'a été faite, ou qu'elle
   date d'avant de gros changements.

### -relire : relire ce qui a changé

À la fin d'une fonctionnalité, ou dès que l'utilisateur demande si ce qui vient d'être écrit peut
être mieux fait. Le garde fait une relecture courte à chaque fin de tour ; celle-ci est à froid, sur
tout le changement.

1. **Le périmètre** : ce que l'utilisateur nomme (un fichier, un dossier, une branche :
   `git diff main...HEAD`) ; sinon, ce qui n'est pas encore commité (`git diff HEAD` et les
   fichiers non suivis de `git status --porcelain`) ; hors git, les fichiers modifiés dans la
   session. Rien n'a changé : le dire, et proposer `-nettoyer` pour tout le projet.
2. **Ça marche (QUA-21)** : trouver les commandes du projet (scripts de `package.json`,
   `pyproject.toml`, `Makefile`…) et lancer le build, la vérification des types et les tests ;
   puis le parcours réel (l'application ou le script lancé, la fonctionnalité essayée, état
   d'erreur et état vide compris ; le navigateur pour une page web). Ce qui casse se corrige
   d'abord : la relecture vient après. Ce qui ne peut pas se lancer ici se note.
3. **La relecture**, comme un architecte relit le diff d'un autre, avec les questions de QUA-20 :
   - plus simple, plus court, autrement ? Une fonction, un composant ou une bibliothèque du projet
     le fait-il déjà (chercher dans le projet, QUA-22) ?
   - des restes : import, paramètre, option, fichier, dépendance, `console.log`, code commenté
     (QUA-03, QUA-05, QUA-10) ? Une duplication (QUA-13) ? Une couche qui ne fait que transmettre
     (QUA-12) ?
   - cohérent avec le code autour : noms, structure, gestion des erreurs, style (QUA-22) ?
   - un calcul, une requête (N+1) ou un rendu de trop (PERF) ? Une erreur avalée (QUA-01) ?
   - la part automatique de la sécurité : `node audit.mjs <racine>`.

   Un gros changement (plus de quelques centaines de lignes, ou plus d'une dizaine de fichiers) se
   confie à un sous-agent qui ne l'a pas vu s'écrire : il reçoit le diff, la racine et ces
   questions, pas nos conclusions, et renvoie `fichier:ligne · constat · ce qui serait mieux`.
   Relire soi-même chaque constat avant de le montrer.
4. **Le constat** : une ligne par point, `fichier:ligne`, ce qui serait mieux et pourquoi en une
   phrase, avec le nom de la notion. D'abord ce qui casse, puis ce qui simplifie le plus. Une
   relecture qui ne trouve rien le dit : c'est un bon résultat, pas un échec.
5. **Appliquer**, avec l'accord de l'utilisateur, puis refaire l'étape 2 : tout marche encore.
6. **Le bilan** : ce qui a été vérifié, ce que la relecture a changé (lignes retirées et
   ajoutées), ce qui reste à vérifier par l'utilisateur. Pour une chasse aux bugs plus poussée :
   `/code-review`.

### -audit : la revue complète

1. **Le profil** : `node audit.mjs <racine> --json --ecrire --historique` donne la stack et les
   contextes. Le code ne dit pas tout : confirmer avec l'utilisateur, en une seule question à
   choix multiples, s'il y a (ou s'il y aura) de vrais utilisateurs, des données personnelles, de
   l'argent, beaucoup de trafic, plusieurs développeurs.
2. **Les domaines** : tous ceux dont au moins un contrôle porte un contexte du projet.
3. **La revue** : pour chaque domaine retenu, lire son fichier de `references/` ; pour chaque
   contrôle applicable, le vérifier dans le code (lire les fichiers concernés, chercher) et conclure :
   `✓` conforme · `✗` problème (fichier et ligne) · `?` à vérifier par l'utilisateur (un réglage de
   fournisseur, par exemple) · `—` sans objet. Ne jamais cocher `✓` sans avoir regardé.
   Gros projet (plus d'une quarantaine de fichiers de code, ou plus de six domaines) : répartir les
   domaines entre des sous-agents en parallèle (trois à cinq domaines chacun). Chacun reçoit la
   racine, le profil, les fichiers de référence à appliquer et ce format de retour :
   `ID · statut · fichier:ligne · constat en une phrase · correction en une phrase`. Revérifier
   soi-même chaque `✗` bloquant remonté avant de l'écrire.
4. **`__guard-system-100s/revue.json`** : les `✗` et les `?`, au format
   `[{ "id": "IAM-03", "gravite": "bloquant", "titre": "…", "fichier": "…", "ligne": 12, "correction": "…", "statut": "ouvert" }]`
   (`statut` : `ouvert`, `corrigé`, `accepté` quand l'utilisateur assume le risque, en connaissance de cause).
5. **`__guard-system-100s/AUDIT.md`**, sur ce modèle :
   ```markdown
   # Audit guard-system-100s · <projet> · <date> · commit <hash>
   Stack : … · Contextes : … · Domaines revus : …

   ## En bref
   | Domaine | ✓ | ✗ | ? | — |
   **Bloquants : N · Importants : N · Conseillés : N**

   ## À corriger
   ### Bloquants
   - **IAM-03 · titre** · `fichier:ligne` · le constat. → La correction. *(notion : IDOR)*
   ### Importants
   ### Conseillés

   ## À vérifier par toi
   ## Conforme
   (une ligne par domaine, les identifiants)
   ## Sans objet
   (les identifiants, et pourquoi : pas de comptes, pas de base…)
   ```
6. `node audit.mjs <racine> --ecrire` : le compte du bandeau inclut maintenant la revue.
7. **Montrer** le tableau par domaine et les bloquants, puis un plan de correction (bloquants,
   importants faciles, le reste). Corriger avec l'accord de l'utilisateur ; passer chaque constat
   corrigé à `"statut": "corrigé"` dans `revue.json`, puis relancer `--ecrire`.

### -concevoir : la sécurité dès la conception

Au début d'un projet, ou avant une fonctionnalité qui touche des comptes, de l'argent, des données
personnelles, des fichiers envoyés ou une IA. Avant d'écrire le code :

1. **Ce qu'on construit** : tiré de la conversation ; sinon, une question.
2. **Les cinq questions** (un modèle de menace simple) :
   - Qu'est-ce qui a de la valeur ici ? Données, argent, comptes, réputation, quotas d'API.
   - Qui pourrait s'en servir mal ? Un visiteur anonyme, un utilisateur connecté curieux, un robot,
     l'IA elle-même trompée par un contenu qu'elle lit.
   - Par où peut-on entrer ? Chaque formulaire, route, webhook, fichier envoyé, page lue par l'IA.
   - Qu'est-ce qui coûte si ça déraille ? Facture d'IA, e-mails envoyés en masse, données perdues.
   - Que se passe-t-il si ça tombe, ou si on perd les données ?
3. **Les décisions** : prendre les contrôles `bloquant` et `important` des domaines concernés et
   les traduire en décisions concrètes pour cette stack. Par exemple : « Auth Supabase ; RLS sur
   chaque table, policies par `auth.uid()` ; rôle admin dans `app_metadata` ; route `/api/generer` :
   utilisateur vérifié, 10 appels par minute, `max_tokens` 1000, plafond de dépense chez le
   fournisseur ».
4. **Ce qu'on ne fait pas encore**, et à partir de quand ce sera utile (les contrôles `échelle`).
5. **`__guard-system-100s/CONCEPTION.md`** : ce qu'on protège, les risques principaux, les
   décisions (avec les identifiants des contrôles), ce qui est remis à plus tard, et la liste
   « avant la mise en ligne » propre au projet.
6. Puis coder en suivant ces décisions.

### -prod : avant la mise en ligne

1. `node audit.mjs <racine> --ecrire --historique`. Un bloquant suffit à dire « pas prêt ».
2. La liste : les contrôles `prod` des domaines applicables, et les bloquants de tous, groupés en :
   secrets et accès · données et sauvegardes · abus et coûts (rate limiting, plafonds et alertes
   de dépense) · navigateur (HTTPS, en-têtes) · suivi (erreurs, disponibilité, alertes) ·
   reprise (rollback, restauration testée) · légal (mentions légales, confidentialité, cookies,
   CGV en cas de vente, accessibilité).
3. Chaque point : `✓`, `✗` ou `?`. Les réglages qu'on ne voit pas dans le code se demandent à
   l'utilisateur, en une seule question groupée.
4. Le verdict : « prêt », « prêt avec réserves » (lesquelles), ou « pas prêt » (les bloquants).
   L'écrire dans `AUDIT.md`, section « Mise en ligne du <date> ». Mode allumé et projet mis en
   ligne : proposer `-phase "en ligne"`.
5. Ce que seul l'utilisateur peut faire, en étapes : 2FA sur les comptes, plafonds de dépense,
   alertes de budget, surveillance de disponibilité.

### -nettoyer : code mort, propreté, fluidité

1. **L'inventaire.** En JS ou TS : `npx knip` (demander avant le premier téléchargement), qui liste
   les fichiers, exports et dépendances inutilisés. Sinon, une recherche à la main : exports jamais
   importés, fichiers jamais importés, dépendances jamais importées. En Python : `vulture` ou
   `ruff check --select F401,F841` s'ils sont installés. Ajouter ce que relève le scanner :
   `console.log`, code commenté, TODO, `any`.
2. **Prouver avant de supprimer.** Chercher chaque nom partout : imports dynamiques, routes par
   fichiers (Next.js, SvelteKit), chaînes de caractères, configuration, tests, documentation.
   Montrer à l'utilisateur ce qui part, groupé (fichiers, exports, dépendances, débogage), avec la
   preuve en un mot.
3. **Supprimer**, avec son accord (`npm uninstall` pour une dépendance), puis lancer le build, la
   vérification des types et les tests. Si quelque chose casse, remettre ce morceau.
4. **La qualité** : duplication (abstraire seulement à partir de trois copies), fonctions trop
   longues, noms flous. Proposer `/simplify` sur les fichiers touchés.
5. **La fluidité** : les contrôles PERF applicables (images, polices, poids du JavaScript,
   re-rendus, N+1, index). Mesurer avant et après (Lighthouse, poids du bundle).
6. **Le bilan** : lignes supprimées, dépendances retirées, poids avant et après si mesuré.

### -notion <nom> : expliquer une notion

1. Trouver la notion dans `NOTIONS.md`, sans tenir compte de la casse ni des accents, en français
   ou en anglais. Absente : prendre la plus proche, et l'expliquer quand même.
2. L'expliquer en quinze lignes au plus :
   - en une phrase ;
   - une image du quotidien ;
   - pourquoi ça compte, avec le risque concret ;
   - à quoi ça ressemble dans le code (un court extrait, dans la stack du projet ouvert si
     possible) ;
   - l'erreur classique ;
   - comment le vérifier (les identifiants des contrôles).
3. Si le projet ouvert en contient un cas, le montrer (fichier et ligne).
4. Sans nom : lister les domaines et leurs notions, et en proposer trois par où commencer, choisies
   d'après le projet ouvert.

### -installer : outils et gardes en plus

Le garde du plugin marche seul. Ceci ajoute des filets :
1. **Le garde `pre-commit` du projet**, pour les commits faits hors de Claude :
   `node audit.mjs <racine> --installer-git`. Il ne remplace jamais un pre-commit existant : il dit
   quelle ligne lui ajouter.
2. **Les outils facultatifs** : gitleaks (secrets, historique compris), osv-scanner (vulnérabilités
   de toutes les dépendances), semgrep (analyse statique du code). Voir lesquels manquent (champ
   `outils` de `audit.json`), proposer la commande d'installation du système (winget ou scoop sous
   Windows, brew sous macOS, le gestionnaire de paquets sous Linux), et ne la lancer qu'avec
   l'accord de l'utilisateur.
3. **GitHub** : les étapes pour activer secret scanning, push protection et les alertes Dependabot
   (Settings → Code security).
4. **Claude Code** : proposer d'interdire la lecture des fichiers de secrets dans
   `.claude/settings.json` du projet (SEC-15).

## Règles

- Jamais de secret affiché, recopié ou demandé.
- Une clé exposée se révoque d'abord chez le fournisseur (SEC-06). C'est l'utilisateur qui le
  fait : lui dire où exactement.
- Le garde ne se contourne pas : pas de `guard:ignore` sans l'accord de l'utilisateur, pas
  d'écriture par un autre chemin, pas de `--no-verify`.
- Pas d'infrastructure `échelle` pour un petit projet : la nommer, dire quand elle deviendra utile.
- Le rapport reste hors de git. Rien n'est commité sans accord.
- Mode recap allumé dans le projet (un dossier `__recap-system-100s/`) : une décision de sécurité
  va aussi dans les décisions de `FABRICATION.md` (skill `fabrication`) ; une variable ou une clé,
  par son nom seulement, dans `RESSOURCES.md` (skill `project-table`).
