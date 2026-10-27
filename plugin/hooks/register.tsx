import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

import {
  chercherMotifs, chercherSecrets, estFichierSecrets, fuiteAdminSupabase, variablesPubliquesSecretes,
} from '../skills/guard-system-100s/regles.mjs'
import type { Audit, Garde, Tour } from '../types'

// Le garde permanent de guard-system-100s, dans chaque session :
// - des règles de sécurité, de propreté et de fluidité ajoutées au prompt système ;
// - à chaque écriture de fichier (Write, Edit, NotebookEdit) : refus si une clé part dans le code
//   ou dans le navigateur, et des alertes que Claude lit pour le code à risque ;
// - avant git commit et git push (Bash, PowerShell) : refus si un secret allait partir, par le
//   scanner (audit.mjs --staged / --push), le même code que le contrôle complet ;
// - avant de rendre la main, si du code a changé : une relance, une fois, pour prouver qu'il marche
//   (rien n'a tourné depuis) et le relire en architecte (un changement d'une certaine taille) ;
// - dans un projet en mode guard (`/guard-system-100s -activer`) : après chaque réponse qui a écrit du
//   code, le scanner repasse seul, note ce qui change dans le journal du projet, et un nouveau point
//   grave arrive dans la conversation ;
// - un bandeau au-dessus de la saisie : le dernier contrôle du projet et ce que le garde a vu.
// Si le garde lui-même échoue, l'action passe (avec un avertissement) : un bug du garde ne doit
// jamais empêcher de travailler.

const AUDIT = atom({ plugin: 'guard-system-100s', key: 'audit' } as const, null)
const GARDE = atom({ plugin: 'guard-system-100s', key: 'garde' } as const, { bloques: 0, alertes: 0, relectures: 0, dernier: null })
const TOUR_VIDE: Tour = { fichiers: [], lignes: 0, prouve: false }
const TOUR = atom({ plugin: 'guard-system-100s', key: 'tour' } as const, TOUR_VIDE)

const ORANGE = '#ff5f00'
const VERT = '#22c55e'
const JAUNE = '#eab308'
const ROUGE = '#ef4444'
const DOSSIER = '__guard-system-100s'
const DOC = /\.(md|mdx|txt|rst)$/i
// Ni documentation, ni brouillon du dossier temporaire, ni rapport : ce que la relecture ignore.
const HORS_CODE = /\/(?:AppData\/Local\/Temp|tmp)\/|\/__(?:guard|recap)-system-100s\//i
// Ce qui prouve que le code marche : build, types, tests, lint, le code lancé pour de vrai, ou une
// page ouverte dans un navigateur.
const VERIF = new RegExp([
  String.raw`\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|build|lint|typecheck|check)\b`,
  String.raw`(?:^|[\s;&|(])(?:npx\s+|bunx\s+)?(?:tsc|vitest|jest|playwright|eslint|biome|knip|pytest|mypy|pyright|ruff)\b`,
  String.raw`\b(?:cargo|go|dotnet|deno|mvn|gradle|flutter)\s+(?:test|build|check|vet|clippy|run)\b`,
  String.raw`\b(?:node|bun|tsx|python3?|py)\s+(?:--test\b|-m\s+(?:pytest|unittest)\b|\S+\.(?:[cm]?[jt]sx?|py)\b)`,
  String.raw`\bplugin\s+(?:test|validate)\b|\bcurl\b.*\b(?:localhost|127\.0\.0\.1)\b`,
].join('|'), 'i')
const NAVIGATEUR = /^mcp__(?:Claude_Browser|claude-in-chrome)__/
// À partir de ce nombre de lignes écrites dans le tour, la relecture d'architecte s'ajoute.
const GROS = 30

// Le suivi automatique du mode guard : du code écrit depuis le dernier contrôle, et où. Une variable
// du module suffit : après un rechargement, le prochain code écrit relance le suivi.
let aControler = false
let dernierFichier: string | null = null

