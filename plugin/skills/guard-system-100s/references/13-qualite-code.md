# 13 · Qualité, code mort, tests, lisibilité (QUA)

Un code de qualité est un code qu'on peut modifier sans peur : il dit clairement ce qu'il fait, il
échoue bruyamment quand quelque chose ne va pas, des tests préviennent quand on casse, et il ne
contient rien d'inutile. **Chaque ligne est à relire, tester et maintenir** : le meilleur code est
souvent celui qu'on supprime. Avec une IA, le code s'écrit vite et s'empile, et les restes
(fonctions remplacées, fichiers abandonnés, `console.log`, `any`) s'accumulent. Ce domaine vise le
juste milieu : propre et lisible, sans architecture de cathédrale pour un projet de trois pages.

**L'ordre** : d'abord, ça marche, et c'est prouvé (QUA-21). Ensuite, c'est optimal et cohérent :
rien d'inutile (QUA-03), rien de réinventé (QUA-22), rien de trop (QUA-12). Enfin, chaque création
est relue une fois qu'elle marche, pour voir si elle peut être plus simple (QUA-20).

---

### QUA-01 · Aucune erreur n'est avalée en silence
`important` · `tout` · `auto`

**Pourquoi** — Un `catch {}` vide ou un `except: pass` fait disparaître l'erreur : le paiement a
échoué, l'e-mail n'est pas parti, la sauvegarde est vide, et rien ne le signale. Le bug se montre
plus tard, ailleurs, et on cherche des heures. C'est l'un des défauts les plus fréquents du code
généré.
**Vérifier** — `node audit.mjs` (`catch` vides, `except: pass`). Chercher aussi `.catch(() => {})`,
`catch (e) { console.log(e) }` sans autre action, `except Exception: return None`, un `try` qui
enveloppe toute une fonction, et les promesses lancées sans `await` ni `.catch` (règle
`@typescript-eslint/no-floating-promises`).
**Corriger** — Pour chaque `catch`, choisir : **gérer** (un vrai repli, plus une ligne de journal),
**enrichir et relancer** (ajouter le contexte), ou **ne pas attraper** (laisser remonter jusqu'au
gestionnaire global, OBS-01).
```ts
try {
  await envoyerFacture(commande)
} catch (err) {
  throw new Error(`Facture non envoyée pour la commande ${commande.id}`, { cause: err })
}
```
```python
try:
    envoyer_facture(commande)
except SmtpError:                     # l'erreur prévue, pas toutes
    log.warning("facture_differee", commande_id=commande.id)
    planifier_nouvel_essai(commande)  # un vrai repli
```
Si ignorer est voulu, l'écrire : `catch { /* pas de cache local au premier lancement : normal */ }`.
Lint : `no-empty` (ESLint), `noEmptyBlockStatements` (Biome) ; Ruff `E722` (`except:` nu), `S110`
(`try`-`except`-`pass`), `BLE001` (`except Exception` trop large).
**Piège** — Attraper pour journaliser, puis continuer comme si de rien n'était : l'erreur est dans
les journaux, mais la suite tourne avec des données fausses.
**Notions** — Gestion des erreurs

---

### QUA-02 · Les erreurs surviennent tôt, clairement, et disent quelque chose d'utile
`important` · `tout`

