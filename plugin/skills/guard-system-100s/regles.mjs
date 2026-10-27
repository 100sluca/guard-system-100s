// Les motifs partagés par le garde permanent (hooks/register.ts) et le scanner (audit.mjs).
// Du JavaScript pur, sans Node : le garde tourne dans l'environnement des hooks, qui n'a ni fs ni
// process. Chaque règle renvoie au contrôle du référentiel (references/) qui l'explique.

// Une ligne qui porte cette marque est laissée passer : seulement pour une valeur factice ou
// publique, avec l'accord de l'utilisateur. Les marques des outils voisins (bandit, ruff, gitleaks,
// detect-secrets, Sonar) valent aussi : quelqu'un a déjà examiné la ligne.
export const MARQUE_IGNORER = /guard[:-]ignore|\bnosec\b|noqa:\s*S\d|gitleaks:allow|pragma:\s*allowlist\s+secret|NOSONAR/i

// Les clés au format reconnaissable. `bloque` : le garde refuse l'écriture.
export const SECRETS = [
  { id: 'cle-privee', nom: 'clé privée', re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'aws', nom: "clé d'accès AWS", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'github', nom: 'jeton GitHub', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{50,255})\b/ },
  { id: 'gitlab', nom: 'jeton GitLab', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'slack', nom: 'jeton Slack', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'slack-webhook', nom: 'webhook Slack', re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{20,}/ },
  { id: 'discord-webhook', nom: 'webhook Discord', re: /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{50,}/ },
  { id: 'stripe', nom: 'clé secrète Stripe', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { id: 'stripe-webhook', nom: 'secret de webhook Stripe', re: /\bwhsec_[A-Za-z0-9+/=]{20,}/ },
  { id: 'anthropic', nom: 'clé Anthropic', re: /\bsk-ant-[a-z]+\d*-[A-Za-z0-9_-]{40,}/ },
  { id: 'openai', nom: 'clé OpenAI', re: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}|\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/ },
  { id: 'google', nom: 'clé Google (Gemini, Cloud, Maps ou Firebase)', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'google-oauth', nom: 'secret OAuth Google', re: /\bGOCSPX-[A-Za-z0-9_-]{28}\b/ },
  { id: 'supabase', nom: 'clé secrète Supabase', re: /\bsb_secret_[A-Za-z0-9_-]{20,}/ },
  { id: 'sendgrid', nom: 'clé SendGrid', re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/ },
  { id: 'npm', nom: 'jeton npm', re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { id: 'huggingface', nom: 'jeton Hugging Face', re: /\bhf_[A-Za-z0-9]{30,}\b/ },
  { id: 'groq', nom: 'clé Groq', re: /\bgsk_[A-Za-z0-9]{40,}\b/ },
  { id: 'xai', nom: 'clé xAI', re: /\bxai-[A-Za-z0-9]{70,}\b/ },
  { id: 'replicate', nom: 'jeton Replicate', re: /\br8_[A-Za-z0-9]{37}\b/ },
  { id: 'shopify', nom: 'jeton Shopify', re: /\bshp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}\b/ },
  { id: 'telegram', nom: 'jeton de bot Telegram', re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/ },
]

