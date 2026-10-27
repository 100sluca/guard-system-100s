# 15 · RGPD, cookies, obligations légales (LEG)

Le droit du numérique protège trois publics : les personnes dont tu traites les données (RGPD,
cookies), les clients à qui tu vends (code de la consommation) et les auteurs dont tu utilises le
travail (licences, droit d'auteur). Ce fichier est une **liste de vérification pour ne rien oublier,
pas un avis juridique** : pour un doute réel, la CNIL (cnil.fr), un juriste ou un avocat. Certains
points s'imposent à tout site public, d'autres dépendent de l'activité (vente, données personnelles,
IA, santé), quelques-uns ne concernent que les grosses structures : chaque contrôle le dit. Textes
vérifiés en octobre 2026 ; ils bougent, revérifier sur legifrance.gouv.fr, cnil.fr ou eur-lex.

---

### LEG-01 · Chaque donnée personnelle collectée sert un but précis et repose sur une base légale
`important` · `perso`

**Pourquoi** — Le RGPD (règlement général sur la protection des données, appliqué depuis 2018 dans
toute l'UE) protège toute donnée personnelle, c'est-à-dire toute information liée à une personne
identifiable : un e-mail, une adresse IP, un identifiant de cookie en font partie. Chaque usage doit
avoir un but précis et une base légale. Pour un petit projet, quatre suffisent presque toujours : le
contrat (exécuter une commande, faire marcher un compte), l'obligation légale (factures), le
consentement (newsletter, cookies publicitaires), l'intérêt légitime (sécurité, statistiques
internes). Et la minimisation des données : on ne collecte que le nécessaire. Une donnée jamais
collectée ne peut ni fuir ni être réclamée.
**Vérifier** — Parcourir les formulaires, les colonnes des tables (`users`, `profiles`, `orders`),
les scripts tiers et les journaux. Pour chaque donnée personnelle : à quoi sert-elle, sur quelle
base ? Des champs « au cas où » (date de naissance, téléphone, adresse pour une simple newsletter) ?
**Corriger** — Un petit tableau dans la doc du projet, qui servira aussi au registre (LEG-18) et à la
politique de confidentialité (LEG-04) :
| Donnée | Pour quoi faire | Base légale | Durée (LEG-09) |
|---|---|---|---|
| E-mail | compte, connexion | contrat | durée du compte |
| Adresse postale | livraison | contrat | durée de la relation client |
| Factures | comptabilité | obligation légale | 10 ans |

Supprimer les champs inutiles, rendre facultatif ce qui l'est, remplacer une date de naissance par
une case « j'ai au moins 15 ans » (ou 18) quand seul l'âge compte.
**Piège** — Mettre « consentement » partout. Pour livrer une commande, la base est le contrat : un
consentement doit pouvoir se retirer sans conséquence, ce qui n'a pas de sens pour une livraison. À
l'inverse, l'intérêt légitime ne couvre pas la prospection des particuliers par e-mail (LEG-11).
**Notions** — RGPD, Base légale, Minimisation des données

---

### LEG-02 · Aucun traceur non essentiel n'est déposé avant le choix, et refuser est aussi simple qu'accepter
`important` · `web` · `auto`

**Pourquoi** — Les règles françaises (article 82 de la loi Informatique et Libertés, lignes
directrices et recommandation de la CNIL) imposent un consentement préalable pour tout traceur
(cookie, pixel, stockage local, empreinte du navigateur) qui n'est pas strictement nécessaire :
publicité, boutons de réseaux sociaux, enregistrement de sessions, et la plupart des outils
d'analyse. Tant que le visiteur n'a pas choisi, rien ne doit être déposé ni lu. La CNIL contrôle et
sanctionne régulièrement ces points.
**Vérifier** — `node audit.mjs` signale les scripts de traceurs tiers connus (Google Analytics et
`gtag`, Google Tag Manager, Meta Pixel `fbq`, Hotjar, Microsoft Clarity, TikTok Pixel, LinkedIn
Insight). Puis, à la main : ouvrir le site en navigation privée, F12 → onglets Application (cookies,
stockage local) et Réseau : quelque chose part-il vers un tiers avant tout clic ? La bannière a-t-elle
un « Tout refuser » au même niveau que « Tout accepter » ? Un lien « Gérer les cookies » permet-il de
changer d'avis ? Vidéos YouTube, Google Maps, polices chargées depuis Google, widget de chat :
chargés avant le choix ?
**Corriger** —
- Charger les scripts concernés **après** l'accord, jamais d'office dans le `<head>` :
  ```js
  if (choix.mesureAudience === true) chargerScript('https://www.googletagmanager.com/gtag/js?id=G-XXXX')
  ```