const REGLES = `## guard-system-100s : le garde-fou du code (actif dans chaque session)

Écris comme un architecte qui a des décennies de métier : du code qui marche, optimal, cohérent et sûr, sans en faire trop (pas d'infrastructure ni d'abstraction avant d'en avoir besoin : YAGNI). Dans cet ordre :

1. Ça marche : c'est l'impératif. Rien n'est fini sans preuve. Après chaque changement, lance ce qui le prouve (build, types, tests, et le parcours réel : l'app ou le script lancé, la fonctionnalité essayée), et vérifie que ce qui marchait marche encore. Dis ce que tu as vérifié, et ce que tu n'as pas pu vérifier.
2. Optimal et cohérent : le code le plus court et le plus direct qui fait le travail. Réutilise ce qui existe (fonctions, composants, bibliothèques du projet) avant d'écrire du neuf, et suis les conventions du code autour (noms, structure, gestion des erreurs, style) : une seule façon de faire une chose dans un projet. Aucun déchet : ni code, import, paramètre, option, fichier ou dépendance qui ne sert pas, ni console.log de débogage, ni code commenté. Ce qu'un changement rend inutile part avec lui.
3. Relis après chaque création. Une fois que ça marche, relis le diff comme celui d'un autre : peut-on faire plus simple, plus court, autrement ? Quelque chose d'existant le fait-il déjà ? Reste-t-il du code mort, une duplication, une incohérence, un calcul ou une requête de trop ? Applique ce qui améliore vraiment, revérifie que tout marche, et dis en une ligne ce que la relecture a changé. Si tu l'oublies, le garde te le rappelle avant que tu rendes la main.

Et en écrivant ou en modifiant du code :

- Secrets : jamais de clé, jeton ou mot de passe dans le code, ni dans ce qui part au navigateur (VITE_, NEXT_PUBLIC_, REACT_APP_… sont publics). Variables d'environnement côté serveur, .env dans .gitignore, .env.example sans valeurs. Un garde bloque les clés détectées à l'écriture, au commit et au push : ne le contourne jamais, ni par le shell ni autrement. S'il bloque une valeur que tu sais factice ou publique, demande à l'utilisateur avant d'ajouter \`guard:ignore\` sur la ligne.
- Entrées : tout ce qui vient de l'extérieur (formulaire, URL, en-têtes, webhook, fichier, réponse d'une API ou d'une IA) est hostile. Valider côté serveur avec un schéma ; requêtes SQL paramétrées ; pas de HTML inséré tel quel ; jamais eval ni commande shell construite avec des variables.
- Accès : à chaque requête, vérifier côté serveur qui appelle ET s'il a le droit sur cette ressource précise. Row Level Security sur chaque table Supabase exposée. Droits minimaux pour chaque clé, compte et outil.
- Abus et coûts : rate limiting sur la connexion, les formulaires et tout ce qui coûte (IA, e-mail, SMS) ; timeout sur chaque appel sortant ; retries seulement sur erreurs transitoires, avec backoff exponentiel, et sur des opérations idempotentes.
- Erreurs et journaux : aucun détail interne renvoyé au client ; ni secret ni donnée personnelle dans les journaux ; jamais d'erreur avalée en silence.
- Dépendances : une seulement si elle est nécessaire, maintenue, et bien celle qu'on croit (vérifier qu'un paquet proposé existe vraiment). Lockfile commité.
- Fluidité : pas de requête dans une boucle (N+1), index sur les colonnes filtrées, listes paginées, images optimisées, animations en transform/opacity, un état de chargement, d'erreur et de vide pour chaque écran.

Quand tu appliques une de ces règles d'une façon qui n'est pas évidente, dis en une ligne pourquoi : l'utilisateur apprend en même temps. Propose /guard-system-100s (contrôle rapide) à chaque jalon et avant un commit important, -relire à la fin d'une fonctionnalité (une relecture à froid de tout ce qui a changé), -concevoir au début d'un projet ou d'une fonctionnalité qui touche des comptes, de l'argent, des données personnelles ou une IA, -activer dans un projet qui va durer et n'a pas encore de bloc guard dans son CLAUDE.md (le suivi automatique et le journal), et -prod avant une mise en ligne. Le référentiel complet et le glossaire des notions sont dans le skill guard-system-100s.`

const barres = (chemin: string) => chemin.replace(/\\/g, '/').replace(/\/+$/, '')
const parent = (chemin: string) => barres(chemin).replace(/\/[^/]*$/, '')
const nom = (chemin: string) => barres(chemin).split('/').pop() ?? chemin
const absolu = (chemin: string, base: string) =>
  /^[A-Za-z]:[\\/]|^[\\/~]/.test(chemin) ? barres(chemin) : `${barres(base)}/${chemin}`