const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}/
const URL_MDP = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?|mssql):\/\/[^\s:@/'"`]+:([^\s@'"`]{4,})@/i
const AFFECTATION = /([A-Za-z0-9_.-]*(?:api[_-]?key|apikey|secret|token|passwd|password|pwd|private[_-]?key|access[_-]?key|auth[_-]?key)[A-Za-z0-9_]*)['"]?\s*(?::|=|=>)\s*['"`]([^'"`\s]{12,})['"`]/i
const BEARER = /['"`]Bearer\s+([A-Za-z0-9._~+/=-]{20,})['"`]/
// Noms de variables qui ne désignent pas un secret malgré leur mot-clé.
const NOM_PUBLIC = /public|publishable|anon|_url|url$|_id$|endpoint|uri|header|type|name|nom|field|label|placeholder|length|expires|ttl|count|limit|prefix|format|pattern|regex|key_?name/i
const FACTICE = /^(?:x{3,}|\*{3,}|\.{3,}|0{6,}|<|\$\{|\{\{|%|#\{|your|my[_-]|ma[_-]|mon[_-]|votre|ton[_-]|change|replace|remplace|insert|enter|put|paste|colle|example|exemple|sample|dummy|fake|factice|test|todo|placeholder|demo|secret$|password$|motdepasse)/i
const FACTICE_DANS = /x{6,}|X{6,}|\.{3}|\*{4,}|<[^>]*>|0{10,}|(?:abc|123|xyz){3}|your[_-]|example|exemple|placeholder|REPLACE|CHANGE_?ME/i
const LECTURE_ENV = /process\.env|import\.meta\.env|os\.environ|getenv|Deno\.env|env\.[A-Z_]+|PropertiesService|secrets\./

export function entropie(texte) {
  if (!texte) return 0
  const compte = {}
  for (const c of texte) compte[c] = (compte[c] || 0) + 1
  let h = 0
  for (const n of Object.values(compte)) {
    const p = n / texte.length
    h -= p * Math.log2(p)
  }
  return h
}

export const estFactice = valeur => FACTICE.test(valeur) || FACTICE_DANS.test(valeur) || entropie(valeur) < 3

// Le début seulement, et la longueur : assez pour retrouver la clé, jamais assez pour s'en servir.
export const masquer = valeur => `${valeur.slice(0, Math.min(8, Math.floor(valeur.length / 4)))}…(${valeur.length} car.)`

const nomFichier = chemin => String(chemin).replace(/\\/g, '/').split('/').pop() || ''

// Les fichiers faits pour garder des secrets sur la machine, jamais commités.
export function estFichierSecrets(chemin) {
  const nom = nomFichier(chemin).toLowerCase()
  if (estModeleEnv(chemin)) return false
  return /^\.env(\..+)?$/.test(nom) || nom === '.dev.vars' || /^\.dev\.vars\./.test(nom) || nom === 'secrets.toml'
    || nom === '.npmrc' || nom === '.pypirc' || nom === '.netrc'
}

export function estModeleEnv(chemin) {
  return /^\.env\.(example|sample|template|dist|defaults|modele|exemple)$|\.example$/i.test(nomFichier(chemin))
}

export function estFichierTest(chemin) {
  return /(^|\/)(tests?|__tests__|spec|fixtures?|mocks?|__mocks__|e2e|cypress|playwright)\/|\.(test|spec)\.[a-z0-9]+$/i
    .test(String(chemin).replace(/\\/g, '/'))
}

function decoderJwt(jeton) {
  try {
    const partie = jeton.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = typeof atob === 'function' ? atob(partie + '='.repeat((4 - (partie.length % 4)) % 4)) : ''
    return JSON.parse(json)
  } catch {
    return null
  }
}

// Les secrets d'un texte, ligne par ligne. `bloque` : à refuser ; sinon une alerte à vérifier.
export function chercherSecrets(texte, chemin = '') {
  const trouves = []
  const test = estFichierTest(chemin)
  // Une configuration web Firebase ou Maps met une clé AIza publique par conception (SEC-09).
  const configPublique = /authDomain|firebaseapp\.com|messagingSenderId|maps\.googleapis|initializeApp\(/.test(texte)
  const lignes = String(texte).split(/\r?\n/)
  lignes.forEach((ligne, i) => {
    if (MARQUE_IGNORER.test(ligne) || ligne.length > 4000) return
    const ajouter = (id, nom, valeur, bloque) => {
      if (!trouves.some(t => t.ligne === i + 1 && t.id === id)) {
        trouves.push({ id, nom, ligne: i + 1, extrait: masquer(valeur), bloque })
      }
    }
    // Une clé au format connu se suffit : les motifs génériques ne la comptent pas une 2e fois.
    let connue = false
    for (const s of SECRETS) {
      const m = ligne.match(s.re)
      if (!m) continue
      const valeur = m[0]
      const variable = valeur.replace(/^(?:sk|rk)_(?:live|test)_|^[A-Za-z]+[-_]/, '')
      if (s.id !== 'cle-privee' && (FACTICE_DANS.test(valeur) || entropie(variable) < 3)) continue
      const publique = s.id === 'google' && configPublique
      ajouter(s.id, publique ? `${s.nom}, dans une config web : vérifier qu'elle est restreinte` : s.nom, valeur, !publique && !test)
      connue = true
    }
    if (connue) return
    const jwt = ligne.match(JWT)
    if (jwt) {
      const charge = decoderJwt(jwt[0])
      if (charge?.role === 'service_role') ajouter('supabase-service-role', 'clé service_role Supabase', jwt[0], true)
      else if (charge && charge.role !== 'anon') ajouter('jwt', 'jeton JWT en dur', jwt[0], false)
    }
    const url = ligne.match(URL_MDP)
    if (url && !estFactice(url[1]) && !LECTURE_ENV.test(ligne)) {
      ajouter('url-mdp', 'mot de passe dans une URL de connexion', url[1], !test)
    }
    const aff = ligne.match(AFFECTATION)
    if (aff && !NOM_PUBLIC.test(aff[1]) && !LECTURE_ENV.test(ligne) && !/^[a-z]+:\/\//i.test(aff[2])
      && !estFactice(aff[2]) && entropie(aff[2]) >= 3.5 && /[0-9]/.test(aff[2]) && /[A-Za-z]/.test(aff[2])) {
      ajouter('secret-en-dur', `secret en dur (${aff[1]})`, aff[2], !test)
    }
    const bearer = ligne.match(BEARER)
    if (bearer && !estFactice(bearer[1])) ajouter('bearer', 'jeton Bearer en dur', bearer[1], !test)
  })
  return trouves
}

// Un fichier qui part au navigateur : directive 'use client', composant Vue ou Svelte, dossier de front.
export function estCoteClient(chemin, texte = '') {
  const c = String(chemin).replace(/\\/g, '/')
  if (/(^|\/)(api|server|functions|workers?|backend|scripts|migrations)\//i.test(c)
    || /\.server\.|(^|\/)(route|middleware)\.[cm]?[jt]s$/.test(c)) return false
  return /^\s*['"]use client['"]/m.test(texte) || /\.(vue|svelte)$/.test(c)
    || /(^|\/)(components|hooks|client|frontend|public|static|www|popup|options|sidepanel|content-scripts?)\//i.test(c)
}

// La clé qui contourne la Row Level Security, citée dans du code qui part au navigateur (SEC-02).
const ADMIN_SUPABASE = /SERVICE_ROLE|service_role|sb_secret_|SUPABASE_SECRET|supabaseAdmin/
export const fuiteAdminSupabase = (chemin, texte) => estCoteClient(chemin, texte) && ADMIN_SUPABASE.test(texte)

// Variables lues par le navigateur dont le nom désigne un secret (SEC-02).
const ENV_PUBLIC = /\b(?:NEXT_PUBLIC|VITE|REACT_APP|EXPO_PUBLIC|NUXT_PUBLIC|PUBLIC|GATSBY)_[A-Z0-9_]+/g
const NOM_SECRET = /SECRET|PRIVATE|SERVICE_ROLE|SERVICE_KEY|PASSWORD|PASSWD|OPENAI|ANTHROPIC|CLAUDE|GEMINI|MISTRAL|GROQ|DEEPSEEK|PERPLEXITY|ELEVENLABS|REPLICATE|RESEND|SENDGRID|TWILIO|BREVO|MAILGUN|STRIPE_(?:SK|SECRET|RESTRICTED)|ADMIN|DATABASE_URL|DB_PASS/
const NOM_PUBLIC_ENV = /PUBLISHABLE|ANON|PUBLIC_KEY|SITE_KEY|_URL$|_ID$|_DSN$|MEASUREMENT/

export function variablesPubliquesSecretes(texte) {
  const noms = new Set()
  for (const ligne of String(texte).split(/\r?\n/)) {
    if (MARQUE_IGNORER.test(ligne)) continue
    for (const m of ligne.matchAll(ENV_PUBLIC)) {
      if (NOM_SECRET.test(m[0]) && !NOM_PUBLIC_ENV.test(m[0])) noms.add(m[0])
    }
  }
  return [...noms]
}

// Les familles de fichiers où chaque motif de code a un sens.
const JS = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|gs)$/i
const PY = /\.py$/i
const CODE_SERVEUR = /\.(?:[cm]?[jt]sx?|py|rb|php|go|gs)$/i
const WEB = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|html?|gs)$/i

// Les motifs de code à risque. `ref` : le contrôle du référentiel qui l'explique.
export const MOTIFS = [
  {
    id: 'injection-sql', ref: 'INJ-02', gravite: 'bloquant', fichiers: /\.(?:[cm]?[jt]sx?|rb|php|go|gs)$/i,
    re: /(?:\b(?:query|execute|raw|unsafe|prepare)|\$queryRawUnsafe|\$executeRawUnsafe)\s*\(\s*(?:`[^`]*\$\{|(['"])[^'"]*\b(?:SELECT|INSERT|UPDATE|DELETE|WHERE)\b[^'"]*\1\s*\+)/i,
    message: "requête SQL construite avec des variables : injection SQL possible. Passe les valeurs en paramètres (`query('… WHERE id = $1', [id])`) ou par un template balisé (sql`…`).",
  },
  {
    id: 'injection-sql-py', ref: 'INJ-02', gravite: 'bloquant', fichiers: PY,
    re: /\.execute\(\s*(?:f["']|["'][^"']*["']\s*%|[^)]*\.format\()/,
    message: "requête SQL construite avec f-string, % ou .format : injection SQL possible. Passe les valeurs en paramètres : `cursor.execute('… WHERE id = %s', (id,))`.",
  },
  {
    id: 'injection-commande', ref: 'INJ-04', gravite: 'bloquant', fichiers: CODE_SERVEUR,
    re: /\b(?:exec|execSync|spawnSync|spawn)\s*\(\s*`[^`]*\$\{|subprocess\.\w+\([^)]*shell\s*=\s*True|\bos\.system\(\s*f?["']/,
    message: "commande shell construite avec des variables : injection de commande possible. Passe un tableau d'arguments (`execFile('git', ['log', ref])`, `subprocess.run([...])`) sans shell.",
  },
  {
    id: 'eval', ref: 'INJ-03', gravite: 'important', fichiers: CODE_SERVEUR, sansChaines: true,
    re: /(?<![\w.$])eval\s*\(|\bnew\s+Function\s*\(/,
    message: 'eval / new Function exécute du texte comme du code : si une partie vient de l’extérieur, c’est une exécution de code à distance. Utilise JSON.parse, une table de correspondance ou un vrai parseur.',
  },
  {
    id: 'exec-py', ref: 'INJ-03', gravite: 'important', fichiers: PY, sansChaines: true,
    re: /(?<![\w.])exec\s*\(/,
    message: "exec exécute du texte comme du code Python : si une partie vient de l'extérieur, c'est une exécution de code à distance.",
  },
  {
    id: 'html-brut', ref: 'WEB-01', gravite: 'important', fichiers: WEB,
    re: /\.(?:inner|outer)HTML\s*\+?=(?!=)|insertAdjacentHTML\s*\(|document\.write(?:ln)?\s*\(|dangerouslySetInnerHTML|\bv-html\s*=|\{@html\s/,
    // Une constante écrite en dur (script de thème, CSS généré) n'est pas une entrée extérieure.
    exclure: /DOMPurify|sanitize|purify|escapeHtml|textContent|__html:\s*[A-Z][A-Z0-9_]*\s*\}/i,
    message: "HTML inséré tel quel : si une partie vient d'un utilisateur, d'une URL ou d'une IA, c'est une faille XSS. Utilise textContent / le rendu normal du framework, ou désinfecte avec DOMPurify.",
  },
  {
    id: 'tls-desactive', ref: 'NET-02', gravite: 'bloquant', fichiers: /./,
    re: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=?\s*['"]?0|verify\s*=\s*False\b|InsecureSkipVerify\s*:\s*true|_create_unverified_context/,
    message: "vérification TLS désactivée : n'importe qui sur le réseau peut se faire passer pour le serveur et lire ou modifier les échanges. Corrige le certificat au lieu de couper la vérification.",
  },
  {
    id: 'hachage-faible', ref: 'IAM-07', gravite: 'bloquant', fichiers: CODE_SERVEUR,
    re: /\b(?:md5|sha1)\b[^\n]{0,60}(?:pass|pwd|mdp)|(?:pass|pwd|mdp)[^\n]{0,60}\b(?:md5|sha1)\b/i,
    message: 'mot de passe haché avec md5/sha1 : se casse en masse en quelques heures. Utilise argon2id (ou bcrypt), ou laisse un fournisseur d’auth s’en charger.',
  },
  {
    id: 'aleatoire-faible', ref: 'IAM-08', gravite: 'important', fichiers: JS, sansChaines: true,
    re: /(?:token|secret|password|passwd|otp|nonce|session|apikey|api_key|salt|reset|invite)[^\n]{0,60}Math\.random|Math\.random[^\n]{0,60}(?:token|secret|password|otp|nonce|session|salt)/i,
    message: 'Math.random est prévisible : pas pour un jeton, un code ou un identifiant secret. Utilise crypto.randomUUID() ou crypto.getRandomValues().',
  },
  {
    id: 'jwt-non-verifie', ref: 'IAM-06', gravite: 'important', fichiers: JS,
    re: /\bjwt\.decode\s*\(/,
    message: 'jwt.decode lit le jeton sans vérifier sa signature : n’importe qui peut en fabriquer un. Pour décider d’un accès, utilise jwt.verify (ou jose.jwtVerify) avec l’algorithme imposé.',
  },
  {
    id: 'jwt-none', ref: 'IAM-06', gravite: 'bloquant', fichiers: /./,
    re: /algorithms?['"]?\s*[:=]\s*\[?\s*['"]none['"]|verify_signature['"]?\s*:\s*False/i,
    message: 'jeton accepté sans signature : n’importe qui peut se faire passer pour n’importe qui. Impose un algorithme (HS256, RS256, ES256) et vérifie la signature.',
  },
  {
    id: 'cors-ouvert', ref: 'WEB-06', gravite: 'important', fichiers: /./,
    re: /Access-Control-Allow-Origin['"]?\s*[,:]\s*['"]\*['"]|\borigin\s*:\s*(?:['"]\*['"]|true\b)|allow_origins\s*=\s*\[\s*['"]\*['"]|\bcors\(\s*\)/,
    message: "CORS ouvert à toutes les origines : n'importe quel site peut appeler cette API depuis le navigateur de tes utilisateurs. Liste les origines autorisées (et jamais `*` avec des cookies).",
  },
  {
    id: 'debug-actif', ref: 'WEB-03', gravite: 'important', fichiers: /\.(?:py|env|toml|ya?ml|json)$|^\.env/i,
    re: /^\s*DEBUG\s*=\s*True\b|app\.run\([^)]*debug\s*=\s*True|FLASK_DEBUG\s*=\s*1/,
    message: 'mode debug actif : en production, il affiche le code, la config et parfois une console qui exécute du code. À couper hors du poste de dev.',
  },
  {
    id: 'cookie-lisible', ref: 'WEB-04', gravite: 'important', fichiers: /./,
    re: /httpOnly\s*:\s*false|httponly\s*=\s*False/i,
    message: 'cookie lisible par JavaScript : un XSS suffit à voler la session. Mets HttpOnly, Secure et SameSite=Lax sur les cookies de session.',
  },
  {
    id: 'log-secret', ref: 'SEC-11', gravite: 'important', fichiers: CODE_SERVEUR, sansChaines: true,
    re: /(?:console\.(?:log|info|debug|warn|error)|\bprint|\blogger\.\w+|\blog\.\w+)\s*\([^)]*\b(?:password|passwd|secret|token|apiKey|api_key|authorization|cookie|process\.env|req\.headers|request\.headers)\b/i,
    message: 'un secret ou un en-tête complet part dans les journaux, lisibles par plus de monde que la base. Journalise des champs choisis, masqués.',
  },
  {
    id: 'deserialisation', ref: 'INJ-09', gravite: 'important', fichiers: PY,
    re: /\bpickle\.loads?\(|\byaml\.load\((?![^)]*Safe)|\bmarshal\.loads\(/,
    message: "désérialisation qui peut exécuter du code si les données viennent de l'extérieur. Utilise json, ou yaml.safe_load.",
  },
  {
    id: 'erreur-exposee', ref: 'API-12', gravite: 'conseillé', fichiers: CODE_SERVEUR,
    re: /(?:res\.(?:send|json|status\(\d+\)\.(?:send|json))|Response\.json|NextResponse\.json|c\.json|new\s+Response)\([^)]*\b(?:err|error|e)\.(?:stack|message)\b/,
    message: "le détail de l'erreur est renvoyé au client : il révèle le code, la base ou les chemins. Renvoie un message générique et garde le détail dans les journaux.",
  },
  {
    id: 'catch-vide', ref: 'QUA-01', gravite: 'conseillé', fichiers: CODE_SERVEUR,
    re: /catch\s*(?:\(\s*\w*\s*\))?\s*\{\s*\}|\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(?:\{\s*\}|null|undefined)\s*\)|except(?:\s+[\w.]+(?:\s+as\s+\w+)?)?\s*:\s*pass\b/,
    message: "erreur avalée en silence : le bug devient invisible. Gère-la, journalise-la, ou laisse-la remonter.",
  },
  {
    id: 'http-clair', ref: 'NET-04', gravite: 'conseillé', fichiers: /\.(?:[cm]?[jt]sx?|vue|svelte|astro|py|gs|json|toml|ya?ml|html?)$/i,
    re: /['"`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[\w.-]+\.(?:local|localhost|test|internal)\b|(?:www\.)?w3\.org|schemas?\.|example\.|ns\.adobe\.com|purl\.org)[^'"`\s]+/,
    message: "URL en http:// : les échanges passent en clair. Utilise https://.",
  },
]

const sansChaines = ligne => ligne.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""')

// Les motifs d'un texte, pour un fichier donné.
export function chercherMotifs(texte, chemin) {
  const nom = nomFichier(chemin)
  const trouves = []
  String(texte).split(/\r?\n/).forEach((ligne, i) => {
    if (MARQUE_IGNORER.test(ligne) || ligne.length > 2000 || /^\s*(?:\/\/|#|\*|\/\*)/.test(ligne)) return
    for (const m of MOTIFS) {
      if (!m.fichiers.test(nom) || m.exclure?.test(ligne)) continue
      if (!m.re.test(m.sansChaines ? sansChaines(ligne) : ligne)) continue
      trouves.push({ id: m.id, ref: m.ref, gravite: m.gravite, ligne: i + 1, message: m.message })
    }
  })
  return trouves
}
