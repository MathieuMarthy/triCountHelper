# SplitTicket

Application web progressive pour photographier un ticket de caisse, en extraire
les lignes, attribuer chaque ligne à une ou plusieurs personnes, et obtenir ce
que chacun doit.

Pas de compte, pas de backend, pas de synchronisation. Les données vivent dans
le navigateur de l'appareil. **Deux exceptions, toutes deux explicites** : la
photo envoyée à Google au moment de la lecture d'un ticket, et le récapitulatif
transmis à Tricount si vous activez cet envoi.

## Démarrer

```bash
npm install
npm run dev
```

Renseignez ensuite une clé API Gemini dans les réglages. Sans clé, tout le
reste fonctionne : la saisie manuelle, le calcul, l'export.

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | build de production dans `dist/` |
| `npm run preview` | sert `dist/` avec le service worker actif |
| `npm test` | suite de tests (Vitest) |
| `npm run typecheck` | vérification TypeScript |

`dist/` pèse moins de 300 Ko : c'est un ensemble de fichiers statiques : Netlify, GitHub Pages,
n'importe quel hébergement fera l'affaire. Pour un déploiement sous un
sous-chemin (GitHub Pages), renseignez `base` dans `vite.config.ts`.

## Docker

L'image construit l'application avec Node puis la sert avec nginx ; l'image
finale (~49 Mo) ne contient ni Node ni les dépendances de compilation.

```bash
docker build -t splitticket .
docker run -d -p 8080:80 splitticket
```

Deux arguments de build, tous deux facultatifs :

| `--build-arg` | Effet |
|---|---|
| `VITE_TRICOUNT_ENABLED` | `true` fait apparaître l'intégration Tricount. Défaut : `false`. |
| `VITE_TRICOUNT_RELAY_URL` | Adresse du relais livrée par défaut. Vide : `/api/tricount`. |

```bash
docker build -t splitticket \
  --build-arg VITE_TRICOUNT_ENABLED=true \
  --build-arg VITE_TRICOUNT_RELAY_URL=https://relais.exemple.net/api/tricount .
```

Ces valeurs sont figées dans le bundle, donc lisibles par quiconque ouvre
l'application : **aucun secret ne passe par là**. Le jeton du relais se saisit
dans les réglages, sur chaque appareil.

`docker/nginx.conf` sert l'application à la racine : cache immuable pour les
fichiers hachés de `/assets/`, `no-cache` pour `index.html`, `sw.js` et le
manifeste — les trois qui commandent les mises à jour —, et toute route inconnue
rend `index.html`. Le conteneur écoute en HTTP : c'est au reverse proxy qui le
précède de terminer le TLS, sans quoi ni l'installation ni le service worker ne
fonctionneront.

## Le parcours

```
Accueil ─→ Capture ─→ Traitement ─→ Vérification ─→ Attribution ─→ Résultats
   ↑                                                                    │
   └────────────────────────────────────────────────────────────────────┘
```

Chaque étape est sauvegardée : fermer l'application et la rouvrir reprend là où
l'on s'était arrêté. Un mode de **saisie entièrement manuelle** est accessible
depuis l'accueil ; il sert plus souvent qu'on ne le croit, et permet de tester
toute la chaîne sans dépendre du modèle.

**Hors ligne**, seule la lecture d'une photo est indisponible. L'application
s'installe, s'ouvre et fonctionne : saisie, correction, attribution, calcul,
export — tout cela ne demande jamais le réseau.

## L'argent

Tous les montants sont des **entiers de cents**. Aucun flottant ne représente
jamais un montant, nulle part. Devise : dollar canadien.

La répartition d'une ligne entre plusieurs personnes passe par la **méthode du
plus fort reste** (`src/lib/split.ts`) : chacun reçoit la partie entière de sa
quote-part, puis les centimes restants vont aux plus grandes parties décimales,
départagées par l'ordre des participants — jamais au hasard, sinon les résultats
changeraient à chaque recalcul.

L'invariant, testé sur des tickets générés aléatoirement : **la somme des
montants dus est toujours exactement égale au total réparti**.

### Les taxes ne sont pas décoratives

C'est la différence structurelle avec un ticket français, et elle traverse tout
le moteur. En France les prix affichés sont TTC : répartir la TVA « au prorata »
y est une identité arithmétique, sans effet sur ce que chacun doit.

**Au Canada les prix des lignes sont hors taxes.** TPS, TVQ, TVH s'ajoutent en
pied de ticket, et deviennent donc de l'argent réellement dû, qui entre dans le
calcul.

Surtout, **la base taxable n'est pas le sous-total de chacun** : les aliments de
base sont détaxés. Chaque taxe se répartit donc sur *sa propre* base — la somme
des lignes attribuées qui y sont soumises. Celui qui n'a acheté que du pain et
du lait ne paie pas la taxe de celui qui a pris de la bière et du savon.