const scanner = ($: EngineInterface) => `${barres($.plugin.root)}/skills/guard-system-100s/audit.mjs`

async function compter($: EngineInterface, quoi: 'bloques' | 'alertes' | 'relectures', dernier: string | null) {
  await update($, GARDE, g => ({ ...g, [quoi]: g[quoi] + 1, dernier: dernier ?? g.dernier }))
}

// ─── Écritures de fichiers ───

type Refus = { court: string; texte: string }

async function refuser($: EngineInterface, chemin: string, texte: string): Promise<Refus | null> {
  if (!DOC.test(chemin)) {
    const publiques = variablesPubliquesSecretes(texte)
    if (publiques.length) {
      return {
        court: `${publiques[0]} serait publique`,
        texte: `guard-system-100s (SEC-02) : ${publiques.join(', ')} porte un préfixe public (VITE_, NEXT_PUBLIC_…) : sa valeur serait recopiée en clair dans le code envoyé au navigateur, lisible par tous. Retire le préfixe, garde la variable côté serveur, et fais passer l'appel par une route serveur (route API, Edge Function, Worker) qui garde la clé.`,
      }
    }
  }
  if (estFichierSecrets(chemin)) {
    const r = await $.process.run(['git', 'check-ignore', '-q', chemin], { cwd: parent(chemin), timeoutMs: 10_000 }).catch(() => null)
    if (r?.exitCode !== 1) return null
    return {
      court: `${nom(chemin)} non ignoré par git`,
      texte: `guard-system-100s (SEC-03) : ${nom(chemin)} est fait pour garder des secrets, mais git ne l'ignore pas : un \`git add .\` le publierait. Ajoute d'abord à .gitignore les lignes \`.env\`, \`.env.*\`, \`!.env.example\` et \`.dev.vars\`, puis réessaie.`,
    }
  }
  const secrets = chercherSecrets(texte, chemin).filter(s => s.bloque)
  if (secrets.length) {
    const liste = secrets.slice(0, 5).map(s => `ligne ${s.ligne} : ${s.nom} (${s.extrait})`).join(' ; ')
    return {
      court: `${secrets[0]?.nom} dans ${nom(chemin)}`,
      texte: `guard-system-100s (SEC-01) : écriture refusée, ${nom(chemin)} contiendrait un secret en dur (${liste}). Mets la valeur dans .env (ignoré par git) ou dans le coffre de la plateforme, et lis-la depuis l'environnement côté serveur (process.env.NOM, os.environ["NOM"], PropertiesService en Apps Script). Ne recopie jamais la valeur ailleurs. Si c'est une valeur publique ou factice, demande à l'utilisateur, puis ajoute \`guard:ignore\` en commentaire sur la ligne.`,
    }
  }
  if (!DOC.test(chemin) && fuiteAdminSupabase(chemin, texte)) {
    return {
      court: `clé admin Supabase côté navigateur`,
      texte: `guard-system-100s (SEC-02) : ${nom(chemin)} part au navigateur et cite la clé admin de Supabase (service_role / secret), qui contourne toute la Row Level Security. Elle ne sert que côté serveur ; le navigateur utilise la clé publishable (anon) et la RLS.`,
    }
  }
  return null
}

function alertes(chemin: string, texte: string, partiel: boolean): string | null {
  const douteux = chercherSecrets(texte, chemin).filter(s => !s.bloque)
  const motifs = chercherMotifs(texte, chemin)
  if (!douteux.length && !motifs.length) return null
  const ou = partiel ? 'ligne du passage modifié' : 'ligne'
  const lignes = [
    ...douteux.map(s => `- ${ou} ${s.ligne} · ${s.nom} (${s.extrait}) : vrai secret → variable d'environnement ; valeur publique ou factice → \`guard:ignore\` avec l'accord de l'utilisateur.`),
    ...motifs.slice(0, 6).map(m => `- ${ou} ${m.ligne} · [${m.gravite}, ${m.ref}] ${m.message}`),
  ]
  return `guard-system-100s a relevé dans ${nom(chemin)} :\n${lignes.join('\n')}\nCorrige ce qui est réel. Pour une fausse alerte, dis en une ligne à l'utilisateur pourquoi ce n'en est pas une.`
}

