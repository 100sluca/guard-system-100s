// Ce que le bandeau lit : le dernier contrôle du projet (son audit.json) et ce que le garde a vu
// pendant la session.
export type Compte = { bloquant: number; important: number; 'conseillé': number }

export type Audit = {
  racine: string
  date: string
  commit: string | null
  type: 'rapide' | 'complet'
  compte: Compte
  // Le code a changé depuis ce contrôle (le commit courant n'est plus le sien).
  perime: boolean
  // La phase du mode guard du projet (conception, en cours, en ligne), null s'il n'est pas allumé.
  phase: string | null
}

export type Garde = {
  bloques: number
  alertes: number
  // Les fins de tour où le garde a relancé Claude pour prouver et relire.
  relectures: number
  dernier: string | null
}

// Le code écrit depuis la dernière fin de tour, pour la preuve et la relecture.
export type Tour = {
  fichiers: string[]
  lignes: number
  // Une vérification (build, types, tests, code lancé) a réussi depuis la dernière écriture.
  prouve: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'guard-system-100s': { audit: Audit | null; garde: Garde; tour: Tour }
  }
}