Une ligne porte `taxCodes` : `null` pour « toutes les taxes du ticket », `[]`
pour une ligne détaxée, ou la liste des codes concernés quand une taxe ne
s'applique pas (un livre au Québec : TPS oui, TVQ remboursée à la caisse). Le
modèle propose, une case à cocher par ligne corrige.

**Le montant imprimé de chaque taxe fait foi.** L'application ne le recalcule
jamais à partir du taux : les arrondis d'une caisse ne se devinent pas, et le
ticket est la source de vérité. Le taux n'est conservé qu'à titre indicatif.

### Le pourboire

Il n'est jamais imprimé sur le ticket : il n'entre donc pas dans le contrôle
« sous-total + taxes = total imprimé », mais bien dans le total réparti.

Il se règle sur l'écran de résultats — c'est là qu'on décide vraiment, à
table : boutons de pourcentage, montant libre, et le choix de la base. Par
défaut **sur le sous-total avant taxes**, l'usage le plus défendable ; le
calcul taxes comprises reste disponible ticket par ticket.

Il se répartit au prorata de ce que chacun a consommé, par la même méthode du
plus fort reste.

### L'invariant

> Σ montants dus === sous-total attribué + taxes réparties + ajustements + pourboire

Testé sur cinquante tickets générés aléatoirement, avec des bases taxables
mélangées (un tiers de lignes détaxées, un sixième soumises à la seule TPS),
des remises et des pourboires.

## La lecture des tickets

Un modèle vision (Gemini) lit la photo et rend directement du JSON structuré :
libellés, quantités, prix hors taxes, articles taxables ou non, lignes de taxes
du pied de ticket, commerçant, date, sous-total et total. Il lit
la mise en page au lieu de la deviner — il sait que `TOTAL` n'est pas un
article, que `2 x 1,50` est une quantité — et il encaisse l'inclinaison et
l'éclairage inégal sans prétraitement d'image.

```
src/capture/image.ts       recadrage, rotation, compression de la photo
src/extraction/gemini.ts   appel du modèle, schéma de sortie, erreurs
src/extraction/normalize.ts validation de la réponse  ← tout passe par ici
src/extraction/types.ts    le contrat que l'aval consomme
```

### Deux précautions qui ne sont pas négociables

**Les montants sont demandés en chaînes, pas en nombres.** Le modèle rend
`"12,90"`, exactement comme imprimé sur le ticket, et c'est
`parseAmountToCents` qui décide. Aucun flottant venu du modèle ne touche jamais
un montant.

**Rien n'entre sans passer par `normalize.ts`.** Une sortie de modèle de langue
est plausible par construction, donc jamais digne de confiance a priori : une
ligne sans montant lisible est écartée plutôt que ramenée à zéro, une quantité
aberrante retombe à 1, une date inventée devient `null`, une taxe sans montant
est refusée, et `GST`/`TPS` sont ramenés au même code pour ne pas compter deux
fois la même taxe. `normalize.test.ts` décrit précisément ce que le modèle a le droit de
rater.

### L'écran de vérification compte plus qu'avant

Un modèle qui hallucine une ligne produit quelque chose de *plausible*, donc de
plus dangereux qu'un `S0,9S` visiblement cassé. Deux garde-fous :

- le bandeau **« sous-total + taxes = total imprimé »** est le détecteur
  d'hallucination le moins cher qui existe : si une ligne est inventée ou
  oubliée, l'écart le dit immédiatement. Le sous-total imprimé étant lu lui
  aussi, le bandeau distingue une erreur de ligne d'une erreur de taxe ;
- le modèle marque lui-même les lignes qu'il a mal lues (`uncertain`), ce qui
  allume le point discret déjà prévu sur ces lignes.

L'écran de correction n'est pas un rattrapage d'erreur, c'est un écran de
travail.

### Clé API et modèle

La clé est **celle de l'utilisateur**, saisie dans les réglages et conservée
dans IndexedDB sur l'appareil. L'appel part directement du navigateur via le
SDK Gemini officiel, sans passer par un backend ; la clé ne transite jamais
dans l'URL, qui se retrouverait dans les journaux et l'historique. En
contrepartie, la clé est lisible par qui a accès à l'appareil, ce qui convient
à un usage personnel et pas à une app partagée.

Le nom du modèle est **modifiable dans les réglages** (`gemini-2.5-flash` par
défaut) : ces noms changent souvent, et il ne faut pas avoir à recompiler pour
en suivre un. Le bouton **« Vérifier la clé et lister les modèles »** interroge
le SDK Gemini et remplace le champ libre par la liste de ce que la clé peut
réellement appeler — c'est le seul moyen fiable de connaître un nom exact.

À noter : ouvrir `…/models/X:generateContent` dans un navigateur renverra
toujours 404, y compris pour un modèle valide. Ce point d'entrée n'accepte que
POST ; un GET n'y est pas routé, et ne prouve donc rien.

### Latence

Deux réglages tiennent la lecture dans des délais raisonnables :

- **l'image est réduite avant l'envoi** (≤ 1,6 Mpx, largeur ≤ 1400 px). Une
  photo de ticket en 2000 × 4000 fait 8 Mpx, soit deux mégaoctets à téléverser
  depuis un lien mobile, pour une image que l'API rééchantillonne de toute
  façon ;