**Pourquoi** — Une donnée invalide qui entre en silence explose trois fonctions plus loin, avec un
message sans rapport (`Cannot read properties of undefined`). Échouer tôt, c'est vérifier à l'entrée
et s'arrêter tout de suite avec un message précis. Côté utilisateur, « Une erreur est survenue » ne
l'aide pas, et une trace technique l'inquiète tout en renseignant un attaquant.
**Vérifier** — Les entrées (formulaires, requêtes, fichiers, variables d'environnement) sont-elles
validées dès la frontière (INJ, SEC-12) ? Les messages internes disent-ils quoi, sur quoi et
pourquoi ? Les messages affichés disent-ils quoi faire ? Les codes HTTP sont-ils justes (API) ?
**Corriger** — Valider à l'entrée avec un schéma (Zod, Valibot, Pydantic) et refuser tout de suite.
Deux messages par erreur : un pour les journaux (technique, avec identifiants), un pour l'utilisateur
(simple, actionnable, sans détail interne, avec l'identifiant de corrélation d'OBS-10) : « Le
paiement n'a pas abouti. Réessaie, ou écris-nous avec le code 7f3a9c. » Un gestionnaire global qui
journalise et répond proprement : `app.use((err, req, res, next) => …)` (Express), `app.onError`
(Hono), `exception_handler` (FastAPI), `error.tsx` (Next.js).
**Notions** — Gestion des erreurs

---

### QUA-03 · Le code mort est supprimé : fichiers, exports, fonctions, dépendances, routes, styles, flags
`important` · `tout`

**Pourquoi** — Le **code mort** (que plus rien n'appelle) coûte sans rien rapporter : on le relit, on
le met à jour, l'IA s'en inspire pour écrire du neuf, et il cache le code utile. Une route d'API
oubliée reste attaquable ; une dépendance inutilisée reste une porte d'entrée (LIV-05) et alourdit
chaque installation. Sans code mort, le projet est plus court, donc plus clair.
**Vérifier** —
- **JS/TS** : `npx knip` liste fichiers, exports, types et dépendances inutilisés (et les dépendances
  manquantes) ; ses plugins comprennent Next.js, Vite, Vitest, ESLint et bien d'autres.
- **Python** : `vulture .` (fonctions, classes, variables jamais utilisées) ; `ruff check --select
  F401,F841` (imports et variables inutilisés) ; `deptry .` (dépendances déclarées mais jamais
  importées).
- **À la main** : routes d'API que plus rien n'appelle ; classes et variables CSS jamais utilisées
  (onglet Coverage des outils de développement de Chrome) ; images et fichiers non référencés ;
  feature flags à 100 % depuis longtemps (LIV-16) ; scripts obsolètes de `package.json` ; variables
  de `.env.example` que le code ne lit plus.

**Corriger** — Supprimer, après la preuve de QUA-04, dans un commit dédié facile à annuler.
`npx knip --fix` retire exports et dépendances inutilisés ; `--allow-remove-files` supprime aussi les
fichiers : relire le diff avant de valider. Lancer `knip` en CI pour que le code mort ne revienne
pas. `depcheck`, archivé en 2025 (ses auteurs renvoient vers knip), et `ts-prune`, limité aux
exports, sont avantageusement remplacés par knip.
**Piège** — Garder une fonction « au cas où » : git la garde pour toi. La supprimer coûte une ligne ;
la retrouver, un `git log -S nomDeLaFonction`.
**Notions** — Code mort, YAGNI, Dette technique

---

### QUA-04 · On prouve qu'un code est inutilisé avant de le supprimer
`important` · `tout`

**Pourquoi** — Un outil ou une recherche peut conclure « inutilisé » à tort, et la suppression casse
la prod. Faux positifs classiques :
- imports au chemin calculé : `` import(`./locales/${langue}.js`) `` ;
- fichiers chargés par leur nom : `page.tsx`, `route.ts`, `layout.tsx` et `middleware.ts` de
  Next.js, fichiers de `api/` sur Vercel, `supabase/functions/*` ;
- références dans la configuration : `wrangler.jsonc`, `vercel.json`, `manifest.json` d'une
  extension, `appsscript.json`, workflows, champs `bin` et `exports` de `package.json` ;
- Google Apps Script : `onOpen`, `doGet`, `doPost`, fonctions de déclencheurs, de menus ou appelées
  depuis une cellule (`=MAFONCTION()`) ;
- code appelé de l'extérieur : API publique, webhook, outil d'un serveur MCP, autre dépôt.

**Vérifier** — Pour chaque élément : `git grep -n "nom"` dans tout le dépôt (config, HTML, tests et
chaînes de caractères compris) ; les conventions de fichiers du framework ; pour une route, les
journaux (OBS-04) disent si elle reçoit encore du trafic ; pour un export d'un paquet publié, le
retirer est une rupture de compatibilité (version majeure, LIV-14).
**Corriger** — Ne supprimer que ce qui est prouvé inutile. Déclarer dans `knip.json` les points
d'entrée que l'outil ne devine pas (`entry`, `ignore`), pour que son rapport reste juste. Après
suppression : build, tests, et un tour des parcours principaux en préversion (LIV-09). Une route
publique ne disparaît pas d'un coup : on la journalise, on l'annonce obsolète, puis on la retire.
**Notions** — Code mort, Refactoring

---

### QUA-05 · Aucun `console.log` ni `print` de débogage ne reste dans le code livré
`important` · `tout` · `auto`

**Pourquoi** — Les traces de débogage (`console.log(user)`, `print(response)`) finissent dans la
console du navigateur, visible de tous, ou dans les journaux de prod, avec jetons et données
personnelles (SEC-11). Elles noient les vrais messages et signalent un code pas fini.
**Vérifier** — `node audit.mjs` (`console.log` de débogage, et ceux qui affichent un secret).
Chercher `console.log`, `console.debug`, `debugger`, `print(`, `pprint`, `breakpoint()`, et les
objets entiers affichés (`req`, `res`, `data`, `error`).
**Corriger** — Retirer les traces de débogage avant le commit ; ce qui doit rester devient un vrai
journal, avec un niveau et des champs choisis (OBS-04). Côté navigateur, rien en prod sauf les
erreurs, envoyées au suivi (OBS-01). Lint : `no-console` (ESLint, avec `allow: ['warn', 'error']`)
ou `noConsole` (Biome) ; Ruff `T201` (`print`) et `T203` (`pprint`). Sur Cloudflare Workers et
Apps Script, `console.log` est le canal officiel des journaux : le garder, pour des messages voulus
et structurés.
**Piège** — `console.log(error)` comme seule gestion dans un `catch` : c'est une erreur avalée avec
un alibi (QUA-01).
**Notions** — Logging, Code mort

---

### QUA-06 · TypeScript est en mode strict, sans `any` ni `@ts-ignore` injustifiés
`important` · `tout` · `auto`

**Pourquoi** — Le typage strict fait vérifier par le compilateur, avant l'exécution, une bonne part
des erreurs bêtes : valeur peut-être `undefined`, mauvais type passé, propriété mal orthographiée.
`any` coupe ce contrôle pour une variable et contamine tout ce qu'elle touche ; `@ts-ignore` fait
taire une erreur sans la corriger, et taira aussi la suivante.
**Vérifier** — `node audit.mjs` (`@ts-ignore`, `any`). `tsconfig.json` : `"strict": true` (le défaut
depuis TypeScript 6.0, mais un `"strict": false` hérité peut traîner) ; `npx tsc --noEmit` passe ;
compter les `any`, `as any`, `@ts-ignore`, `@ts-nocheck` et les `!` (assertion « non nul ») en
série.
**Corriger** — `"strict": true` et, si possible, `"noUncheckedIndexedAccess": true`. À la place de
`any` : le vrai type, `unknown` suivi d'une vérification, ou un schéma Zod qui valide et type d'un
coup (`z.infer`). Les types de la base se génèrent (`supabase gen types`). Exception inévitable :
`// @ts-expect-error raison précise`, qui se plaindra le jour où l'erreur disparaît, contrairement à
`@ts-ignore`. Lint : `@typescript-eslint/no-explicit-any` et `@typescript-eslint/ban-ts-comment`, ou
`noExplicitAny` et `noTsIgnore` (Biome). Python : annotations de types vérifiées par `pyright` ou
`mypy` en CI, et pas de `# type: ignore` sans raison.
**Piège** — Passer d'un coup en strict sur un gros projet et « réparer » 400 erreurs avec des
`as any`. On corrige fichier par fichier.
**Notions** — Typage strict, Dette technique

---

### QUA-07 · Un linter et un formateur tournent automatiquement
`important` · `tout`

**Pourquoi** — Un **linter** lit le code et signale les erreurs probables : variable inutilisée,
promesse oubliée, comparaison douteuse. Un **formateur** fixe la mise en page (espaces, guillemets,
retours à la ligne) pour que personne n'ait à en débattre. Automatiques, ils attrapent ce qu'une
relecture rate, et les diffs ne montrent plus que les vrais changements.
**Vérifier** — Une config existe (`eslint.config.js`, `biome.json`, `.prettierrc`, `[tool.ruff]` dans
`pyproject.toml`) ; `lint` et `format` sont des scripts de `package.json` ; la CI les lance
(LIV-08) ; le lint passe sans centaines d'avertissements ignorés.
**Corriger** — Choisir une pile et s'y tenir :
| Stack | Lint | Format |
|---|---|---|
| JS/TS, classique | ESLint et `typescript-eslint` | Prettier |
| JS/TS, un seul outil rapide | Biome | Biome |
| Python | Ruff (`ruff check`) | Ruff (`ruff format`) |

Formater à l'enregistrement dans l'éditeur ; vérifier en CI (`prettier --check`, `biome ci`,
`ruff format --check`). Les règles propres au framework (`eslint-plugin-react-hooks`, config ESLint
de Next.js) attrapent des bugs propres à React. Au besoin, un hook `pre-commit` (lefthook, husky,
pre-commit) sur les fichiers modifiés.
**Piège** — Des milliers d'avertissements « à traiter plus tard » : plus personne ne voit le nouveau.
On corrige, ou on désactive la règle, mais le rapport reste à zéro.
**Notions** — Lint, Formatage

---

### QUA-08 · Les tests couvrent ce qui casse et ce qui coûte
`important` · `tout`

**Pourquoi** — On ne teste pas tout : on teste là où une erreur coûte cher ou arrive souvent. Les
calculs d'argent (prix, TVA, remises, arrondis) ; les droits d'accès (un utilisateur ne voit pas les
données d'un autre, IAM) ; l'analyse de données venues de l'extérieur (CSV importés, webhooks,
réponses d'API, dates et fuseaux) ; les règles qui ont déjà eu un bug. Un test est un garde-fou qui
crie le jour où une modification casse ce qui marchait, y compris une modification faite par une IA.
**Vérifier** — Une commande `test` existe et passe ; les zones à risque ci-dessus ont leurs tests ;
chaque bug corrigé a gagné un test ; la CI les lance (LIV-08).
**Corriger** — Vitest (Vite, Next.js, Hono ; Workers via `@cloudflare/vitest-pool-workers`), le
lanceur intégré `node --test`, ou `pytest`. Pour un bug : écrire d'abord le test qui le reproduit, le
voir échouer, puis corriger. Tester les droits contre une vraie base de test (Supabase en local avec
`supabase start`) : une base simulée ne vérifie pas la Row Level Security.
```ts
test("un utilisateur ne lit pas les factures d'un autre", async () => {
  const { data } = await clientConnecte(alice).from('factures').select().eq('user_id', bob.id)
  expect(data).toEqual([])
})
```
**Piège** — Courir après 100 % de couverture : on finit par tester des détails sans risque, et ces
tests cassent à chaque réorganisation du code sans rien protéger.
**Notions** — Tests, Pyramide des tests

---

### QUA-09 · Les tests visent le comportement, et quelques tests de bout en bout gardent les parcours critiques
`conseillé` · `web`

**Pourquoi** — La **pyramide des tests** recommande beaucoup de tests unitaires (une fonction
seule), moins de tests d'intégration (plusieurs morceaux ensemble : une route et sa base) et
quelques tests de bout en bout (un vrai navigateur qui clique comme un utilisateur). Pour une
application web, ce sont souvent les tests d'intégration qui donnent le plus de confiance par minute
écrite. Les tests unitaires de détails internes (« la fonction privée est appelée deux fois »)
cassent à chaque refactoring sans rien protéger.
**Vérifier** — Les tests vérifient-ils ce que voit l'utilisateur ou ce que renvoie l'API, plutôt que
des détails internes ? Les deux ou trois parcours dont vit le projet (inscription, connexion,
paiement, action principale) ont-ils un test de bout en bout ? Ces tests sont-ils stables ?
**Corriger** — Tests d'intégration sur les routes et la base (requête → réponse, base de test).
Tests de bout en bout avec Playwright, peu nombreux, sur les parcours critiques, lancés en CI contre
un serveur local ou la préversion :
```ts
test('achat', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Ajouter au panier' }).click()
  await page.getByRole('link', { name: 'Panier' }).click()
  await expect(page.getByText('Total : 19,90 €')).toBeVisible()
})
```
Sélectionner par rôle et par texte, comme un utilisateur, jamais par classe CSS.
**Piège** — Garder un test qui échoue au hasard : on finit par ignorer tous les échecs. Il se répare
ou se supprime.
**Notions** — Pyramide des tests, Tests de bout en bout, Tests

---

### QUA-10 · Aucun bloc de code commenté n'est gardé « au cas où »
`conseillé` · `tout` · `auto`

**Pourquoi** — Le code commenté ne s'exécute pas, ne se teste pas et vieillit : dans trois mois,
personne ne sait s'il faut le garder, et il ne compilerait plus. Git garde déjà toutes les versions.
**Vérifier** — `node audit.mjs` (blocs de code commenté) ; Ruff `ERA001` en Python.
**Corriger** — Supprimer. Pour garder une piste, une phrase dans le message de commit ou un ticket
suffit ; l'ancien code se retrouve avec `git log -S "un morceau du code"`. Un exemple d'usage utile
va dans la documentation ou dans un test, pas en commentaire.
**Notions** — Code mort, Commentaires

---

### QUA-11 · Les TODO sont datés ou deviennent des tickets, et la dette est notée
`conseillé` · `tout` · `auto`

**Pourquoi** — La **dette technique** est le raccourci pris aujourd'hui qu'il faudra payer plus tard
(code dupliqué, test manquant, solution provisoire). Prise exprès et notée, c'est un choix
d'architecte ; cachée, elle grossit avec les intérêts. Un `// TODO` sans date ni contexte devient
invisible : on en trouve des dizaines, vieux de deux ans, que personne n'ose toucher.
**Vérifier** — `node audit.mjs` (TODO, FIXME, HACK, XXX). Pour chacun : son âge (`git blame`), et
est-il encore vrai ? Un FIXME sur un chemin de paiement ou de sécurité passe en priorité.
**Corriger** — Un TODO dit quoi, pourquoi et quand :
`// TODO(2026-11) retirer après la migration des anciens comptes (#42)`. Ce qui dépasse une semaine
devient un ticket (issue GitHub avec l'étiquette `dette`) ou une ligne d'un `DETTE.md`. Rembourser
par petits bouts : un peu de **refactoring** (changer la structure du code sans changer ce qu'il
fait, sous la protection des tests) à chaque passage dans une zone, dans des commits séparés des
nouveautés (QUA-18). Lint : `no-warning-comments` (ESLint) ; règles `TD` et `FIX` de Ruff.
**Notions** — Dette technique, Refactoring, Commentaires

---

### QUA-12 · Pas de sur-ingénierie : rien n'est construit pour un besoin qui n'existe pas encore
`conseillé` · `tout`

**Pourquoi** — **KISS** (« Keep It Simple, Stupid » : fais simple) et **YAGNI** (« You Aren't Gonna
Need It » : tu n'en auras pas besoin) disent la même chose : la solution la plus simple qui répond
au besoin d'aujourd'hui est la meilleure. Une couche d'abstraction, une option ou une interface
« pour plus tard » se paient tout de suite (à lire, tester, maintenir) pour un gain hypothétique, et
le jour venu, le besoin est rarement celui qu'on avait imaginé.
**Vérifier** — Interfaces à une seule implémentation ; fabriques (factories), « managers » et
« services » qui ne font que transmettre l'appel ; options et paramètres que personne n'utilise ;
code générique pour un seul cas ; microservices, file de messages ou cache pour une poignée
d'utilisateurs (PERF, ASY) ; dossiers `utils/`, `core/` ou `shared/` plus gros que l'application.
**Corriger** — Supprimer la couche qui ne fait que transmettre et appeler directement ; remplacer le
générique par le cas concret ; reporter l'abstraction au jour où arrive le deuxième vrai cas
(QUA-13). Pour chaque ajout, une question : quel problème réel cela résout-il aujourd'hui ?
**Piège** — Lire YAGNI comme une permission de négliger ce qui coûte très cher à changer plus tard :
la sécurité, le modèle de données, les identifiants, le format d'une API publique. Ces décisions
difficiles à défaire se réfléchissent avant ; pour le reste, on simplifie.
**Notions** — KISS, YAGNI, Complexité

---

### QUA-13 · La duplication se traite à la troisième fois, et seulement si c'est la même règle
`conseillé` · `tout`

**Pourquoi** — **DRY** (« Don't Repeat Yourself » : ne te répète pas) demande qu'une même
connaissance (règle de calcul, validation, constante) n'existe qu'à un seul endroit, sinon on la
corrige ici et on l'oublie là. Mais deux morceaux de code qui se ressemblent ne portent pas forcément
la même règle. Les fusionner trop tôt crée une abstraction pleine de `if (casA)`, plus difficile à
changer que la duplication : une copie coûte moins cher qu'une mauvaise abstraction.
**Vérifier** — Règles métier recopiées (prix calculé côté client **et** côté serveur, validations
différentes entre formulaire et API) ; fonctions « génériques » dont un booléen change tout le
comportement. `npx jscpd` repère les copier-coller.
**Corriger** — Règle de trois : deux copies se tolèrent, on factorise à la troisième, quand ce qui
est commun est clair. Une règle métier vit en un seul endroit, côté serveur ; le client la réutilise
(schéma Zod partagé) ou se contente d'afficher. À l'inverse, défaire une abstraction qui sert des cas
devenus différents : recopier, puis simplifier chaque copie.
**Notions** — DRY, Duplication, Refactoring

---

### QUA-14 · Les noms disent l'intention, et chaque fonction a un seul rôle
`conseillé` · `tout`

**Pourquoi** — On lit le code bien plus souvent qu'on ne l'écrit. Un bon nom évite un commentaire ;
un mauvais (`data`, `tmp`, `handle`, `doStuff`, `utils2`) oblige à lire tout le corps. La
**séparation des responsabilités** veut qu'une fonction ou un module n'ait qu'une raison de changer :
une fonction qui valide, calcule, enregistre et envoie un e-mail casse dès que l'une des quatre
choses change.
**Vérifier** — Fonctions très longues, ou dont le nom contient « et » ; fichiers de plusieurs
centaines de lignes qui mélangent affichage, appels réseau et règles métier ; noms vagues ou
trompeurs (`getUser` qui crée aussi un compte) ; booléens muets (`flag`, `check`).
**Corriger** — Nommer par l'intention : `prixTtc`, `estAbonneActif`, `envoyerRecuDePaiement` ; les
booléens commencent par `est`, `a`, `peut` (ou `is`, `has`, `can`). Une seule langue de nommage par
projet. Découper en fonctions courtes, appelées dans l'ordre par une fonction qui orchestre. Quand le
projet grandit, ranger par fonctionnalité (`facturation/`, `comptes/`) plutôt que par type technique.
**SOLID** regroupe cinq principes de conception objet : responsabilité unique ; ouvert-fermé
(ajouter un cas sans modifier l'existant) ; substitution de Liskov (un sous-type remplace son parent
sans surprise) ; ségrégation des interfaces (de petites interfaces ciblées) ; inversion des
dépendances (recevoir ses dépendances en paramètre plutôt que les créer). Ce sont des boussoles :
appliqués à la lettre dans un petit projet JS, ils produisent une forêt de classes et d'interfaces
(QUA-12). Les deux plus rentables : une responsabilité par module, des dépendances passées en
paramètre pour pouvoir tester.
**Piège** — Découper à l'excès : vingt fonctions de deux lignes dispersées dans dix fichiers se
lisent aussi mal qu'une fonction de deux cents lignes.
**Notions** — Nommage, Séparation des responsabilités, SOLID

---

### QUA-15 · La complexité reste basse : retours anticipés, peu d'imbrication, pas de nombres magiques
`conseillé` · `tout`

**Pourquoi** — Chaque `if`, boucle ou `try` imbriqué multiplie les chemins à comprendre et à tester ;
c'est ce que mesure la complexité cyclomatique. Au-delà de trois niveaux d'imbrication, on ne sait
plus quel `else` répond à quel `if`. Un **nombre magique** (`86400000`, `0.2`, `10`) est une valeur
en dur dont personne ne sait plus d'où elle vient, recopiée à plusieurs endroits et modifiée à un
seul.
**Vérifier** — Imbrications profondes, `else` après un `return`, fonctions aux nombreux chemins ;
règles `complexity` et `max-depth` (ESLint), `noExcessiveCognitiveComplexity` (Biome), `C901`
(Ruff) ; nombres et chaînes répétés sans nom.
**Corriger** — Retours anticipés (early return) : traiter d'abord les cas qui sortent, puis le cas
normal, à plat.
```ts
// Avant : trois niveaux et deux nombres magiques
function remise(client) {
  if (client) { if (client.actif) { if (client.commandes > 10) return 0.1 } }
  return 0
}
// Après
const SEUIL_FIDELITE = 10    // commandes
const REMISE_FIDELITE = 0.1
function remise(client) {
  if (!client?.actif) return 0
  return client.commandes > SEUIL_FIDELITE ? REMISE_FIDELITE : 0
}
```
Les durées se lisent mieux en calcul (`const UN_JOUR_MS = 24 * 60 * 60 * 1000`), les états en
constantes ou en union de types (`'brouillon' | 'payee'`) plutôt qu'en chaînes libres.
**Notions** — Complexité, Nombres magiques

---

### QUA-16 · Les effets de bord sont regroupés aux bords, la logique reste pure
`conseillé` · `tout`

**Pourquoi** — Un **effet de bord** est tout ce qu'une fonction fait d'autre que renvoyer un
résultat : écrire en base, envoyer un e-mail, modifier une variable globale ou l'objet reçu, lire
l'heure. Une fonction **pure** (même entrée, même sortie, rien d'autre) se comprend et se teste en
une ligne. Mêlée aux effets de bord, la même logique devient difficile à tester et réserve des
surprises : `calculerTotal()` qui vide aussi le panier.
**Vérifier** — Fonctions de calcul qui appellent la base ou `fetch` ; fonctions qui modifient leurs
arguments (`liste.sort()` trie le tableau d'origine) ; code exécuté au simple import d'un module
(connexion, lecture de fichier) ; noms qui cachent une écriture (`getX` qui écrit).
**Corriger** — Séparer « décider » et « faire » : la logique calcule à partir des données reçues ;
une fonction d'orchestration lit, appelle la logique, puis écrit.
```ts
const facture = calculerFacture(panier, tarifs, new Date())  // pur : testable sans base
await enregistrerFacture(facture)                           // effets de bord, à part
await envoyerRecu(facture)
```
Passer l'heure, l'aléatoire et les clients d'API en paramètre ; préférer les copies (`toSorted()`,
`{ ...objet }`) aux modifications en place.
**Notions** — Effets de bord, Séparation des responsabilités, Tests

---

### QUA-17 · Les commentaires disent pourquoi, pas ce que fait le code
`conseillé` · `tout`

**Pourquoi** — Le code dit déjà ce qu'il fait ; un commentaire qui le répète (`i++ // incrémente i`)
est du bruit qui finit par mentir quand le code change. Ce que le code ne peut pas dire, c'est
**pourquoi** : la contrainte cachée, le bug contourné, la décision et l'alternative écartée.
**Vérifier** — Commentaires qui paraphrasent la ligne suivante ; commentaires que le code contredit ;
logique surprenante sans un mot d'explication ; commentaires générés qui décrivent chaque ligne.
**Corriger** — Supprimer les paraphrases ; renommer plutôt que commenter (QUA-14) ; écrire les
« pourquoi » :
```ts
// Stripe peut livrer le même événement plusieurs fois : on ignore les identifiants déjà traités.
```
Documenter le contrat des fonctions publiques d'une bibliothèque (JSDoc, docstrings), pas leur
fonctionnement interne. Les décisions d'architecture vont dans `FABRICATION.md` (mode recap) ou un
fichier de décisions, pas dans un commentaire.
**Notions** — Commentaires, Documentation

---

### QUA-18 · Les commits sont petits, cohérents, et leur message dit pourquoi
`conseillé` · `tout`

**Pourquoi** — Un **commit atomique** contient un seul changement logique, complet : le projet
marche après lui. On peut alors le relire, l'annuler (`git revert`) ou retrouver quand un bug est
apparu (`git bisect`) sans défaire trois autres choses. Un commit « corrections diverses » de
2 000 lignes rend tout cela impossible.
**Vérifier** — `git log --oneline -20` : les messages disent-ils ce qui change ? Des commits
mélangent-ils reformatage, refactoring et nouveauté ?
**Corriger** — Un commit, une intention ; `git add -p` sépare les morceaux d'un même fichier. Le
message : un titre court qui dit quoi, puis si utile une ligne qui dit pourquoi. La convention
Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`) aide si l'on génère un journal des
changements. Le reformatage d'ensemble et la suppression de code mort ont chacun leur commit.
**Notions** — Commits atomiques, Revue de code

---

### QUA-19 · Le README dit à quoi sert le projet et comment le lancer
`conseillé` · `tout`

**Pourquoi** — Le premier lecteur du README est souvent toi dans six mois, ou une IA qui découvre le
projet. Sans lui, relancer le projet commence par une heure d'archéologie : quelle version de Node,
quelles variables, quelle commande, quelle base ?
**Vérifier** — Un README à la racine ; un dossier cloné à neuf se lance en suivant seulement le
README ; les commandes indiquées existent encore.
**Corriger** — Court et à jour plutôt que long et faux :
```markdown
# Nom : ce que fait le projet, en une phrase
Prérequis : Node 24, un projet Supabase
Lancer : cp .env.example .env (remplir, voir les commentaires) · npm ci · npm run dev
Tester : npm test · Déployer : push sur main (Vercel)
Liens : site en prod, tableau de bord, runbook (docs/runbook.md)
```
Fixer la version de l'environnement (`engines` dans `package.json`, `.nvmrc`, `.python-version`).
La fiche et `RESSOURCES.md` du mode recap complètent le README sans le remplacer. Le reste de la
documentation vit près du code, et seulement pour ce qui ne se devine pas.
**Notions** — Documentation

---

### QUA-20 · Chaque création est relue pour être optimale, et chaque changement avant de partir
`important` · `tout`

**Pourquoi** — La **revue de code** est la relecture d'un changement : elle attrape les oublis, le
code mort laissé derrière, le secret collé par erreur, la logique incompréhensible. Le premier jet
marche rarement de la façon la plus simple : une fois qu'il marche, on comprend mieux le problème,
et la deuxième version est souvent bien plus courte. Seul, on ne voit pas ses propres erreurs dans
le feu de l'écriture ; relire le diff à froid, comme celui d'un autre, change tout. Avec une IA qui
écrit vite, c'est le moment où l'on reprend la main.
**Vérifier** — Chaque fonctionnalité est-elle relue une fois qu'elle marche, avant d'être déclarée
finie ? Le diff est-il relu avant chaque commit ou fusion ? Les PR restent-elles relisibles
(quelques centaines de lignes au plus) ? En `équipe`, une approbation est-elle exigée (LIV-15) ?
**Corriger** — Après chaque création, une fois qu'elle marche (QUA-21), relire le diff avec les
questions de l'architecte :
- Peut-on faire plus simple, plus court, autrement ? Une fonction, un composant ou une
  bibliothèque du projet le fait-il déjà (QUA-22) ?
- Reste-t-il du code mort : import, paramètre, option, fichier ou dépendance qui ne sert pas
  (QUA-03) ? Une duplication (QUA-13) ? Une couche qui ne fait que transmettre (QUA-12) ?
- Est-ce cohérent avec le code autour : noms, structure, gestion des erreurs (QUA-22) ?
- Un calcul, une requête ou un rendu de trop (PERF) ? Une erreur avalée (QUA-01) ? Un secret (SEC) ?

Appliquer ce qui améliore vraiment, puis revérifier que tout marche. Dans Claude Code, le garde du
plugin le rappelle avant de rendre la main quand du code a changé ; `/guard-system-100s -relire`
relit à froid tout ce qui a changé ; `/simplify` cherche à réutiliser et simplifier ;
`/code-review` cherche les bugs. Avant de commiter : `git diff --staged`, ligne par ligne. En
équipe : de petites PR, une description qui dit pourquoi, des remarques sur le code, jamais sur la
personne.
**Piège** — Accepter un gros diff généré parce que « les tests passent » : ils ne vérifient que ce
qu'ils testent. Lire au moins les parties sensibles : droits, argent, données. À l'inverse,
réécrire pour le plaisir : une relecture qui ne trouve rien à améliorer est un bon résultat.
**Notions** — Revue de code, Refactoring, Commits atomiques

---

### QUA-21 · Le code marche, et c'est prouvé avant de dire « fini »
`bloquant` · `tout`

**Pourquoi** — C'est l'impératif, avant toute autre qualité : un code propre, sûr et rapide qui ne
marche pas ne vaut rien. « Ça compile » ne veut pas dire « ça marche », ni « les tests passent »
quand aucun test ne touche ce qu'on vient de changer. Le bug le plus coûteux est la
**régression** : une modification ici qui casse sans bruit ce qui marchait là-bas, et que
l'utilisateur découvre avant toi.
**Vérifier** — Le build passe ; la vérification des types passe (`tsc --noEmit`, `pyright`) ; les
tests passent ; le parcours réel a été essayé (l'application lancée, la fonctionnalité utilisée
comme le ferait l'utilisateur, avec ses cas limites : vide, erreur, valeur extrême) ; les parcours
voisins marchent encore. Dans une revue complète, lancer ces commandes plutôt que les supposer.
**Corriger** — Une **définition de fini** courte, appliquée à chaque changement :
1. build et types sans erreur ;
2. tests existants verts, plus un test si le changement touche à ce qui casse ou coûte (QUA-08) ;
3. le parcours réel essayé (page ouverte, script lancé, requête envoyée), état d'erreur et état
   vide compris ;
4. ce qui a été vérifié, et ce qui n'a pas pu l'être, dit en clair.

Les commandes vivent dans `package.json` (`build`, `typecheck`, `test`) ou leur équivalent, pour
qu'une ligne prouve tout : `npm run build && npm run typecheck && npm test`. Dans Claude Code, le
garde du plugin relance Claude avant qu'il rende la main si du code a changé sans que rien ait
tourné depuis.
**Piège** — Déclarer fini sur la foi d'une relecture, ou d'un test qui simule tout (base, réseau,
droits) : il prouve que la simulation marche. Et « ça devrait marcher » : soit on l'a vu marcher,
soit on dit qu'on ne l'a pas vu.
**Notions** — Définition de fini, Régression, Tests

---

### QUA-22 · Le nouveau code réutilise ce qui existe et suit les conventions du projet
`important` · `tout`

**Pourquoi** — Un projet cohérent se lit comme s'il avait été écrit par une seule personne : une
seule façon d'appeler l'API, de valider, de gérer les erreurs, de nommer. Chaque variante ajoutée
(un deuxième client HTTP, une deuxième bibliothèque de dates, un utilitaire réécrit à côté de celui
qui existe) double ce qu'il faut connaître et maintenir, et une correction faite dans l'une
n'atteint pas l'autre. Une IA, qui ne voit qu'une partie du projet, réinvente volontiers ce qui
existe déjà.
**Vérifier** — Avant d'écrire : une fonction, un composant, un hook, un type ou une bibliothèque du
projet fait-il déjà le travail (`git grep`, le dossier des composants, `package.json`) ? Dans le
code : deux bibliothèques pour un même rôle (`axios` et un `fetch` maison, `moment` et `dayjs`,
deux gestionnaires d'état, deux bibliothèques de validation) ; des utilitaires presque identiques ;
des styles mêlés (`async`/`await` et `.then`, classes et fonctions, deux langues de nommage, deux
conventions de fichiers).
**Corriger** — Réutiliser l'existant, quitte à l'étendre un peu ; sinon, écrire comme le code
voisin : mêmes noms, même structure, même gestion des erreurs, même façon de tester. Une
bibliothèque par rôle : migrer la seconde vers la première, dans un commit à part (QUA-18). Une
convention qui change se change partout, ou se note avec ce qui reste à migrer (`FABRICATION.md`
en mode recap).
**Piège** — Recopier une mauvaise pratique par souci de cohérence : si le code voisin avale ses
erreurs ou met une clé en dur, la cohérence ne justifie rien. On corrige, et on le dit.
**Notions** — Conventions, DRY, Dette technique
