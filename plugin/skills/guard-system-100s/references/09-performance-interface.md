# 09 · Performance, montée en charge, fluidité de l'interface (PERF)

Une interface « bien huilée », c'est quatre sensations : ce qu'on cherche **apparaît vite** (LCP),
chaque geste **répond tout de suite** (INP), **rien ne saute** pendant le chargement (CLS), et
**rien ne saccade** quand on fait défiler ou qu'une animation joue. La règle d'or : **mesurer
d'abord**, sur un téléphone moyen, puis corriger le plus gros problème, et pas l'inverse. Côté
serveur, la plupart des lenteurs viennent d'un appel en série, d'une requête sans index ou d'une
région mal choisie, pas d'un manque de machines : la montée en charge est `échelle`.
L'accessibilité fait partie de la qualité d'une interface, pas d'une option.

---

### PERF-01 · On mesure avant d'optimiser, sur mobile et avec des données réelles
`important` · `web`

**Pourquoi** — Optimiser à l'aveugle, c'est passer une journée sur ce qui ne compte pas. Les Core
Web Vitals sont les trois mesures de Google pour l'expérience d'une page : **LCP** (Largest
Contentful Paint, le temps d'affichage du plus gros élément visible), **INP** (Interaction to Next
Paint, le délai entre un clic ou une frappe et l'affichage qui suit), **CLS** (Cumulative Layout
Shift, la somme des sauts de mise en page inattendus). Seuils « bons », mesurés sur 75 % des
visites : LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 (« mauvais » au-delà de 4 s, 500 ms et 0,25).
**Vérifier** — Lighthouse (DevTools → Lighthouse, mode mobile) : mesure de laboratoire, avec ses
pistes. PageSpeed Insights (pagespeed.web.dev) : la même chose, plus les données réelles CrUX
(Chrome UX Report, 28 jours de visiteurs Chrome) quand le site a assez de trafic. DevTools →
Performance : LCP, CLS et INP en direct pendant qu'on utilise la page. Données réelles de ses
propres visiteurs : Vercel Speed Insights, Cloudflare Web Analytics, ou la bibliothèque
`web-vitals`.
**Corriger** — Mesurer, corriger le plus gros problème, mesurer à nouveau. Tester avec le
ralentissement CPU et réseau de DevTools ou sur un vrai téléphone d'entrée de gamme : un PC de
développeur ment.
```js
import { onLCP, onINP, onCLS } from 'web-vitals'
const envoyer = (m) => navigator.sendBeacon('/api/vitals',
  JSON.stringify({ nom: m.name, valeur: m.value, page: location.pathname }))
onLCP(envoyer); onINP(envoyer); onCLS(envoyer)
```
**Piège** — Viser 100/100 sur Lighthouse. C'est une mesure de laboratoire sur une seule visite ; ce
qui compte, ce sont les visiteurs réels, et les pages qu'ils visitent vraiment.
**Notions** — Core Web Vitals, LCP, INP, CLS

---

### PERF-02 · Les images sont légères, au bon format et à la bonne taille
`important` · `web` · `auto`

**Pourquoi** — Les images sont souvent le plus gros poids d'une page. Une photo de 4 Mo sortie de
l'appareil, affichée sur 400 px de large, fait télécharger bien plus que nécessaire, surtout en 4G.
Une image sans dimensions fait sauter la page quand elle arrive (CLS).
**Vérifier** — `node audit.mjs` (images de plus de 500 Ko dans les dossiers servis : `public/`,
`static/`, `assets/`, `dist/`). DevTools → Network → filtre Img, trier par taille. Lighthouse :
« Properly size images », « Serve images in next-gen formats ». Balises `<img>` sans `width` ni
`height`.
**Corriger** —
- Photos en **AVIF** ou **WebP** ; logos et icônes en SVG ; GIF animé remplacé par une vidéo
  MP4/WebM, bien plus légère.
- Redimensionner à la taille d'affichage maximale (le double pour les écrans haute densité) et
  proposer plusieurs tailles avec `srcset` et `sizes`.
- Dimensions explicites (`width` et `height`, ou `aspect-ratio` en CSS) : le navigateur réserve la
  place.
- `loading="lazy"` sur les images sous la ligne de flottaison (lazy loading : charger seulement
  quand l'image approche de l'écran), **jamais** sur l'image principale (PERF-03).
```html
<picture>
  <source srcset="/img/atelier.avif" type="image/avif">
  <img src="/img/atelier.webp" width="1600" height="900" alt="L'atelier vu de l'entrée"
       loading="lazy" decoding="async">
</picture>
```
Next.js : `next/image` convertit, redimensionne et charge en différé tout seul. Vite : convertir au
build (`vite-imagetools`, `sharp`) ; pour quelques fichiers, Squoosh. Cloudflare : Images ou les
transformations d'images.
**Piège** — Compter sur `next/image` pour une source de 8 Mo dans `public/` : le premier visiteur
attend la conversion, et chaque transformation est comptée par la plateforme. Une image posée en
`background-image` CSS échappe en plus à toutes ces optimisations.
**Notions** — Lazy loading, CLS, LCP