- **le raisonnement interne est désactivé** (`thinkingConfig.thinkingBudget: 0`).
  Lire un ticket ne demande aucune réflexion. Les modèles qui ne connaissent
  pas ce champ le refusent par un 400 : l'appel est alors rejoué sans lui,
  automatiquement.

Sans réseau ou sans clé, la lecture échoue proprement et propose la saisie
manuelle — le travail en cours n'est jamais perdu.

## Le design

Cinq valeurs de gris, un ambre réservé aux écarts, et six teintes désaturées
pour les seules pastilles de participants (`src/styles/tokens.css`). Pas de
bleu, pas de vert de validation : **un état correct se signale par l'absence
d'alerte**. Pas d'ombre décorative, pas de dégradé, pas d'icône illustrative.
Tous les montants en chiffres tabulaires.

## Intégration Tricount — expérimentale

**Lisez ceci avant d'activer quoi que ce soit.**

Tricount, racheté par bunq, **n'expose aucune API publique ni documentée**. Le
module `src/integrations/tricount/` s'appuie sur un protocole rétro-conçu depuis
l'application Android. Concrètement :

- l'endpoint peut cesser de fonctionner du jour au lendemain, sans préavis ;
- **l'usage sort des conditions d'utilisation du service** ;
- une PWA ne peut pas l'appeler directement (pas d'en-têtes CORS, requêtes
  signées), d'où le relais — la seule entorse au « pas de backend » ;
- ce relais voit passer le récapitulatif : ce sont les seules données qui
  quittent l'appareil, et seulement sur action explicite.

Le relais délègue le protocole à [`tricount-api`](https://github.com/elrandar/tricount-api),
un client non officiel rétro-conçu depuis l'application Android, plutôt que de
le réimplémenter. **Aucune clé applicative n'est nécessaire** : le client génère
au premier appel une paire de clés et un identifiant d'appareil, les conserve
dans un fichier d'identifiants, et rejoindre un tricount ne demande que son
code de partage. Le relais ne fait pas partie de ce dépôt : il tourne comme
service indépendant, joint par son adresse et son jeton.

Les participants ne sont pas associés à la main : ils portent les mêmes noms
que les membres du tricount — c'est la même personne qui les a saisis — et le
relais les rapproche lui-même, à la casse et aux espaces près. Un nom sans
correspondance interrompt l'envoi en le nommant, plutôt que d'inventer une
répartition. Seul le payeur reste à indiquer : rien dans le ticket ne le dit.

### Joindre le relais

Le relais tourne comme service indépendant, sur sa propre machine. Deux réglages
le désignent, tous deux dans l'écran Réglages, tous deux conservés sur l'appareil :

| Réglage | Rôle |
|---|---|
| **Adresse du relais** | URL complète (`https://…`) ou chemin sur la même origine (`/api/tricount`). Vide : l'adresse livrée par le build, `VITE_TRICOUNT_RELAY_URL`. |
| **Jeton du relais** | Envoyé en `Authorization: Bearer …` à chaque appel. Vide : aucun en-tête d'authentification. |

Le jeton **n'est pas une variable de compilation** : un build de PWA est un
fichier public, un secret qu'on y place se lit dans le bundle. Il se saisit sur
chaque appareil, comme la clé Gemini, et n'en sort jamais.

Un relais sur une autre origine implique deux choses de son côté : répondre au
pré-vol `OPTIONS`, et lister `authorization` dans `Access-Control-Allow-Headers`
— sans quoi le navigateur bloque l'appel avant même de l'émettre. Un refus
d'authentification (401 ou 403) est signalé pour lui-même, plutôt que confondu
avec l'échec générique.

La fonctionnalité est coupée par un drapeau de compilation
(`VITE_TRICOUNT_ENABLED`, `false` par défaut) : sans lui, rien n'apparaît dans
l'interface. Voir `.env.example`.

**La voie fiable reste l'export texte** : « Copier le récapitulatif » produit

```
Chez Victoire — 14/03/2026
Sous-total : 50,00 $ · taxes : 7,49 $
Pourboire : 9,00 $
Total : 66,49 $

Mathieu : 39,89 $
Léa : 26,60 $
```

et un bouton à côté de chaque personne copie son seul montant, à coller
directement dans le champ de Tricount. Cela fonctionne hors ligne, et
continuera de fonctionner.

## Organisation

```
src/
  lib/          argent, répartition, taxes, pourboire, règlement, export
  capture/      recadrage, rotation, compression de la photo
  extraction/   appel du modèle, validation de sa réponse, contrat de sortie
  db/           IndexedDB (tickets, photos, participants, réglages)
  store/        état applicatif (Zustand) et écritures différées
  ui/           primitives : écran, bouton, feuille, pastille, champ montant
  screens/      les six écrans du parcours
  integrations/ Tricount, isolé et désactivable
  styles/       jetons de design et feuille unique
docker/         configuration nginx de l'image
```