- Bannière : accepter, refuser, personnaliser, avec le même poids visuel ; aucune case précochée ;
  « continuer la navigation » ne vaut pas accord ; le choix, refus compris, est gardé environ 6 mois
  avant de redemander (recommandation de la CNIL).
- Un outil de gestion du consentement (CMP), ou le réglage de confidentialité intégré à Shopify.
  Avec Google Consent Mode, le mode « de base » (aucune balise avant l'accord) est le choix prudent :
  le mode « avancé » envoie des signaux avant le choix et sa conformité est discutée.
- Contenus intégrés (YouTube, Maps) : une image d'attente et un chargement au clic. Polices :
  hébergées sur ton propre serveur.
- Ne pas en faire trop : les traceurs strictement nécessaires (session, panier, connexion,
  mémorisation du choix, langue, équilibrage de charge) sont exemptés. La mesure d'audience l'est
  aussi, sous conditions strictes fixées par la CNIL : pour ton seul compte, statistiques anonymes,
  aucun suivi d'un site à l'autre, aucun recoupement ; la CNIL recommande une durée de vie des
  traceurs d'environ 13 mois et 25 mois au plus pour les données. Matomo, par exemple, peut être
  configuré ainsi ; Google Analytics demande en pratique le consentement. Un site sans aucun traceur
  soumis à consentement n'a pas besoin de bannière : une mention dans la politique suffit.

**Piège** — Une jolie bannière, mais Google Tag Manager charge tout avant le clic. Ou un « Refuser »
caché au deuxième écran.
**Notions** — Cookies et traceurs, Consentement

---

### LEG-03 · Les mentions légales identifient l'éditeur, le directeur de la publication et l'hébergeur
`important` · `web` · `prod`

**Pourquoi** — Tout service en ligne accessible au public doit dire qui l'édite et qui l'héberge :
article 1-1 de la LCEN (loi pour la confiance dans l'économie numérique), créé par la loi n° 2024-449
du 21 mai 2024 dite « SREN » ; il remplace l'ancien article 6, III, que citent encore beaucoup de
modèles. L'absence est sanctionnée pénalement, et c'est la première page que regarde un client
méfiant.
**Vérifier** — Une page « Mentions légales » accessible depuis chaque page (pied de page) et à jour :
adresse, immatriculation, hébergeur actuel.
**Corriger** — Selon le cas :
- **Professionnel**, micro-entrepreneur compris : nom ou dénomination sociale, adresse (ou siège),
  téléphone ; numéro d'immatriculation au RCS ou au répertoire des métiers si tu y es inscrit ;
  capital pour une société ; nom du directeur de la publication ; hébergeur : nom, adresse,
  téléphone (sur sa page légale). Si tu vends en ligne, ajouter une adresse e-mail et le numéro de
  TVA intracommunautaire s'il existe (LCEN, article 19).
- **Particulier non professionnel** (blog, projet perso) : il peut rester anonyme et ne publier que le
  nom et l'adresse de l'hébergeur, à condition de lui avoir donné son identité.
- Plusieurs prestataires (Vercel pour le site, Supabase pour les données) : la loi vise aussi, le cas
  échéant, ceux qui stockent les données du service ; les citer tous est le plus simple.

**Piège** — Publier son adresse personnelle faute d'y avoir pensé : une adresse de domiciliation
d'entreprise évite d'afficher son domicile.
**Notions** — Mentions légales

---

### LEG-04 · Une politique de confidentialité claire dit ce qui est vraiment fait des données
`important` · `perso` · `web`

**Pourquoi** — Le RGPD (articles 13 et 14) impose d'informer les personnes au moment de la collecte :
qui traite leurs données, pourquoi, sur quelle base, avec qui, combien de temps, et comment exercer
leurs droits. Une politique copiée d'un autre site, qui promet ce que tu ne fais pas ou oublie tes
fournisseurs d'IA, est pire qu'inutile : c'est une information fausse.
**Vérifier** — Page « Confidentialité » accessible depuis le pied de page et depuis chaque
formulaire. Colle-t-elle au tableau de LEG-01 et à la liste des sous-traitants (LEG-08) ?
**Corriger** — En langage simple, dans cet ordre : qui tu es et comment te joindre ; quelles données,
pour quoi faire, sur quelle base ; destinataires et sous-traitants (hébergeur, base de données,
paiement, e-mail, IA, statistiques) ; transferts hors UE et leur encadrement (LEG-12) ; durées de
conservation ; droits et adresse pour les exercer ; droit de réclamation auprès de la CNIL ; cookies
(ou lien vers une page dédiée). Sous chaque formulaire, deux lignes : « Votre e-mail sert à… En
savoir plus ».
**Piège** — L'écrire au lancement et ne plus y toucher. Chaque nouveau service (outil d'analyse,
fournisseur d'IA) y entre le jour où il entre dans le code.
**Notions** — Politique de confidentialité, Sous-traitant, Droits des personnes

---

### LEG-05 · Une boutique en ligne affiche ses CGV et toutes les informations obligatoires avant la commande
`bloquant` · `paiement` · `web`

**Pourquoi** — Vendre à distance à des particuliers est très encadré par le code de la consommation.
Une information manque ? Sanction possible de la DGCCRF, contrat contestable, et si le droit de
rétractation n'a pas été annoncé, son délai est prolongé de 12 mois (LEG-06).
**Vérifier** — Pages CGV, fiches produits, panier, tunnel de commande, e-mail de confirmation, et
réglages de la plateforme (Shopify : pages de politiques, paiement).
**Corriger** — Avant la commande, visibles et à jour :
- Les CGV (conditions générales de vente), acceptées au moment de commander.
- Caractéristiques essentielles, prix TTC, frais de livraison, date ou délai de livraison (à défaut,
  30 jours au plus), moyens de paiement.
- Garanties légales : conformité (2 ans pour un bien neuf) et vices cachés.
- Droit de rétractation, ses conditions et le formulaire type (LEG-06).
- Tes coordonnées complètes, et celles du médiateur de la consommation auquel tu adhères : tout
  vendeur aux particuliers doit en proposer un, gratuit pour le client. Le lien vers la plateforme
  européenne de règlement en ligne des litiges n'est plus requis : elle a fermé le 20 juillet 2025.
- Bouton final « Commande avec obligation de paiement », ou une formule aussi claire.
- Après la commande : une confirmation sur support durable (e-mail) qui reprend ces informations.

**Piège** — En dropshipping, le vendeur répond seul de la livraison et de la conformité, même si le
fournisseur est à l'autre bout du monde. Un délai réaliste (« 8 à 15 jours ») vaut mieux qu'un « 48 h »
faux, et les CGV fournies par un thème ou écrites pour un autre pays sont à réécrire.
**Notions** — CGV, Droit de rétractation, Médiateur de la consommation

---

### LEG-06 · Le droit de rétractation de 14 jours est annoncé, respecté, et exerçable en ligne
`bloquant` · `paiement`

**Pourquoi** — Le droit de rétractation permet au particulier qui achète à distance de changer d'avis
sans motif pendant 14 jours : à compter de la réception pour un bien, de la conclusion du contrat
pour un service. Le vendeur rembourse dans les 14 jours suivant la rétractation, frais de livraison
standard compris (il peut attendre le retour du bien ou la preuve de son expédition). Depuis le
19 juin 2026, les contrats conclus via une interface en ligne doivent aussi offrir une
« fonctionnalité de rétractation » en ligne (ordonnance n° 2026-2 du 5 janvier 2026, article L221-21
du code de la consommation).
**Vérifier** — CGV et fiches produits annoncent-elles le délai, la marche à suivre, qui paie le
retour ? Le formulaire type est-il fourni ? Existe-t-il, sur le site ou dans l'espace client, un
moyen visible de se rétracter en ligne ? Les produits exclus le sont-ils à bon droit ?
**Corriger** —
- Annoncer le délai, la marche à suivre, le formulaire type, et qui paie le retour (le client
  seulement s'il en a été informé avant).
- Fonctionnalité de rétractation : un intitulé sans ambiguïté (du type « renoncer au contrat ici »),
  accessible pendant tout le délai, une étape de confirmation, puis un accusé de réception envoyé
  sans délai sur support durable. Modalités précisées par décret : les lire sur legifrance, et
  vérifier ce que ta plateforme (Shopify, WooCommerce…) propose déjà.
- Exceptions réelles (article L221-28) : bien fait sur mesure ou nettement personnalisé, denrée
  périssable, produit d'hygiène descellé, contenu numérique fourni tout de suite avec l'accord exprès
  du client et sa renonciation, service entièrement exécuté avec son accord avant la fin du délai…

**Piège** — « Articles soldés ni repris ni échangés » : en vente à distance, c'est illégal. Les
exceptions sont une liste fermée, pas un choix du vendeur.
**Notions** — Droit de rétractation, CGV

---

### LEG-07 · Promotions, avis clients et urgence affichés sont honnêtes
`important` · `paiement` · `web`

**Pourquoi** — Prix barrés, avis et comptes à rebours sont parmi les points les plus contrôlés par
la DGCCRF, et les plus faciles à fausser avec une appli de boutique. Une annonce mensongère est une
pratique commerciale trompeuse, lourdement sanctionnée.
**Vérifier** — Prix barrés, « -40 % », avis affichés, badges « plus que 3 en stock », minuteurs :
d'où viennent les chiffres ?
**Corriger** —
- Annonce de réduction : le prix de référence affiché est le plus bas pratiqué dans les 30 jours
  précédant la promotion (article L112-1-1 du code de la consommation) ; en cas de baisses
  successives, c'est le prix d'avant la première baisse. Garder l'historique des prix pour le
  prouver.
- Avis clients : dire s'ils sont vérifiés et comment (article L111-7-2) ; jamais de faux avis, ni
  d'avis négatifs écartés sans règle annoncée.
- Stock et urgence : un « plus que 2 » ou un minuteur reflètent la réalité ; une rareté inventée est
  une pratique trompeuse.

**Notions** — Prix de référence, CGV

---

### LEG-08 · Chaque sous-traitant est listé, avec son DPA et le lieu où il stocke les données
`important` · `perso`

**Pourquoi** — Toi (ou ta société) es le responsable de traitement : tu décides pourquoi et comment
les données sont traitées. Chaque service qui les traite pour ton compte est un sous-traitant :
hébergeur, base de données, e-mail, paiement, IA, statistiques, support. Le RGPD (article 28) exige
un contrat avec chacun, le DPA (Data Processing Agreement, accord de traitement des données), et de
savoir où vont les données.
**Vérifier** — Dresser la liste à partir du code et des factures (`package.json`, variables
d'environnement, `RESSOURCES.md`) : pour chacun, DPA accepté ou signé ? Région de stockage ? Garantie
pour les transferts (LEG-12) ?
**Corriger** — Un tableau tenu à jour, repris dans la politique de confidentialité :
| Service | Rôle | Données | Lieu de stockage | DPA |
|---|---|---|---|---|
| Supabase | base, connexion | comptes, contenus | région choisie à la création du projet | page légale de Supabase |
| Vercel | hébergement | journaux, IP | fonctions aux États-Unis par défaut (`iad1`) | conditions de Vercel |
| Fournisseur d'IA | génération | prompts | souvent États-Unis | conditions commerciales |

Le DPA est souvent intégré aux conditions commerciales (accepté en créant le compte) ou à signer en
ligne : en garder une copie datée. Rapprocher les données quand c'est simple : région UE pour un
nouveau projet Supabase (elle ne se change pas ensuite), `"regions": ["cdg1"]` (Paris) dans
`vercel.json`.
**Piège** — Stripe ou Shopify, par exemple, se présentent comme responsables de traitement pour
certaines opérations (lutte contre la fraude, obligations financières) : le vérifier dans leurs
conditions et le refléter dans la politique, plutôt que de les ranger parmi les simples
sous-traitants.
**Notions** — Sous-traitant, DPA, Responsable de traitement

---

### LEG-09 · Chaque donnée a une durée de conservation, et la purge a vraiment lieu
`important` · `perso` · `bdd`

**Pourquoi** — Garder les données « au cas où » est contraire au RGPD : chaque donnée a une durée
liée à son but, après quoi on la supprime ou on l'anonymise. Une durée écrite dans la politique sans
tâche qui l'applique ne vaut rien : les vieux comptes inactifs sont exactement ce qui fuit lors
d'une attaque.
**Vérifier** — Pour chaque table de données personnelles : quelle durée ? Une tâche planifiée purge-
t-elle (cron, `pg_cron`, Worker planifié) ? Quand a-t-elle tourné ? Les journaux et les exports qui
traînent dans un bucket sont-ils couverts ?
**Corriger** — Fixer des durées, puis les appliquer automatiquement. Repères courants, à adapter et à
vérifier dans les référentiels de la CNIL : prospects, 3 ans après le dernier contact venant d'eux ;
factures et pièces comptables, 10 ans (code de commerce) ; comptes inactifs, une durée choisie et
annoncée, avec un e-mail de prévenance avant suppression ; journaux techniques, courte durée.
```sql
-- Supabase : purge quotidienne avec pg_cron
select cron.schedule('purge-prospects', '0 3 * * *',
  $$ delete from prospects where dernier_contact < now() - interval '3 years' $$);
```
Pour garder des statistiques, anonymiser (agrégats) plutôt que conserver les lignes. Les sauvegardes
s'effacent au fil de leur rotation (REP).
**Notions** — Durée de conservation, Minimisation des données

---

### LEG-10 · Les droits des personnes s'exercent pour de vrai : export, correction, suppression complète
`important` · `perso` · `comptes`

**Pourquoi** — Toute personne peut demander l'accès à ses données, leur rectification, leur
effacement, leur portabilité (les récupérer dans un format réutilisable), et s'opposer à certains
usages (toujours à la prospection). Réponse dans un délai d'un mois, gratuitement. Une suppression de
compte qui coche seulement `deleted = true`, ou qui oublie la liste e-mail et le client Stripe, n'est
pas une suppression.
**Vérifier** — Comment une personne fait-elle sa demande (adresse dédiée, bouton dans le compte) ?
« Supprimer mon compte » efface-t-il les lignes en base (clés étrangères en `on delete cascade`), les
fichiers du stockage, les vecteurs du RAG (IA-08), le contact dans l'outil d'e-mailing, le client
chez Stripe, la personne dans l'outil d'analyse ?
**Corriger** — Dans le compte : « Exporter mes données » (JSON ou CSV de ce que la personne a fourni)
et « Supprimer mon compte », qui appelle une fonction serveur :
```ts
// côté serveur uniquement (clé service_role)
await supprimerFichiersStorage(userId)   // les fichiers d'abord : ils ne suivent pas la cascade
await retirerDeLaListeEmail(email)
await supabaseAdmin.auth.admin.deleteUser(userId)   // on delete cascade nettoie les tables liées
```
Ne garder que ce qu'une obligation légale impose (factures), et le dire dans la réponse. Noter chaque
demande et sa date de traitement.
**Piège** — Exiger une pièce d'identité pour un compte connu par son seul e-mail. Une confirmation
envoyée depuis l'adresse du compte suffit le plus souvent.
**Notions** — Droits des personnes, Sous-traitant

---

### LEG-11 · La prospection par e-mail a le consentement qu'il faut et une désinscription qui marche
`important` · `perso`

**Pourquoi** — Envoyer de la publicité par e-mail ou SMS à un particulier exige son accord préalable
(article L34-5 du code des postes et des communications électroniques). Exception : un client
existant, pour des produits ou services analogues, s'il a été informé et a pu refuser dès la
collecte. Entre professionnels, l'envoi sans accord préalable est possible si le message concerne le
métier de la personne et qu'elle peut s'y opposer simplement. Dans tous les cas : identité de
l'expéditeur et désinscription simple.
**Vérifier** — Formulaires d'inscription : case non précochée, texte clair ? Preuve du consentement
gardée (date, source, texte affiché) ? Chaque envoi a-t-il un lien de désinscription qui marche
vraiment ? D'où viennent les adresses ?
**Corriger** — Case non précochée, séparée de l'acceptation des CGV ; enregistrer `consenti_le`,
`source`, `version_du_texte`. Désinscription en un clic dans chaque e-mail, avec les en-têtes que
Gmail et Yahoo exigent des expéditeurs en volume depuis 2024 :
```text
List-Unsubscribe: <https://exemple.fr/desinscription?jeton=…>, <mailto:stop@exemple.fr>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```
La plupart des outils d'e-mailing les ajoutent à leurs campagnes : le vérifier. SPF, DKIM et DMARC :
NET.
**Piège** — Acheter ou aspirer une liste d'adresses : aucun consentement valable, et une réputation
d'expéditeur détruite. Autre erreur : une désinscription marketing qui bloque aussi les e-mails
transactionnels (confirmation de commande, mot de passe) ; ce ne sont pas de la prospection.
**Notions** — Prospection par e-mail, Consentement

---

### LEG-12 · Les transferts de données hors de l'UE sont identifiés et encadrés
`important` · `perso`

**Pourquoi** — Faire traiter des données personnelles hors de l'Espace économique européen (l'UE
plus l'Islande, le Liechtenstein et la Norvège) n'est permis qu'avec une garantie : pays jugé
« adéquat » par la Commission européenne, ou contrat type. Vercel, OpenAI, Anthropic, Google,
Stripe : beaucoup de tes outils sont américains.
**Vérifier** — Pour chaque sous-traitant (LEG-08) : où vont les données, et quelle garantie
s'applique ? Le fournisseur américain est-il certifié au Data Privacy Framework (liste publique sur
dataprivacyframework.gov) ? Son DPA contient-il les clauses contractuelles types ?
**Corriger** — Pour les États-Unis, le Data Privacy Framework (décision d'adéquation de juillet 2023)
est en vigueur en octobre 2026. Le Tribunal de l'Union européenne a rejeté un recours en annulation
le 3 septembre 2025, mais un pourvoi est pendant devant la Cour de justice (affaire C-703/25 P) : il
peut tomber, comme ses deux prédécesseurs. Donc : vérifier la certification du fournisseur, s'assurer
que son DPA prévoit aussi les clauses contractuelles types (CCT) en secours, revérifier le statut sur
cnil.fr de temps en temps. Si un transfert ne repose que sur les CCT, le RGPD demande d'évaluer le
droit du pays de destination : un fournisseur certifié ou européen évite ce travail.
**Piège** — Croire qu'une région « UE » règle tout. Un fournisseur américain hébergé en Europe peut
encore accéder aux données depuis les États-Unis (support, sous-traitants ultérieurs) : c'est son
DPA qui le dit, c'est lui qu'il faut lire.
**Notions** — Transferts hors UE, Data Privacy Framework, Clauses contractuelles types

---

### LEG-13 · Une violation de données a sa procédure : CNIL sous 72 heures, personnes prévenues si le risque est élevé
`important` · `perso` · `prod`

**Pourquoi** — Une violation de données, c'est toute perte de confidentialité, d'intégrité ou de
disponibilité de données personnelles : table Supabase lisible sans RLS, clé `service_role` publiée,
e-mail groupé envoyé avec tous les destinataires visibles, ordinateur volé, base effacée sans
sauvegarde. Le RGPD (articles 33 et 34) impose de la notifier à la CNIL dans les 72 heures après en
avoir pris connaissance, sauf si elle ne présente pas de risque pour les personnes, et de prévenir
les personnes elles-mêmes si le risque est élevé.
**Vérifier** — Existe-t-il une page de procédure (qui décide, comment évaluer, où notifier) et un
registre interne des violations ? Saurait-on dire quelles personnes et quelles données sont touchées
(journaux : OBS) ?
**Corriger** — Une procédure d'une page : contenir (révoquer les clés, fermer l'accès : SEC-06) ;
évaluer (quelles données, combien de personnes, quel risque) ; notifier via le téléservice de la
CNIL si nécessaire (une notification incomplète peut être complétée ensuite) ; prévenir les personnes
en termes simples (ce qui s'est passé, les risques, ce qu'elles peuvent faire) ; inscrire **toute**
violation au registre interne, même non notifiée.
**Notions** — Violation de données, Production Incidents

---

### LEG-14 · Les licences du code, des polices, des images, des musiques et des contenus générés sont respectées
`important` · `tout`

**Pourquoi** — Tout ce que tu n'as pas créé appartient à quelqu'un. Une licence logicielle dit ce
qu'on a le droit d'en faire : certaines laissent tout faire, d'autres imposent de publier ton propre
code. Un dépôt GitHub sans licence n'est pas libre : il est « tous droits réservés ». Pour une vidéo
monétisée, une musique ou une image mal licenciée, c'est une réclamation, une démonétisation ou une
mise en demeure.
**Vérifier** — Dépendances : `npx license-checker --summary` (Node), `pip-licenses` (Python). Code
repris ou inspiré : sa licence (la fiche `FABRICATION.md` du mode recap les recense). Polices,
icônes, images, musiques, sons : d'où viennent-ils, sous quelle licence ? Contenus générés par IA :
conditions du fournisseur pour l'usage commercial.
**Corriger** —
| Licence | Permet | Impose |
|---|---|---|
| MIT, BSD, ISC | tout, y compris l'usage commercial | garder la notice de copyright |
| Apache-2.0 | idem, avec une licence de brevets | garder la notice et le fichier `NOTICE`, signaler les modifications |
| GPL | utiliser, modifier | si tu **distribues** (app, binaire, plugin), l'œuvre dérivée passe sous GPL, sources fournies |
| AGPL | idem | même chose dès que des utilisateurs s'en servent **en ligne** (service web) |
| Aucune licence | rien | demander l'autorisation à l'auteur |

Contenus : Creative Commons BY (citer l'auteur), NC (pas d'usage commercial ; par prudence, une
vidéo monétisée est commerciale) ; polices sous licence OFL utilisables partout, polices commerciales
selon l'usage acheté (web, appli, vidéo) ; musique avec une licence qui couvre la plateforme et la
monétisation. Images générées : pas de personnages, marques ou œuvres protégés reproduits ; visage ou
voix d'une personne réelle seulement avec son accord (droit à l'image). Site de veille : courtes
citations avec la source et l'auteur, liens plutôt que reprise d'articles ou d'images entiers ; la
fouille automatique de textes (scraping pour analyse) est permise sauf opposition du titulaire
exprimée de façon lisible par machine (article L122-5-3 du code de la propriété intellectuelle) :
respecter ces oppositions.
**Piège** — « Libre de droits » ne veut pas dire sans conditions, et « trouvé sur Google Images » ne
veut rien dire. Publier ton propre code sans fichier `LICENSE` empêche légalement les autres de
l'utiliser.
**Notions** — Licences logicielles, Copyleft, Droits d'auteur

---

### LEG-15 · Le site est accessible, et on sait si l'European Accessibility Act s'applique
`important` · `web`

**Pourquoi** — L'accessibilité numérique, c'est permettre à tous d'utiliser le site : personnes
aveugles avec un lecteur d'écran, navigation au clavier seul, daltonisme, troubles cognitifs. Depuis
le 28 juin 2025, l'European Accessibility Act (directive (UE) 2019/882, transposée en France par la
loi n° 2023-171 du 9 mars 2023 et le décret n° 2023-931 du 9 octobre 2023) impose des exigences
d'accessibilité à de nombreux services privés, dont le commerce électronique, la banque, les livres
numériques et le transport.
**Vérifier** — Es-tu concerné ? La directive exempte les microentreprises qui fournissent des
services : moins de 10 personnes **et** chiffre d'affaires annuel ou total du bilan de 2 M€ au plus
(vérifier la transposition française sur legifrance). Une boutique au-delà, ou une activité qui
grandit, est concernée. Ensuite : un test rapide (Lighthouse ou axe dans le navigateur), la
navigation au clavier de bout en bout (menu, panier, paiement), les textes alternatifs des images,
les contrastes, les étiquettes des champs.
**Corriger** — Le référentiel français est le RGAA (référentiel général d'amélioration de
l'accessibilité), version 4.1.2, fondé sur les WCAG 2.1 ; une version 5 est en préparation. La
technique (contrastes, focus, ARIA, composants) est détaillée dans PERF. Les textes demandent aussi
d'informer sur l'accessibilité du service, par exemple dans les CGV ou une page dédiée. Sur Shopify,
choisir un thème réputé accessible et tester les applis ajoutées.
**Piège** — Les « widgets d'accessibilité » collés en une ligne de script ne rendent pas un site
conforme et gênent souvent les personnes qui ont déjà leurs propres outils. Même exempté, prévoir
l'accessibilité dès le départ coûte peu ; la rattraper coûte cher. Les grandes entreprises (plus de
250 M€ de chiffre d'affaires en France) ont en plus leurs propres obligations (déclaration
d'accessibilité, schéma pluriannuel).
**Notions** — Accessibilité numérique, European Accessibility Act, RGAA

---

### LEG-16 · AI Act : on sait qu'on parle à une IA, et ce qui est généré est signalé
`important` · `ia`

**Pourquoi** — L'AI Act (règlement (UE) 2024/1689) encadre l'IA selon son niveau de risque. Pour la
plupart des projets, ce qui compte est la transparence (article 50), applicable depuis le
2 août 2026 :
- une personne doit savoir qu'elle échange avec une IA, sauf si c'est évident ;
- les contenus générés (texte, image, son, vidéo) doivent être marqués de façon lisible par machine
  (métadonnées, filigrane) par le fournisseur du système ; si tu mets en ligne sous ton nom un
  assistant construit sur une API d'IA, tu es en principe ce fournisseur ;
- qui publie un hypertrucage (deepfake : image, son ou vidéo réaliste d'une personne, d'un lieu ou
  d'un événement) doit dire qu'il est artificiel ; de même pour un texte généré publié pour informer
  le public sur un sujet d'intérêt général, sauf relecture humaine sous responsabilité éditoriale.

Le règlement « omnibus numérique » sur l'IA (règlement (UE) 2026/1744, en vigueur depuis le
27 juillet 2026) a reporté les règles « haut risque » (au 2 décembre 2027 et au 2 août 2028), pas
l'article 50 ; selon les synthèses disponibles, seul le marquage lisible par machine des systèmes
déjà sur le marché avant le 2 août 2026 a un délai jusqu'au 2 décembre 2026. Vérifier le texte sur
eur-lex et les lignes directrices de la Commission.
**Vérifier** — Chatbot ou assistant sur le site : est-il présenté comme une IA ? Images, voix ou
vidéos générées publiées (site, réseaux, vidéos) : signalées ? Les métadonnées d'origine des images
générées survivent-elles à ton traitement (redimensionnement, compression) ?
**Corriger** — « Assistant IA » dans le titre de la fenêtre de chat et une phrase au premier
message ; « Image générée par IA » ou « Voix de synthèse » près du contenu ; ne pas retirer les
métadonnées ou filigranes posés par le fournisseur. Sur les plateformes vidéo, utiliser aussi leur
déclaration de contenu synthétique réaliste. En France, la loi « influenceurs » (loi n° 2023-451 du
9 juin 2023) impose déjà la mention « Image virtuelle » sur les visuels générés par IA dans un
contenu d'influence commerciale, en plus de « Publicité » ou « Collaboration commerciale ».
**Piège** — Utiliser l'IA pour trier des candidatures, noter des élèves, accorder un crédit ou
évaluer des personnes : ce sont des usages « haut risque », aux obligations lourdes. Si tu touches à
ça, prends conseil.
**Notions** — AI Act, Hypertrucage

---

### LEG-17 · Un service avec comptes, contenus d'utilisateurs ou API publique a des CGU
`conseillé` · `comptes`

**Pourquoi** — Les CGU (conditions générales d'utilisation) fixent les règles du service : ce qu'il
fait, ce qui est interdit, ce que tu peux faire d'un compte qui abuse, à qui appartiennent les
contenus publiés. Elles ne sont pas toujours obligatoires, mais sans elles tu n'as aucune base pour
suspendre un abus. Si des utilisateurs publient des contenus (commentaires, avis, annonces,
fichiers), le règlement européen sur les services numériques (DSA) impose aussi, même aux petits
hébergeurs, un moyen de signaler un contenu illicite, un point de contact et des règles de
modération décrites.
**Vérifier** — Les CGU existent-elles, sont-elles acceptées à l'inscription, décrivent-elles le
service réel ? Un bouton ou une adresse permet-il de signaler un contenu ? Pour une API ou un serveur
MCP public : limites d'usage et absence de garantie annoncées ?
**Corriger** — Des CGU courtes et propres au service : objet, ouverture et fermeture de compte,
usages interdits, contenus des utilisateurs (qui en est propriétaire, quel droit d'usage ils te
donnent), modération et signalement, limites de responsabilité (sans clause abusive envers un
consommateur), modification des conditions, droit applicable. Pour une API : quotas, usage loyal,
droit de couper un client abusif (API).
**Piège** — Copier les CGU d'un autre site : elles décrivent un autre service, et leur texte est
souvent protégé par le droit d'auteur.
**Notions** — CGU, DSA

---

### LEG-18 · Un registre des traitements existe, même simplifié
`conseillé` · `perso`

**Pourquoi** — Le registre des traitements (article 30 du RGPD) recense chaque usage de données
personnelles : but, catégories de données et de personnes, destinataires, durées, transferts,
mesures de sécurité. C'est le premier document demandé lors d'un contrôle. Le RGPD prévoit une
dérogation sous 250 salariés, mais pas pour les traitements réguliers (clients, comptes, prospects) :
en pratique, presque tout le monde en tient un.
**Vérifier** — Existe-t-il, même sous forme de tableur ? Est-il à jour des derniers ajouts (nouvel
outil, fonction d'IA) ?
**Corriger** — Partir du modèle simplifié de la CNIL et du tableau de LEG-01 : une ligne par
traitement (clients, newsletter, comptes, support, statistiques, assistant IA). Le relire à chaque
nouveau service ajouté au code.
**Piège** — Croire qu'il faut tout de suite un délégué à la protection des données (DPO) et des
analyses d'impact (AIPD). Ils ne s'imposent que dans certains cas (organisme public, suivi
systématique à grande échelle, données sensibles en volume, traitement à risque élevé) ; pour une
petite boutique ou un petit SaaS, un registre à jour est le bon niveau.
**Notions** — Registre des traitements

---

### LEG-19 · Alerte : données de santé — si tu touches à ça, prends conseil
`bloquant` · `perso`

**Pourquoi** — Les données de santé font partie des données sensibles (article 9 du RGPD), avec les
opinions, la religion, l'orientation sexuelle, la biométrie ou la génétique : leur traitement est
interdit sauf exceptions, comme le consentement explicite. En France, héberger pour le compte
d'autrui des données de santé recueillies lors d'activités de prévention, de diagnostic, de soin ou
de suivi médico-social exige un hébergeur certifié HDS (hébergeur de données de santé, article
L1111-8 du code de la santé publique).
**Vérifier** — Le projet recueille-t-il des symptômes, traitements, mesures (poids, glycémie, cycle),
comptes rendus, ou sert-il des professionnels de santé ? Où ces données sont-elles hébergées ?
**Corriger** — Avant la première ligne de code : vérifier que l'hébergeur figure dans la liste des
hébergeurs certifiés HDS publiée par l'Agence du numérique en santé (esante.gouv.fr) ; prévoir une
analyse d'impact (AIPD), un consentement explicite et un chiffrement sérieux (NET) ; prendre conseil
(CNIL, juriste spécialisé). Les offres standard de nombreuses plateformes ne sont pas certifiées.
**Notions** — Données sensibles, HDS, Consentement

---

### LEG-20 · Alerte : utilisateurs mineurs — si ton service les vise ou les attire, prends conseil
`important` · `perso`

**Pourquoi** — Les mineurs ont une protection renforcée. En France, un mineur peut consentir seul au
traitement de ses données par un service en ligne à partir de 15 ans ; en dessous, il faut son accord
et celui d'un titulaire de l'autorité parentale (article 45 de la loi Informatique et Libertés). Les
plateformes en ligne n'ont pas le droit de leur présenter de publicité fondée sur le profilage (DSA,
article 28).
**Vérifier** — Le public visé (jeux, école, création de contenu, réseaux) peut-il inclure des moins de
15 ans ? Le service pose-t-il la question, et que se passe-t-il si la réponse est oui ?
**Corriger** — Information écrite pour être comprise par un enfant, pas de publicité ciblée ni de
profilage, données minimales, réglages protecteurs par défaut ; recueil de l'accord parental si les
moins de 15 ans sont acceptés. Les règles bougent (vérification de l'âge, réseaux sociaux) : prends
conseil avant de lancer.
**Notions** — Consentement des mineurs, Consentement