---

### PERF-03 · L'élément principal s'affiche vite, et rien ne bouge pendant le chargement
`important` · `web`

**Pourquoi** — Le LCP, c'est le moment où l'utilisateur voit enfin ce qu'il est venu voir (photo
d'accroche, grand titre). Le CLS, c'est le bouton qui descend au moment où on clique dessus. Causes
fréquentes : image principale en `lazy` ou insérée par JavaScript, page rendue seulement côté
navigateur (écran blanc jusqu'au JS), bandeau ou intégration (vidéo, carte, publicité) sans place
réservée, police qui change la taille du texte en arrivant.
**Vérifier** — Lighthouse indique l'élément LCP (« Largest Contentful Paint element ») et les
éléments qui bougent (« Avoid large layout shifts »). DevTools → Performance → piste « Layout
shifts ». Chercher `loading="lazy"` sur la première image, les images d'accroche en CSS, les
contenus insérés en haut de page après le chargement.
**Corriger** —
```html
<!-- ni lazy, ni insérée par JS, prioritaire -->
<img src="/hero.avif" width="1600" height="900" alt="…" fetchpriority="high">
```
Next.js 16 : `<Image … preload />`, ou `loading="eager"` / `fetchPriority="high"` (la propriété
`priority` est dépréciée depuis la version 16, elle reste valable avant). Image d'accroche en CSS :
`<link rel="preload" as="image" href="/hero.avif" fetchpriority="high">`. Le haut de page est
rendu côté serveur ou statique (PERF-17). Réserver la place de ce qui arrive plus tard
(`aspect-ratio`, `min-height`), squelettes de la taille finale (PERF-04), bannière de cookies en
surimpression (`position: fixed`) plutôt qu'en haut du flux, polices sans saut (PERF-12).
**Notions** — LCP, CLS, Core Web Vitals

---

### PERF-04 · Chaque écran a ses états de chargement, d'erreur et de vide, et chaque clic répond tout de suite
`important` · `web`

**Pourquoi** — La performance perçue (ce que l'utilisateur ressent) compte plus que les
millisecondes. Un clic sans réaction pendant 800 ms paraît cassé : l'utilisateur reclique et la
commande part deux fois. Un écran blanc pendant le chargement, une liste vide sans explication, une
erreur muette : c'est ce qui donne l'impression d'une application pas finie.
**Vérifier** — Pour chaque écran qui charge des données : que voit-on pendant le chargement
(DevTools → Network → « Slow 4G ») ? Quand l'API échoue (DevTools → Network → clic droit sur la
requête → « Block request URL ») ? Quand la liste est vide ? Les boutons d'envoi passent-ils en
état « en cours », désactivés ?
**Corriger** —
- Un retour visuel immédiat au clic (en moins de 100 ms) : état pressé, bouton désactivé et
  indicateur.
- Des squelettes (skeletons : formes grises à la place du contenu, à sa taille finale) plutôt
  qu'un indicateur de chargement plein écran.
- Une erreur compréhensible avec un bouton « Réessayer », jamais un écran blanc.
- Un état vide qui explique et propose l'action (« Aucune facture. Créer la première »).

Next.js : `loading.tsx` et `error.tsx` par segment, `<Suspense>` pour afficher le reste pendant
qu'une partie charge. React :
```tsx
function BoutonEnvoyer() {
  const { pending } = useFormStatus()
  return <button disabled={pending}>{pending ? 'Envoi…' : 'Envoyer'}</button>
}
```
Pour éviter un clignotement, n'afficher l'indicateur qu'au-delà d'un court délai (de l'ordre de
200 à 300 ms).
**Piège** — Désactiver le bouton n'empêche pas les doublons côté serveur (réseau qui rejoue, deux
onglets) : l'idempotence reste nécessaire (API).
**Notions** — Performance perçue

---

### PERF-05 · Les animations tournent à 60 images par seconde et respectent `prefers-reduced-motion`
`important` · `web`

**Pourquoi** — À 60 images par seconde, chaque image dispose d'environ 16 ms. Animer `width`,
`height`, `top`, `left` ou `margin` oblige le navigateur à recalculer la mise en page et à
repeindre à chaque image : saccades, surtout sur mobile. `transform` et `opacity` sont traités par
le compositeur (la partie qui assemble les calques, souvent sur la carte graphique), sans
recalcul. Et certaines personnes ont des nausées avec les mouvements à l'écran : elles l'ont réglé
dans leur système.
**Vérifier** — `transition` et `@keyframes` (ou animations Motion / Framer Motion) sur `width`,
`height`, `top`, `left`, `right`, `bottom`, `margin`, `padding` ; `transition: all`. DevTools →
Rendering → « Paint flashing » et « Frame Rendering Stats » ; Performance → images manquées. Le CSS
contient-il `prefers-reduced-motion` ?
**Corriger** —
```css
/* MAUVAIS */ .tiroir { left: -300px; transition: left .3s }
/* BON */     .tiroir { transform: translateX(-100%); transition: transform .3s ease-out }
              .tiroir.ouvert { transform: none }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important;
    transition-duration: .01ms !important; scroll-behavior: auto !important }
}
```
Avec Motion : `useReducedMotion()`. `will-change: transform` seulement sur l'élément qui va
s'animer (chaque élément promu consomme de la mémoire graphique). Durées courtes pour l'interface
(autour de 150 à 300 ms). Ne pas lire la mise en page (`offsetHeight`, `getBoundingClientRect()`)
entre deux écritures de style dans une boucle : chaque lecture force un recalcul complet.
**Piège** — `transition: all` anime aussi des propriétés coûteuses qu'on ne pensait pas animer.
**Notions** — Performance perçue, Accessibilité

