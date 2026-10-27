import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Les clés d'essai sont assemblées à l'exécution : écrites d'un bloc, ce fichier serait lui-même
// une fuite aux yeux des scanners (et du garde).
const STRIPE = ['sk', 'live', '51Qa8ZtR4kWm2Xp9LbV7cYd3Nf6Hj'].join('_')

const BANDEAU = {
  plugin: 'guard-system-100s',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

// Sous le plugin, rien : ces hooks tiennent lieu du moteur. `ecrits` note ce qui est arrivé jusqu'à l'outil.
function moteur(on: On) {
  const ecrits: string[] = []
  on('session.cwd', () => ({ value: '/projet' }))
  on('fs.exists', () => ({ value: false }))
  on('classic.Stop', () => ({}))
  on('tool.call', (_, e) => {
    ecrits.push(String((e as { file_path?: string }).file_path))
    return { result: {} }
  })
  return ecrits
}

const refus = (r: unknown) => {
  const x = r as { deny?: string; text?: string; isError?: boolean }
  return x.deny ?? (x.isError ? x.text : undefined)
}

test('une clé écrite en dur est refusée, et le fichier n’est pas écrit', async ($, on) => {
  const ecrits = moteur(on)
  const r = await $.tool.call({ tool: 'Write', file_path: '/projet/src/stripe.ts', content: `export const stripe = new Stripe('${STRIPE}')\n` })
  expect(refus(r)).toMatch(/SEC-01/)
  expect(refus(r)).toMatch(/clé secrète Stripe/)
  expect(refus(r)).not.toContain(STRIPE)
  expect(ecrits).toEqual([])
})

test('du code propre passe sans rien dire', async ($, on) => {
  const ecrits = moteur(on)
  const r = await $.tool.call({ tool: 'Write', file_path: '/projet/src/stripe.ts', content: 'export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)\n' })
  expect(refus(r)).toBeUndefined()
  expect(ecrits).toEqual(['/projet/src/stripe.ts'])
})

test('une variable publique au nom de secret est refusée, la documentation peut la nommer', async ($, on) => {
  const ecrits = moteur(on)
  const code = await $.tool.call({ tool: 'Edit', file_path: '/projet/src/ia.ts', old_string: 'x', new_string: 'const cle = import.meta.env.VITE_OPENAI_API_KEY' }) // guard:ignore
  expect(refus(code)).toMatch(/SEC-02/)
  const doc = await $.tool.call({ tool: 'Write', file_path: '/projet/README.md', content: 'Ne jamais créer VITE_OPENAI_API_KEY : la clé serait publique.\n' }) // guard:ignore
  expect(refus(doc)).toBeUndefined()
  expect(ecrits).toEqual(['/projet/README.md'])
})

test('une valeur marquée guard:ignore passe', async ($, on) => {
  const ecrits = moteur(on)
  const r = await $.tool.call({ tool: 'Write', file_path: '/projet/demo.js', content: `const cle = '${STRIPE}' // guard:ignore clé de démonstration révoquée\n` })
  expect(refus(r)).toBeUndefined()
  expect(ecrits).toEqual(['/projet/demo.js'])
})

test('le code à risque passe, avec une alerte que Claude lit', async ($, on) => {
  moteur(on)
  const r = await $.tool.call({ tool: 'Write', file_path: '/projet/src/vue.js', content: 'el.innerHTML = reponse.texte\n' }) as { context?: readonly string[] }
  expect(refus(r)).toBeUndefined()
  expect((r.context ?? []).join('\n')).toMatch(/WEB-01/)
})

test('du code écrit sans vérification : une relance, une seule, pour prouver qu’il marche', async ($, on) => {
  moteur(on)
  await $.tool.call({ tool: 'Edit', file_path: '/projet/src/prix.ts', old_string: 'a', new_string: 'const ttc = ht * 1.2' })
  const fin = await $.classic.Stop({ stop_hook_active: false })
  expect(fin.block).toMatch(/Prouve que ça marche/)
  expect(fin.block).toMatch(/prix\.ts/)
  expect(fin.block).not.toMatch(/Relis le diff/)
  const relance = await $.classic.Stop({ stop_hook_active: true })
  expect(relance.block).toBeUndefined()
})

test('vérifié : un petit changement passe, un gros est relu, la documentation ne compte pas', async ($, on) => {
  moteur(on)
  await $.tool.call({ tool: 'Edit', file_path: '/projet/src/prix.ts', old_string: 'a', new_string: 'const ttc = ht * 1.2' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect((await $.classic.Stop({ stop_hook_active: false })).block).toBeUndefined()

  await $.tool.call({ tool: 'Write', file_path: '/projet/README.md', content: 'ligne\n'.repeat(80) })
  expect((await $.classic.Stop({ stop_hook_active: false })).block).toBeUndefined()

  await $.tool.call({ tool: 'Write', file_path: '/projet/src/panier.ts', content: 'export const x = 1\n'.repeat(40) })
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  expect((await $.classic.Stop({ stop_hook_active: false })).block).toMatch(/Prouve que ça marche/)

  await $.tool.call({ tool: 'Write', file_path: '/projet/src/panier.ts', content: 'export const x = 1\n'.repeat(40) })
  await $.tool.call({ tool: 'PowerShell', command: 'cd C:\\projet; npx tsc --noEmit' })
  const fin = await $.classic.Stop({ stop_hook_active: false })
  expect(fin.block).toMatch(/Relis le diff/)
  expect(fin.block).not.toMatch(/Prouve que ça marche/)
})

// Un projet `/projet` en mode guard (ou pas), et un scanner qui répond `nouveaux` au contrôle automatique.
function projet(on: On, enMode: boolean, nouveaux: unknown[]) {
  const lances: string[][] = []
  on('session.cwd', () => ({ value: '/projet' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // Sous Windows, le moteur passe `C:\projet\…` : on compare les chemins en barres obliques.
  on('fs.exists', (_, e) => ({ value: enMode && /(^|:)\/projet\/__guard-system-100s\/(mode|audit)\.json$/.test(e.path.replace(/\\/g, '/')) }))
  on('fs.read', (_, e) => ({
    value: e.path.endsWith('mode.json')
      ? JSON.stringify({ actif: true, phase: 'en cours' })
      : JSON.stringify({ date: '2026-10-24T16:00:00.000Z', commit: null, type: 'rapide', compte: { bloquant: 1, important: 0, 'conseillé': 0 } }),
  }))
  on('process.run', (_, e) => {
    lances.push([...e.argv])
    const auto = e.argv.includes('--auto')
    return { value: { exitCode: auto ? 0 : 1, stdout: auto ? JSON.stringify({ nouveaux }) : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('classic.Stop', () => ({}))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return lances
}

const FIN_DE_TOUR = { answer: 'fini', reason: 'answer', durationMs: 1, isAborted: false, turnId: 't1' } as const

test('en mode guard, du code écrit relance le contrôle seul, et un nouveau bloquant arrive dans la conversation', async ($, on) => {
  const horloge = mock.clock(on)
  const conversation = mock.session(on)
  const lances = projet(on, true, [{ ref: 'BDD-01', gravite: 'bloquant', titre: 'Table Supabase sans Row Level Security', lieu: 'supabase/migrations/0002.sql' }])
  await $.tool.call({ tool: 'Write', file_path: '/projet/supabase/migrations/0002.sql', content: 'create table public.t (id int);\n' })
  await $.turn.complete(FIN_DE_TOUR)
  await horloge.settle()
  expect(lances.find(a => a.includes('--auto'))?.join(' ')).toMatch(/projet --auto$/)
  expect(conversation.appended().map(r => JSON.stringify(r.message)).join('\n')).toMatch(/BDD-01/)

  // Un tour sans code écrit ne relance rien.
  const avant = lances.filter(a => a.includes('--auto')).length
  await $.turn.complete(FIN_DE_TOUR)
  await horloge.settle()
  expect(lances.filter(a => a.includes('--auto')).length).toBe(avant)
})

test('hors mode guard, pas de contrôle automatique', async ($, on) => {
  const horloge = mock.clock(on)
  const lances = projet(on, false, [])
  await $.tool.call({ tool: 'Write', file_path: '/projet/src/a.ts', content: 'export const a = 1\n' })
  await $.turn.complete(FIN_DE_TOUR)
  await horloge.settle()
  expect(lances.some(a => a.includes('--auto'))).toBe(false)
})

test('le bandeau dit que le projet est suivi, et sa phase', async ($, on) => {
  projet(on, true, [])
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>moteur</Text>
  })
  await $.session.start({ cwd: '/projet', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BANDEAU, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /suivi auto/ }))?.text).toBe('suivi auto · en cours')
  expect(await ui.find({ type: 'Text', text: /1 bloquant/ })).toBeDefined()
  await ui.unmount()
})

test('les règles rejoignent le prompt système des sessions de code', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'moteur', scope: 'shared' as const }] }))
  // Une vraie session fournit le modèle ; le banc d'essai n'en a pas.
  const session = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['desktop'] as const, outputStyle: null, traits: [] }
  const code = await $.prompt.compose({ ...session, tools: ['Read', 'Write', 'Edit'] })
  expect(code.sections.map(s => s.id)).toContain('guard-system-100s:regles')
  const lecture = await $.prompt.compose({ ...session, tools: ['Read'] })
  expect(lecture.sections.map(s => s.id)).not.toContain('guard-system-100s:regles')
})

test('le bandeau compte les blocages de la session, sur chaque surface', async ($, on) => {
  moteur(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>moteur</Text>
  })
  await $.tool.call({ tool: 'Write', file_path: '/projet/a.ts', content: `const k = '${STRIPE}'\n` })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BANDEAU, surface })
    expect((await ui.find({ type: 'Text', text: /1 blocage/ }))?.text).toMatch(/clé secrète Stripe/)
    expect(await ui.find({ type: 'Text', text: /moteur/ })).toBeDefined()
    await ui.unmount()
  }
})