async function garder($: EngineInterface, chemin: string, texte: string, partiel: boolean, suite: () => Promise<ToolCallResult>) {
  if (!chemin || texte.length > 2_000_000) return suite()
  const refus = await refuser($, chemin, texte)
  if (refus) {
    await compter($, 'bloques', refus.court)
    $.ui.toast(`guard-system-100s : écriture bloquée, ${refus.court}`)
    return { deny: refus.texte }
  }
  const r = await suite()
  if (r.deny !== undefined || r.isError) return r
  await noter($, chemin, texte)
  const a = alertes(chemin, texte, partiel)
  if (!a) return r
  await compter($, 'alertes', null)
  return { ...r, context: [...(r.context ?? []), a] }
}

// ─── git commit, git push, git add ───

// Un git en position de commande (début, après ; && || | ou une parenthèse), pas dans un message.
const GIT = /(?:^|[;&|(\n]\s*|\b(?:then|do)\s+)git\b((?:\s+-C\s+(?:"[^"]*"|'[^']*'|\S+)|\s+-c\s+\S+)*)\s+(commit|push|add)\b([^\n;&|]*)/g

function dossierDe(options: string, commande: string, cwd: string) {
  const c = /-C\s+(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(options)
  if (c) return absolu(c[1] ?? c[2] ?? c[3] ?? '.', cwd)
  const cd = /(?:^|[;&]\s*)(?:cd|Set-Location|sl|pushd)\s+(?:"([^"]*)"|'([^']*)'|([^\s;&]+))/.exec(commande)
  if (cd) return absolu(cd[1] ?? cd[2] ?? cd[3] ?? '.', cwd)
  return barres(cwd)
}

async function garderGit($: EngineInterface, commande: string, suite: () => Promise<ToolCallResult>) {
  const actions = [...commande.matchAll(GIT)]
  if (!actions.length) return suite()
  const cwd = await $.session.cwd()
  let dossierAjout: string | null = null
  // Un `git add` avant le commit, dans la même commande : le contrôle passe avant l'ajout, il
  // doit donc compter ce que l'ajout emporte (tout pour un ajout large, sinon ses chemins).
  const ajoutAvant = (i: number) => actions.slice(0, i).filter(a => a[2] === 'add')
  const portee = (ajouts: RegExpExecArray[]) => {
    if (!ajouts.length) return []
    const jetons = ajouts.flatMap(a => (a[3] ?? '').trim().split(/\s+/)).map(t => t.replace(/^['"]|['"]$/g, '')).filter(Boolean)
    const chemins = jetons.filter(t => !t.startsWith('-'))
    const large = !chemins.length || jetons.some(t => /^(-A|--all|-u|--update|--no-ignore-removal)$/.test(t)) || chemins.some(t => /^(\.|\*|:\/|\.\/)$/.test(t))
    return large ? ['--non-suivis'] : [`--fichiers=${chemins.join('|')}`]
  }
  for (const [i, [, options = '', verbe = '', reste = '']] of actions.entries()) {
    const dossier = dossierDe(options, commande, cwd)
    if (verbe === 'add') {
      dossierAjout = dossier
      const nomme = reste.split(/\s+/).map(t => t.replace(/^['"]|['"]$/g, '')).filter(t => t && !t.startsWith('-') && estFichierSecrets(t))
      if (nomme.length) {
        await compter($, 'bloques', `git add ${nomme[0]}`)
        $.ui.toast(`guard-system-100s : git add ${nomme[0]} bloqué`)
        return { deny: `guard-system-100s (SEC-03) : ${nomme.join(', ')} est un fichier de secrets, il ne doit jamais être indexé. Vérifie qu'il est dans .gitignore et indexe le reste sans lui. Pour documenter les variables, c'est .env.example (noms sans valeurs).` }
      }
      continue
    }
    const commitA = verbe === 'commit' && /(?:^|\s)-(?!-)[A-Za-z]*a[A-Za-z]*(?=\s|$)|\s--all\b/.test(reste)
    const opts = verbe === 'push' ? ['--push'] : ['--staged', ...(commitA ? ['--commit-a'] : []), ...portee(ajoutAvant(i))]
    const r = await $.process.run(['node', scanner($), dossier, ...opts], { cwd: dossier, timeoutMs: 60_000 }).catch(() => null)
    if (r?.exitCode === 1) {
      await compter($, 'bloques', `git ${verbe}`)
      $.ui.toast(`guard-system-100s : git ${verbe} bloqué, un secret allait partir`)
      return { deny: `${r.stderr.trim()}\n\nNe contourne pas ce contrôle (ni --no-verify, ni une autre commande) : retire le secret de ce qui part, puis relance.` }
    }
  }
  const r = await suite()
  if (!dossierAjout || r.deny !== undefined || r.isError) return r
  const index = await $.process.run(['git', 'diff', '--cached', '--name-only'], { cwd: dossierAjout, timeoutMs: 10_000 }).catch(() => null)
  const secrets = (index?.stdout ?? '').split('\n').map(l => l.trim()).filter(l => l && estFichierSecrets(l))
  if (!secrets.length) return r
  await compter($, 'alertes', null)
  return { ...r, context: [...(r.context ?? []), `guard-system-100s (SEC-03) : ${secrets.join(', ')} vient d'être indexé alors que c'est un fichier de secrets. Retire-le tout de suite : \`git restore --staged ${secrets[0] ?? ''}\`, puis ajoute-le à .gitignore.`] }
}

// ─── La preuve et la relecture, avant de rendre la main ───

// Le tour retient le code écrit depuis la dernière fin de tour, et si une vérification a réussi
// depuis la dernière écriture.
async function noter($: EngineInterface, chemin: string, texte: string) {
  const c = barres(chemin)
  if (DOC.test(c) || HORS_CODE.test(c)) return
  aControler = true
  dernierFichier = c
  await update($, TOUR, t => ({
    fichiers: t.fichiers.includes(c) ? t.fichiers : [...t.fichiers, c],
    lignes: t.lignes + texte.split('\n').length,
    prouve: false,
  }))
}

const prouver = ($: EngineInterface) => update($, TOUR, t => (t.prouve ? t : { ...t, prouve: true }))

function relecture(t: Tour): string | null {
  const gros = t.lignes >= GROS
  if (!t.fichiers.length || (t.prouve && !gros)) return null
  const fichiers = t.fichiers.slice(0, 5).map(nom).join(', ') + (t.fichiers.length > 5 ? ` et ${t.fichiers.length - 5} autres` : '')
  const etapes = [
    t.prouve ? null : `Prouve que ça marche : rien n'a tourné depuis la dernière modification. Lance ce qui le prouve (build, types, tests, et le parcours réel : l'app ou le script lancé, la fonctionnalité essayée), vérifie que ce qui marchait marche encore, et corrige ce qui casse. Si rien ne peut se lancer ici, dis à l'utilisateur quoi vérifier lui-même.`,
    gros ? `Relis le diff comme un architecte relit celui d'un autre : peut-on faire plus simple, plus court, autrement ? Quelque chose d'existant le fait-il déjà ? Reste-t-il du code mort, une duplication, une incohérence avec le code autour, un calcul ou une requête de trop ? Applique ce qui améliore vraiment, puis revérifie.` : null,
  ].filter(e => e !== null)
  return `guard-system-100s, avant de rendre la main (${fichiers}) :\n${etapes.map((e, i) => `${i + 1}. ${e}`).join('\n')}\nPuis dis en une ligne ce que tu as vérifié et ce que la relecture a changé, ou qu'elle n'a rien trouvé.`
}

// ─── Le dernier contrôle du projet, pour le bandeau ───

// Le projet suivi : celui du dernier fichier écrit, sinon celui de la session.
const depart = async ($: EngineInterface) => (dernierFichier ? parent(dernierFichier) : barres(await $.session.cwd()))

const lireJson = async <T,>($: EngineInterface, fichier: string): Promise<T | null> => {
  if (!(await $.fs.exists(fichier).catch(() => false))) return null
  try {
    return JSON.parse(await $.fs.read(fichier)) as T
  } catch {
    return null
  }
}

// Remonte du projet suivi vers la racine du disque, jusqu'au premier dossier où `trouver` répond.
async function remonter<T>($: EngineInterface, trouver: (dossier: string) => Promise<T | null>): Promise<T | null> {
  let d = await depart($)
  for (let i = 0; i < 12 && d; i++) {
    const r = await trouver(d)
    if (r !== null) return r
    const p = parent(d)
    if (p === d) break
    d = p
  }
  return null
}

const lireAudit = ($: EngineInterface) => remonter<Audit>($, async d => {
  const j = await lireJson<Omit<Audit, 'racine' | 'perime' | 'phase'>>($, `${d}/${DOSSIER}/audit.json`)
  if (!j) return null
  const mode = await lireJson<{ actif?: boolean; phase?: string }>($, `${d}/${DOSSIER}/mode.json`)
  const tete = await $.process.run(['git', 'rev-parse', '--short', 'HEAD'], { cwd: d, timeoutMs: 5000 }).catch(() => null)
  const commit = tete?.exitCode === 0 ? tete.stdout.trim() : null
  const perime = Boolean(j.commit && commit && !commit.startsWith(j.commit) && !j.commit.startsWith(commit))
  return { racine: d, date: j.date, commit: j.commit, type: j.type, compte: j.compte, perime, phase: mode?.actif ? (mode.phase ?? null) : null }
})

// ─── Le suivi automatique du mode guard ───

// La racine du projet en mode guard qui contient ce qu'on vient d'écrire, sinon null. Un mode
// éteint arrête la recherche ('') : un projet parent en mode ne suit pas un sous-projet qui l'a éteint.
const racineMode = async ($: EngineInterface) =>
  (await remonter<string>($, async d => {
    const mode = await lireJson<{ actif?: boolean }>($, `${d}/${DOSSIER}/mode.json`)
    return mode ? (mode.actif ? d : '') : null
  })) || null

type Bilan = { nouveaux?: { ref: string; gravite: string; titre: string; lieu: string }[] }

// Le scanner repasse, note la différence dans le journal ; un nouveau point grave arrive dans la
// conversation, pour que Claude le traite ou l'explique au début de sa prochaine réponse.
async function controleAuto($: EngineInterface) {
  const racine = await racineMode($)
  if (!racine) return
  const r = await $.process.run(['node', scanner($), racine, '--auto'], { cwd: racine, timeoutMs: 120_000 }).catch(() => null)
  await rafraichir($)
  let bilan: Bilan = {}
  try {
    bilan = JSON.parse(r?.stdout ?? '') as Bilan
  } catch {
    return
  }
  const nouveaux = bilan.nouveaux ?? []
  if (!nouveaux.length) return
  const s = nouveaux.length > 1
  $.ui.toast(`guard-system-100s : ${nouveaux.length} nouveau${s ? 'x' : ''} point${s ? 's' : ''} à traiter (${nouveaux[0]?.ref})`)
  const liste = nouveaux.map(n => `- ${n.ref} · ${n.titre} (${n.gravite}) · ${n.lieu}`).join('\n')
  await $.session.append({
    message: {
      type: 'user',
      content: [{ type: 'text', text: `guard-system-100s, contrôle automatique après les dernières modifications de ${nom(racine)} :\n${liste}\nAu début de ta prochaine réponse, dis-le à l'utilisateur, une ligne par point : vrai problème (et la correction que tu proposes) ou fausse alerte (et pourquoi). Le risque et la notion à retenir sont dans ${DOSSIER}/JOURNAL.md.` }],
    },
  }).catch(() => undefined)
}

const rafraichir = async ($: EngineInterface) => {
  const audit = await lireAudit($)
  await update($, AUDIT, () => audit)
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await rafraichir($)
    return r
  })

  // Les règles, dans chaque session qui peut écrire du code.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (!e.tools.some(t => t === 'Write' || t === 'Edit')) return r
    return { sections: [...r.sections, { id: 'guard-system-100s:regles', text: REGLES, scope: 'session' as const }] }
  })

  on('tool.call', { tool: 'Write' }, ($, e, next) => garder($, e.file_path, e.content, false, () => next(e)))
    .catch(($, e, next) => {
      $.ui.toast('guard-system-100s : contrôle de l’écriture impossible, elle passe sans lui')
      return next(e)
    })
  on('tool.call', { tool: 'Edit' }, ($, e, next) => garder($, e.file_path, e.new_string, true, () => next(e)))
    .catch(($, e, next) => {
      $.ui.toast('guard-system-100s : contrôle de l’écriture impossible, elle passe sans lui')
      return next(e)
    })
  on('tool.call', { tool: 'NotebookEdit' }, ($, e, next) => garder($, e.notebook_path, e.new_source, true, () => next(e)))
    .catch(($, e, next) => next(e))

  // Le shell (Bash partout, PowerShell sous Windows) : le garde git, et les vérifications qui
  // prouvent que le code marche. Le navigateur compte comme un essai réel.
  on('tool.call', async ($, e, next) => {
    const outil = String(e.tool)
    const commande = (e as { command?: unknown }).command
    const shell = (outil === 'Bash' || outil === 'PowerShell') && typeof commande === 'string'
    if (!shell && !NAVIGATEUR.test(outil)) return next(e)
    const r = shell && /\bgit\b/.test(commande) ? await garderGit($, commande, () => next(e)) : await next(e)
    if (r.deny === undefined && !r.isError && (!shell || VERIF.test(commande))) await prouver($)
    return r
  }).catch(($, e, next) => {
    $.ui.toast('guard-system-100s : contrôle git impossible, la commande passe sans lui')
    return next(e)
  })

  // Avant de rendre la main : la preuve et la relecture, une fois. La relance qu'elle provoque se
  // termine sans nouvelle relance (stop_hook_active) ; un travail en arrière-plan attendu laisse le
  // tour ouvert.
  on('classic.Stop', async ($, e, next) => {
    const r = await next(e)
    if (e.background_tasks?.length) return r
    const tour = await read($, TOUR)
    await update($, TOUR, () => TOUR_VIDE)
    const texte = e.stop_hook_active ? null : relecture(tour)
    if (!texte) return r
    await compter($, 'relectures', null)
    $.ui.toast('guard-system-100s : preuve et relecture avant de rendre la main')
    return { ...r, block: r.block ? `${r.block}\n\n${texte}` : texte }
  })

  // Après la réponse : le suivi automatique si du code a été écrit, sinon le bandeau suit le
  // scanner qui a pu tourner pendant la réponse.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) return r
    if (!aControler) await rafraichir($)
    else {
      aControler = false
      // Hors de la réponse, pour ne pas la retarder : le scanner prend une à deux secondes.
      $.clock.after(0, () => void controleAuto($).catch(() => undefined))
    }
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const dessous = await next(e)
    const audit = await read($, AUDIT)
    const garde = await read($, GARDE)
    const vu = garde.bloques || garde.alertes || garde.relectures
    if (e.props.hasSurvey || (!audit && !vu)) return dessous

    const { Box, Text } = $.ui.resolve(e)
    const c = audit?.compte
    const couleur = !c ? undefined : c.bloquant ? ROUGE : c.important ? JAUNE : VERT
    const resume = !c ? '' : c.bloquant
      ? `✗ ${pluriel(c.bloquant, 'bloquant')} · ${pluriel(c.important, 'important')} · ${c['conseillé']} conseillé(s)`
      : `✓ rien de bloquant · ${pluriel(c.important, 'important')} · ${c['conseillé']} conseillé(s)`
    const date = audit ? audit.date.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : ''

    return (
      <Box flexDirection="column">
        {dessous}
        <Box key="guard" flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Text key="nom" bold color={ORANGE}>guard</Text>
          {audit?.phase ? <Text key="mode" dimColor>{`suivi auto · ${audit.phase}`}</Text> : null}
          {audit ? <Text key="compte" color={couleur}>{resume}</Text> : null}
          {audit ? (
            <Text key="date" dimColor>
              {`${audit.type === 'complet' ? 'audit' : 'contrôle'} du ${date}${audit.perime ? ' · code modifié depuis' : ''}`}
            </Text>
          ) : null}
          {vu ? (
            <Text key="session" dimColor>
              {`cette session : ${pluriel(garde.bloques, 'blocage')}, ${pluriel(garde.alertes, 'alerte')}, ${pluriel(garde.relectures, 'relecture')}${garde.dernier ? ` (dernier blocage : ${garde.dernier})` : ''}`}
            </Text>
          ) : null}
        </Box>
        {c?.bloquant || audit?.perime ? (
          <Text key="suite" dimColor wrap="truncate-end">
            {c?.bloquant ? '→ /guard-system-100s pour voir et corriger' : '→ /guard-system-100s pour refaire le contrôle'}
          </Text>
        ) : null}
      </Box>
    )
  })
}