---

### PERF-06 · L'interface s'utilise au clavier et se comprend avec un lecteur d'écran (WCAG 2.2 AA)
`important` · `web`

**Pourquoi** — L'accessibilité, c'est permettre à tout le monde d'utiliser l'interface : personnes
malvoyantes, à mobilité réduite, avec des troubles cognitifs, mais aussi en plein soleil ou d'une
seule main. Un lecteur d'écran lit la structure de la page : un `<div onClick>` n'est ni annoncé ni
atteignable au clavier. La référence est le WCAG 2.2, niveau AA. Pour l'obligation légale
(European Accessibility Act, RGAA) : voir LEG.
**Vérifier** —
- Au clavier seul : Tab parcourt tout dans un ordre logique, le focus se voit, Entrée et Espace
  activent, Échap ferme les fenêtres, on ne reste jamais coincé.
- Lighthouse → Accessibilité, extension axe DevTools, `eslint-plugin-jsx-a11y` : ils trouvent une
  partie des problèmes seulement.
- Chercher `outline: none` ou `outline: 0` sans `:focus-visible` de remplacement, `<img>` sans
  `alt`, `<input>` sans `<label>`, `<div onClick` et `<span onClick`, `<html>` sans `lang`.
- Le parcours principal avec un lecteur d'écran : NVDA (gratuit, Windows), VoiceOver (Mac, iPhone).
**Corriger** —
| Règle | Concrètement, au niveau AA |
|---|---|
| Contraste | 4,5:1 pour le texte, 3:1 pour le grand texte et les composants (bordures de champs, icônes utiles) ; l'inspecteur de DevTools affiche le ratio |
| Focus | visible (`:focus-visible { outline: 2px solid; outline-offset: 2px }`), jamais caché par un en-tête collant |
| Clavier | ce qui se clique est un `<button>` ou un `<a href>` natif |
| Images | `alt` qui dit l'information ; `alt=""` pour une image décorative |
| Formulaires | un `<label>` par champ (le `placeholder` n'en est pas un), erreurs en texte reliées au champ (`aria-describedby`) |
| Langue | `<html lang="fr">` |
| Cibles | au moins 24 × 24 px |
| Mouvement | PERF-05 ; rien ne défile ou ne clignote seul sans bouton pause |

Pour les composants complexes (menus, fenêtres modales, onglets) : des primitives accessibles
(`<dialog>` natif, Radix UI, React Aria) plutôt qu'une réécriture.
**Piège** — Ajouter des `aria-*` partout. Un ARIA faux est pire qu'aucun ARIA : le HTML natif
d'abord.
**Notions** — Accessibilité

---

### PERF-07 · Le fil principal reste libre : aucune tâche de plus de 50 ms pendant les interactions
`important` · `web`

**Pourquoi** — Le navigateur n'a qu'un fil principal (main thread) pour le JavaScript, la mise en
page et l'affichage. Une tâche longue (long task : plus de 50 ms d'affilée) le bloque : le clic
attend, la saisie rame, l'INP se dégrade. Causes fréquentes : filtrer 20 000 lignes à chaque
frappe, analyser un gros JSON, scripts tiers (chat, statistiques, publicité), hydratation d'une
grosse page.
**Vérifier** — DevTools → Performance → enregistrer une interaction : les tâches longues portent un
coin rouge. Lighthouse : « Total Blocking Time » et « Avoid long main-thread tasks ». DevTools →
Network → filtre JS : quels scripts viennent d'autres domaines ?
**Corriger** — Découper le travail et rendre la main au navigateur entre deux morceaux :
```js
const cede = () => globalThis.scheduler?.yield?.() ?? new Promise(r => setTimeout(r, 0))
for (let i = 0; i < lignes.length; i++) {
  traiter(lignes[i])
  if (i % 500 === 0) await cede()      // un clic peut passer entre deux paquets
}
```
`scheduler.yield()` existe dans Chrome et Edge (129 et plus) et Firefox (142 et plus), d'où la
solution de repli. Un calcul lourd part dans un Web Worker (un fil séparé qui ne bloque pas
l'interface ; Comlink simplifie les échanges) :
`new Worker(new URL('./calcul.worker.js', import.meta.url), { type: 'module' })`. En React,
`useTransition` et `useDeferredValue` marquent une mise à jour comme non urgente. Les scripts
tiers se chargent après l'interaction (`next/script` avec `strategy="lazyOnload"`), ou
disparaissent s'ils ne servent pas.
**Notions** — INP, Long Tasks, Web Workers

---

### PERF-08 · Le JavaScript envoyé au navigateur est découpé et surveillé
`important` · `web`

**Pourquoi** — Chaque kilo-octet de JS est téléchargé, analysé puis exécuté, bien plus lentement
sur un téléphone moyen que sur un PC. Une bibliothèque de graphiques importée par la page d'accueil
pour un graphique de l'administration ralentit tous les visiteurs.
**Vérifier** — Next.js 16.1 et plus : `npx next analyze` ; avant, ou avec webpack :
`@next/bundle-analyzer`. Vite : `npx vite-bundle-visualizer`. Lighthouse : « Reduce unused
JavaScript ». Avant d'installer un paquet : son poids sur bundlephobia.com ou pkg-size.dev.
Suspects habituels : `moment`, `lodash` importé en entier, une bibliothèque d'icônes entière, un
éditeur riche, des graphiques, `three`, chargés sur des pages qui n'en ont pas besoin.
**Corriger** — Le code splitting (découper le JS en morceaux chargés à la demande) est déjà fait
par route dans Next.js et Vite ; découper en plus ce qui est lourd et pas visible tout de suite :
```tsx
import dynamic from 'next/dynamic'
const Editeur = dynamic(() => import('./Editeur'), { loading: () => <p>Chargement…</p> })
// Vite / React : const Graphique = lazy(() => import('./Graphique')), dans un <Suspense>
```
Next.js App Router : Server Components par défaut, `'use client'` seulement sur les composants
interactifs ; le code d'un Server Component n'est jamais envoyé au navigateur.
`experimental.optimizePackageImports` pour les bibliothèques à très nombreux exports. Remplacer
`moment` par `Intl` ou `date-fns`, `lodash` par les fonctions natives ou des imports ciblés.
**Piège** — « Le tree-shaking s'en occupe. » Seulement si la bibliothèque est en modules ES et qu'on
importe ce qu'il faut : `import { debounce } from 'lodash-es'`, pas `import _ from 'lodash'`.
**Notions** — Code splitting, Lazy loading

---

### PERF-09 · Aucune fuite de mémoire : chaque écouteur, intervalle, abonnement et cache a une fin
`important` · `tout` · `auto`

**Pourquoi** — Le ramasse-miettes (garbage collector) libère automatiquement ce que plus rien ne
référence. Tant qu'un écouteur, un intervalle ou une `Map` garde une référence, rien n'est libéré :
c'est une fuite de mémoire (memory leak). Côté navigateur, une application ouverte toute la
journée ralentit puis plante. Côté serveur, l'instance grossit jusqu'à être tuée (128 Mo par
isolate sur Cloudflare Workers), et les pauses du ramasse-miettes allongent les temps de réponse
(PERF-19).
**Vérifier** — `node audit.mjs` (`setInterval` et `addEventListener` sans nettoyage dans un
composant, heuristique). À la main : `useEffect` sans fonction de nettoyage ; abonnements
(Supabase Realtime, WebSocket, `onSnapshot` de Firebase) jamais fermés ; `Map` ou objets globaux
côté serveur qui ne font que grossir ; `functools.lru_cache(maxsize=None)` en Python. DevTools →
Memory : deux instantanés du tas (heap snapshots), avant et après avoir ouvert et fermé l'écran dix
fois. Node : `process.memoryUsage().heapUsed` qui monte sans jamais redescendre.
**Corriger** —
```tsx
useEffect(() => {
  const id = setInterval(rafraichir, 30_000)
  const ctrl = new AbortController()
  window.addEventListener('resize', ajuster, { signal: ctrl.signal })
  const canal = supabase.channel('commandes').subscribe()
  return () => { clearInterval(id); ctrl.abort(); supabase.removeChannel(canal) }   // au démontage
}, [])
```
Côté serveur, un cache a toujours une borne : `new LRUCache({ max: 500 })` (paquet `lru-cache`) ou
une durée de vie ; en Python, `lru_cache(maxsize=256)`.
**Notions** — Memory Leaks, Garbage Collection

---

### PERF-10 · Les réponses ont des en-têtes de cache adaptés, et le texte est compressé
`important` · `web`

**Pourquoi** — Le cache (caching), c'est garder une copie pour ne pas refaire le travail. Sans
en-têtes clairs, le navigateur retélécharge tout à chaque visite, ou garde une vieille version
après un déploiement. La compression (Brotli ou gzip) réduit fortement le poids du HTML, du CSS, du
JS et du JSON.
**Vérifier** —
```bash
curl -sI -H "Accept-Encoding: br, gzip" https://monsite.fr/assets/index-3f9a.js \
  | grep -iE "cache-control|content-encoding|etag|age"
```
DevTools → Network, à la deuxième visite : colonne Size à « (disk cache) » ou « (memory cache) ».
En-têtes `x-vercel-cache` ou `cf-cache-status` : `HIT` ou `MISS`.
**Corriger** —
| Ressource | `Cache-Control` |
|---|---|
| Fichiers versionnés (empreinte dans le nom : `index-3f9a.js`, `/_next/static/`) | `public, max-age=31536000, immutable` : un an, jamais revalidé, le nom change à chaque version |
| HTML | `no-cache` (revalidé à chaque visite grâce à l'`ETag` : réponse `304` sans contenu si rien n'a changé), ou un cache CDN court |
| API publique qui change peu | `public, s-maxage=60, stale-while-revalidate=300` (le CDN sert l'ancienne copie pendant qu'il rafraîchit) |
| Tout ce qui dépend de l'utilisateur | `private, no-store` |

Next.js et Vite versionnent déjà leurs fichiers, et Next.js pose seul les en-têtes de
`/_next/static`. Cloudflare Pages et Netlify : un fichier `_headers` ; Vercel : `headers` dans
`vercel.json`.
```
# public/_headers
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```
Vercel, Cloudflare et Netlify compressent automatiquement. Serveur à soi : le reverse proxy
(PERF-20) ou le middleware `compression` (Express), `GZipMiddleware` (FastAPI). Inutile de
recompresser images et vidéos.
**Piège** — `public, s-maxage` sur une réponse personnalisée (tableau de bord, panier) : le CDN
sert la page de Paul à Marie. Ce qui dépend des cookies ou de l'utilisateur est `private` (WEB).
**Notions** — Caching, Compression, CDN

---

### PERF-11 · Les limites serverless et les démarrages à froid sont connus et respectés
`important` · `api`

**Pourquoi** — Une fonction serverless a une durée maximale, une mémoire maximale et une taille de
requête maximale (serverless limits). Les dépasser donne une erreur `504` ou `413`, souvent
seulement en production, sur un gros fichier ou une longue génération d'IA. Le démarrage à froid
(cold start) : la première requête sur une nouvelle instance attend le chargement du code ; plus
le paquet est lourd, plus l'attente est longue.
**Vérifier** — Durées dans les journaux ; erreurs `FUNCTION_INVOCATION_TIMEOUT`, `413`, dépassement
de temps CPU ou de mémoire ; envois de fichiers qui traversent la fonction ; imports lourds au
niveau du module (SDK complets, `sharp`, `puppeteer`, générateurs de PDF).
**Corriger** — Ordres de grandeur relevés en octobre 2026, à revérifier sur la page « limits » du
fournisseur :
| Plateforme | Durée | Mémoire | Corps de requête |
|---|---|---|---|
| Vercel Functions (Fluid compute) | 300 s par défaut ; maximum 300 s (Hobby), 800 s (Pro) | 2 Go (Hobby), jusqu'à 4 Go (Pro) | 4,5 Mo, requête comme réponse |
| Cloudflare Workers | temps CPU : 10 ms (gratuit), 30 s par défaut et jusqu'à 5 min (payant) ; l'attente réseau ne compte pas | 128 Mo par isolate | 100 Mo (Free, Pro) |
| Supabase Edge Functions | 150 s (gratuit), 400 s (payant) ; 2 s de CPU par requête | 256 Mo | — |

Gros fichiers : envoi direct du navigateur vers le stockage par URL signée
(`createSignedUploadUrl` de Supabase Storage, URL présignée R2 ou S3), sans passer par la fonction.
Travaux longs : une file (ASY-01), et la réponse d'une IA envoyée en flux (IA). Démarrage à froid :
paquet plus léger, imports lourds seulement là où ils servent
(`const { default: sharp } = await import('sharp')`), clients (base, SDK) créés une fois au niveau
du module et réutilisés, sans état propre à un utilisateur (ASY-05). Les Workers, qui reposent sur
des isolats légers plutôt que sur des conteneurs, démarrent en général très vite.
**Notions** — Serverless Limits, Cold Starts

---

### PERF-12 · Les polices s'affichent sans bloquer ni faire sauter le texte
`conseillé` · `web`

**Pourquoi** — Tant qu'une police web n'est pas chargée, le navigateur cache le texte ou affiche
une police de repli, puis la remplace : le texte change de taille et la page saute (CLS). Chaque
graisse est un fichier de plus. Google Fonts servi depuis les serveurs de Google ajoute une
connexion tierce et une question de RGPD (transfert de l'adresse IP : LEG).
**Vérifier** — DevTools → Network → filtre Font : nombre de fichiers, poids, domaine
(`fonts.gstatic.com`). `@font-face` sans `font-display`, formats autres que `woff2`.
**Corriger** — Next.js : `next/font` héberge la police avec le site au moment du build (aucune
requête vers Google) et ajuste la police de repli pour limiter le saut :
```ts
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'], display: 'swap' })
```
Vite et autres : Fontsource (`@fontsource-variable/inter`) ou des fichiers `woff2` dans
`public/fonts`, avec `font-display: swap`, et la police principale préchargée :
`<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>` (le
`crossorigin` est obligatoire, même sur son propre domaine). Un sous-ensemble (subset) suffit :
`latin` couvre le français. Deux ou trois graisses au plus, ou une police variable (un seul fichier
pour toutes les graisses). Ou la police du système (`font-family: system-ui, sans-serif`) : rien à
télécharger.
**Notions** — CLS, Performance perçue

---

### PERF-13 · Les actions fréquentes s'affichent tout de suite (Optimistic UI), avec retour arrière en cas d'échec
`conseillé` · `web`

**Pourquoi** — L'optimistic UI (interface optimiste) affiche le résultat avant la confirmation du
serveur, parce que l'action réussit presque toujours. Cocher une tâche, aimer un message, renommer
un dossier deviennent instantanés au lieu de 300 ms d'attente. C'est ce qui donne la sensation
d'une application « bien huilée ».
**Vérifier** — Les actions simples et fréquentes attendent-elles la réponse avant de changer
l'écran ? En cas d'échec, l'interface revient-elle à l'état d'avant, avec un message ?
**Corriger** — React 19 :
```tsx
const [taches, ajouterOptimiste] = useOptimistic(tachesServeur,
  (etat, nouvelle) => [...etat, { ...nouvelle, enCours: true }])
async function ajouter(formData: FormData) {          // <form action={ajouter}>
  ajouterOptimiste({ id: crypto.randomUUID(), titre: formData.get('titre') })
  await creerTache(formData)   // à la fin de l'action, React repart de tachesServeur
}
```
Avec TanStack Query : `onMutate` (mettre à jour le cache), `onError` (restaurer et prévenir),
`onSettled` (resynchroniser).
**Piège** — Être optimiste sur ce qui est irréversible ou souvent refusé : paiement, réservation
d'un stock rare, suppression définitive. Là, un état « en cours » clair (PERF-04).
**Notions** — Optimistic UI, Performance perçue

---

### PERF-14 · La saisie et le défilement ne déclenchent pas un travail à chaque événement
`conseillé` · `web`

**Pourquoi** — Un champ de recherche qui appelle l'API à chaque lettre envoie huit requêtes pour
« facturer », dont les réponses arrivent dans le désordre : l'ancienne écrase la bonne. Un écouteur
`scroll` ou `resize` se déclenche des dizaines de fois par seconde.
**Vérifier** — `onChange` ou `oninput` qui appellent `fetch` ; `addEventListener('scroll'`,
`'resize'` ou `'mousemove'` avec un travail lourd ; recherches sans annulation de la requête
précédente.
**Corriger** — Le debounce (attendre que la saisie s'arrête, environ 250 à 300 ms, avant d'agir)
pour la recherche, avec annulation de la requête précédente :
```ts
let minuteur: ReturnType<typeof setTimeout>, ctrl: AbortController | undefined
function rechercher(q: string) {
  clearTimeout(minuteur)
  minuteur = setTimeout(async () => {
    ctrl?.abort(); ctrl = new AbortController()      // l'ancienne réponse ne peut plus écraser la nouvelle
    const res = await fetch(`/api/recherche?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }).catch(() => null)
    if (res) afficher(await res.json())
  }, 300)
}
```
Le throttle (au plus une exécution toutes les X ms) pour `scroll`, `resize` et `mousemove`, ou
mieux, les API prévues pour : `IntersectionObserver` (élément visible, chargement au défilement),
`ResizeObserver`, `requestAnimationFrame`, écouteurs `{ passive: true }`. Pour filtrer une liste
déjà chargée, `useDeferredValue` de React. Fonctions prêtes à l'emploi : `debounce` et `throttle`
de `es-toolkit` ou `lodash-es`.
**Notions** — Debounce, Throttle

---

### PERF-15 · Les longues listes sont paginées ou virtualisées
`conseillé` · `web`

**Pourquoi** — Afficher 5 000 lignes crée 5 000 éléments dans la page : affichage lent, défilement
saccadé, mémoire gaspillée. La virtualisation de liste ne crée que les lignes visibles (plus une
marge) et les recycle pendant le défilement.
**Vérifier** — `.map(` sur des tableaux qui peuvent dépasser quelques centaines d'éléments, sans
pagination. Lighthouse : « Avoid an excessive DOM size ».
**Corriger** — D'abord se demander si l'utilisateur a besoin de tout : pagination, ou chargement
par paquets (et côté base aussi : BDD). Sinon, `@tanstack/react-virtual` ou `react-window`. Pour
une longue page de contenu, `content-visibility` laisse le navigateur sauter le rendu des sections
hors écran :
```css
.section { content-visibility: auto; contain-intrinsic-size: auto 600px }
```
Une liste de 50 éléments n'a pas besoin d'être virtualisée.
**Piège** — Une liste virtualisée casse la recherche du navigateur (Ctrl+F) et peut gêner les
lecteurs d'écran : prévoir un filtre ou une recherche dans la page.
**Notions** — Virtualisation de liste

---

### PERF-16 · React ne refait pas le rendu de tout l'écran à chaque frappe, sans `useMemo` partout
`conseillé` · `web`

**Pourquoi** — Un re-rendu, c'est React qui recalcule un composant. Un état placé trop haut (dans le
layout) ou un contexte qui change à chaque frappe refait le rendu de toute la page, et la saisie
rame. À l'inverse, entourer chaque valeur de `useMemo` et `useCallback` rend le code illisible pour
un gain souvent nul.
**Vérifier** — React DevTools → Profiler : enregistrer une interaction, voir quels composants se
rendent et combien de temps ; option « Highlight updates when components render ». Chercher l'état
d'un formulaire stocké dans un parent de toute la page, un `value={{ … }}` de contexte recréé à
chaque rendu, `key={index}` sur des listes qui se réordonnent.
**Corriger** — Descendre l'état au plus près de là où il sert ; passer les parties lourdes en
`children` (elles ne se re-rendent pas avec le parent) ; découper les contextes, ou un état partagé
à sélecteurs (Zustand) ; des clés stables (`key={tache.id}`). Le React Compiler (stable depuis
octobre 2025) mémoïse automatiquement : `reactCompiler: true` dans `next.config` (Next.js 16) avec
`babel-plugin-react-compiler`, ou le plugin Babel avec Vite. Avec lui, les `useMemo` manuels
deviennent rarement utiles ; sans lui, seulement autour d'un calcul mesuré comme coûteux.
**Notions** — INP, Performance perçue

---

### PERF-17 · Chaque page a le bon mode de rendu : statique quand c'est possible
`conseillé` · `web`

**Pourquoi** — Il y a quatre façons de produire le HTML d'une page. **SSG** (Static Site
Generation) : au moment du build, servie telle quelle par le CDN, la plus rapide. **ISR**
(Incremental Static Regeneration) : statique, mais régénérée à intervalle ou à la demande. **SSR**
(Server-Side Rendering) : à chaque requête sur le serveur, fraîche et personnalisée, plus lente et
plus chère. **CSR** (Client-Side Rendering) : la page arrive vide et se remplit après le JavaScript.
Une page vitrine en CSR affiche un écran blanc jusqu'au JS (mauvais LCP, référencement fragile).
**Vérifier** — Next.js : la sortie de `next build` marque chaque route statique (○) ou dynamique
(ƒ). Une page marketing dynamique cache souvent un `cookies()`, `headers()` ou `searchParams` utilisé
sans nécessité. Vite/React : tout est en CSR ; les pages publiques (accueil, tarifs, blog) en
souffrent-elles ?
**Corriger** —
| Page | Mode |
|---|---|
| Accueil, tarifs, mentions légales, articles | SSG |
| Catalogue, fiches produits, page publique qui change parfois | ISR, régénérée après une modification (`revalidatePath` ou `revalidateTag` dans Next.js) |
| Contenu personnalisé ou toujours frais, visible des moteurs | SSR, en flux (`<Suspense>`) pour envoyer le haut de page tout de suite |
| Application derrière une connexion | CSR acceptable (SPA Vite), ou SSR |

Dans une application Vite, les pages publiques importantes peuvent être pré-rendues, ou faites à
part (Astro), l'application restant en CSR.
**Notions** — Rendu (SSR, SSG, ISR, CSR), LCP

---

### PERF-18 · Le cache partagé (CDN, edge) a une stratégie d'invalidation et résiste à l'avalanche
`conseillé` · `prod`

**Pourquoi** — Un CDN (Content Delivery Network) est un réseau de serveurs proches des visiteurs
qui gardent une copie des fichiers ; l'edge caching fait la même chose pour des réponses
dynamiques (API, HTML). Toute la difficulté est l'invalidation du cache (cache invalidation) :
savoir quand jeter la copie. Trop longue, les prix affichés sont périmés ; trop courte, le cache ne
sert à rien. Et l'avalanche (cache stampede) : quand une entrée très demandée expire, des centaines
de requêtes la recalculent en même temps et écroulent la base.
**Vérifier** — Pour chaque cache (CDN, `'use cache'` ou `unstable_cache` dans Next.js, KV, Redis,
`Map` en mémoire) : durée de vie (TTL), qui l'invalide après une modification, que se passe-t-il
quand une clé populaire expire ? Taux de `HIT` dans le tableau de bord du CDN.
**Corriger** — Trois façons d'invalider, de la plus simple à la plus fine :
- une durée de vie courte avec `stale-while-revalidate` : l'ancienne copie est servie pendant le
  recalcul, sans attente ni avalanche ;
- des clés versionnées (empreinte dans le nom de fichier, préfixe `v3:produit:42`) : changer de
  version invalide tout sans purge ;
- une purge explicite après écriture : `revalidateTag('produits')` dans Next.js, purge par URL ou
  par étiquette via l'API Cloudflare.

Contre l'avalanche, un seul recalcul par clé à la fois (single-flight), plus des durées légèrement
aléatoires pour que tout n'expire pas en même temps :
```ts
const enCours = new Map<string, Promise<unknown>>()
function uneSeuleFois<T>(cle: string, charger: () => Promise<T>): Promise<T> {
  if (!enCours.has(cle)) enCours.set(cle, charger().finally(() => enCours.delete(cle)))
  return enCours.get(cle) as Promise<T>
}
```
Ce mécanisme vaut par instance ; avec plusieurs serveurs, `stale-while-revalidate` côté CDN ou un
verrou court (ASY-18).
**Piège** — Ajouter Redis « pour la performance » avant d'avoir mesuré : un index en base (BDD)
règle souvent le problème, sans rien à invalider.
**Notions** — Caching, CDN, Edge Caching, Cache Invalidation, Cache stampede

---

### PERF-19 · On suit la latence au 95e et au 99e percentile, pas la moyenne
`conseillé` · `api`

**Pourquoi** — La latence (latency) est le temps de réponse d'une requête ; le débit (throughput),
le nombre de requêtes traitées par seconde. La moyenne ment : 99 requêtes à 50 ms et une à 5 s
donnent une moyenne d'environ 100 ms, alors qu'un utilisateur sur cent attend 5 s. Le **P99**
(P99 latency) est la durée sous laquelle passent 99 % des requêtes ; la **latence de queue** (tail
latency) désigne ces requêtes les plus lentes. Elle s'additionne : une page qui fait 20 appels,
chacun lent une fois sur cent, est lente pour environ 18 % des visites (1 − 0,99²⁰).
**Vérifier** — Le tableau de bord de la plateforme ou l'outil d'observabilité donne-t-il des
percentiles (OBS) ? Test de charge sur une préversion, jamais sur le service d'un tiers :
`npx autocannon -c 50 -d 20 https://preview.monsite.fr/api/produits` (affiche les percentiles), ou
k6. Chercher les `await` indépendants enchaînés, et une fonction éloignée de sa base.
**Corriger** —
- Paralléliser ce qui est indépendant :
  `const [profil, commandes] = await Promise.all([lireProfil(id), lireCommandes(id)])`.
- Rapprocher le calcul des données : les fonctions Vercel tournent par défaut à Washington
  (`iad1`) ; avec une base Supabase à Paris ou Francfort, chaque requête traverse l'Atlantique.
  Choisir la région (`"regions": ["cdg1"]` dans `vercel.json`, ou Settings → Functions). Sur
  Cloudflare Workers, le Smart Placement (`placement = { mode = "smart" }` dans `wrangler.toml`)
  rapproche le Worker de son backend.
- Un délai d'attente sur chaque appel sortant (API) : une dépendance lente ne doit pas tirer toute
  la queue.
- Les causes habituelles de la queue : démarrages à froid (PERF-11), pauses du ramasse-miettes
  (PERF-09), requêtes sans index (BDD), service tiers lent.
**Notions** — Latency, Throughput, P99 Latency, Tail Latency

---

### PERF-20 · Monter en charge : d'abord une machine plus grosse, ensuite plusieurs
`conseillé` · `échelle`

**Pourquoi** — Le scaling vertical (vertical scaling : une machine plus puissante) est un réglage,
sans changer le code. Le scaling horizontal (horizontal scaling : plusieurs machines) exige une
application sans état (pas de session en mémoire, pas de fichier sur le disque local, pas de cron
interne : ASY-05, ASY-08) et un répartiteur de charge (load balancing : distribuer les requêtes
entre les machines). Sur Vercel, Cloudflare Workers ou Supabase Edge Functions, le scaling
horizontal et l'autoscaling (ajout et retrait automatiques d'instances selon la charge) sont déjà
assurés par la plateforme : c'est le plus souvent la base qui sature la première.
**Vérifier** — Qu'est-ce qui sature vraiment : CPU, mémoire, connexions à la base, temps de réponse
qui grimpe avec la charge ? Les optimisations simples sont-elles faites : cache (PERF-10, PERF-18),
index et requêtes N+1 (BDD), file pour le travail lent (ASY-01) ?
**Corriger** —
1. Mesurer et optimiser d'abord.
2. Vertical : une instance de calcul plus grande (Supabase : taille de calcul supérieure ; VPS plus
   puissant). Vertical d'abord, c'est plus simple.
3. Horizontal quand une machine raisonnable ne suffit plus, ou qu'il faut survivre à la perte d'une
   machine (REP-16) : application sans état, plusieurs instances derrière un répartiteur, pool de
   connexions et répliques en lecture (BDD).
4. Un reverse proxy (Caddy, Nginx, Traefik, ou Cloudflare devant le serveur) : un serveur placé
   devant l'application qui gère le HTTPS, compresse, met en cache et répartit. Utile dès qu'on
   héberge soi-même un serveur Node ou Python, même unique.
**Piège** — Un autoscaling sans plafond : une attaque ou une boucle infinie devient une facture
(plafonds de dépense et limitation de débit : API).
**Notions** — Vertical Scaling, Horizontal Scaling, Load Balancing, Reverse proxies, Autoscaling, Throughput
