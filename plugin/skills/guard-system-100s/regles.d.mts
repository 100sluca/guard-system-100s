// Les types de regles.mjs, pour le module des hooks (TypeScript).
export type Gravite = 'bloquant' | 'important' | 'conseillé'
export type SecretTrouve = { id: string; nom: string; ligne: number; extrait: string; bloque: boolean }
export type MotifTrouve = { id: string; ref: string; gravite: Gravite; ligne: number; message: string }

export declare const MARQUE_IGNORER: RegExp
export declare const SECRETS: readonly { id: string; nom: string; re: RegExp }[]
export declare const MOTIFS: readonly { id: string; ref: string; gravite: Gravite; fichiers: RegExp; re: RegExp; exclure?: RegExp; sansChaines?: boolean; message: string }[]
export declare function entropie(texte: string): number
export declare function estFactice(valeur: string): boolean
export declare function masquer(valeur: string): string
export declare function estFichierSecrets(chemin: string): boolean
export declare function estModeleEnv(chemin: string): boolean
export declare function estFichierTest(chemin: string): boolean
export declare function estCoteClient(chemin: string, texte?: string): boolean
export declare function fuiteAdminSupabase(chemin: string, texte: string): boolean
export declare function chercherSecrets(texte: string, chemin?: string): SecretTrouve[]
export declare function variablesPubliquesSecretes(texte: string): string[]
export declare function chercherMotifs(texte: string, chemin: string): MotifTrouve[]
