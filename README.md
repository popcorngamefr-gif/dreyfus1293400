# Visite virtuelle : 12 rue Pierre Dreyfus

Archive de la visite Matterport `JgaZQe7xn5N`, téléchargée avec
[matterport-dl](https://github.com/rebane2001/matterport-dl) (version avec le correctif de la PR #205),
et adaptée pour être servie comme un simple site statique (Vercel, offre gratuite).

## Contenu du repo

| Chemin | Rôle |
|---|---|
| `index.html`, `js/`, `css/`, `fonts/`, `locale/`, `webgl-vendors/`, `showcase-sdk/`, `images/`, `cursors/` | Le lecteur Matterport (versions patchées par matterport-dl) |
| `models/`, `apifs/` | Données de la visite : tuiles 360°, maillage 3D, textures, photos |
| `_mp_api/` | Réponses de l'API Matterport enregistrées (anciennement `api/`, nom réservé par Vercel) |
| `balade/` | La balade libre en 3D (voir plus bas), avec Three.js r169 copié dans `balade/vendor/` |
| `JSNetProxy.js` | Redirige toutes les requêtes du lecteur vers ce site, et choisit le bon fichier (voir plus bas) |
| `_mp_manifest.js` | Liste des fichiers disponibles, générée par `scripts/generer-manifeste.py` |
| `vercel.json`, `.vercelignore` | Configuration Vercel |
| `*.orig.*` | Fichiers d'origine remplacés par leur version patchée (non déployés) |
| `outil-correctif/` | L'outil matterport-dl (PR #205), non déployé |
| `matterport-dl.py`, `_matterport_interactive.py`, `run_args.json` | Copies faites par l'outil lors du téléchargement, non déployées |

## Lancer la visite en local

Depuis la racine du repo :

```
python -m http.server 8080
```

puis ouvrir http://127.0.0.1:8080. Aucun serveur spécial n'est nécessaire.

Le serveur intégré de matterport-dl (`ouvrir-visite.bat`) ne fonctionne plus sur ce repo, car les fichiers
ont été réorganisés. Il fonctionne toujours sur la sauvegarde d'origine
(`Documents\visite-matterport\downloads\JgaZQe7xn5N`).

## Comment ça marche sur un hébergement statique

Le serveur Python de matterport-dl faisait quelques choix à la volée. Ils sont maintenant faits ainsi :

| Comportement du serveur Python | Remplacé par |
|---|---|
| Sert `index.modified.html`, `showcase.modified.js`, `vendors-react.modified.js`, `graph_*.modified.json` | Les versions patchées ont pris le nom normal, les originaux sont en `.orig` |
| `/api/mp/models/graph?operationName=X` renvoie `graph_X.json` | `JSNetProxy.js` (et une règle `vercel.json` en secours) |
| `/api/...` | `JSNetProxy.js` pointe vers `/_mp_api/...` (et une règle `vercel.json` en secours) |
| Locale absente (ex : `strings_fr.json`) remplacée par `locale/strings.json` | `JSNetProxy.js` (et une règle `vercel.json` en secours) |
| Textures de la maquette 3D `x.jpg?width=W&crop=C` renvoient `x.jpgwidth=W_crop=C.jpg` | `JSNetProxy.js`, grâce à la liste de `_mp_manifest.js` |
| Les `POST` sont traités comme des `GET` | `JSNetProxy.js` transforme les `POST` vers ce site en `GET` |
| `POST /api/mp/accounts/graph` (vérification de connexion) | Fichier `_mp_api/mp/accounts/graph` : « personne n'est connecté » |

Si les données de la visite changent, relancer `python scripts/generer-manifeste.py`.

### Dates d'expiration

Les adresses Matterport sont signées et expirent (`validUntil`, `expires`). Si une de ces dates est passée, le lecteur
attend indéfiniment un renouvellement (console : `[expiring-resource] Stale resource, waiting for refresh`) et la visite
ne se charge jamais. Toutes les dates sont donc repoussées à 2099, y compris dans les données préchargées
intégrées à `index.html` et dans `_mp_api/player/models/JgaZQe7xn5N/files`. Après un nouveau téléchargement, vérifier :

```
grep -rhoE 'validUntil[^0-9]*20[0-9]{2}-[0-9-]+' --exclude='*.orig.*' index.html _mp_api | sort | uniq -c
```

### Tuiles 360° recréées

Pendant le téléchargement, Matterport a refusé environ 5 000 requêtes (erreur HTTP 429, « trop de requêtes ») :
9 points de vue sur 32 n'avaient aucune tuile et un 10e était incomplet. Le lecteur tournait alors
à l'infini quand on s'y déplaçait. `scripts/generer-tuiles-manquantes.py` recrée les tuiles absentes (niveaux 512, 1k et 2k), sans toucher aux tuiles téléchargées,
à partir des images skybox 2k de ces points, présentes dans `models/.../assets/pan/2k/`.
Le niveau 4k n'existe pas pour ces 10 points : un zoom très poussé y restera en qualité 2k.

## Visite « Souvenir depuis Pierre Dreyfus »

Le dossier `souvenir/` ajoute une couche par-dessus le lecteur, chargée par une ligne dans `index.html`.
Il ne modifie ni le lecteur ni les données de la visite.

| Adresse | Ce qu'on obtient |
|---|---|
| `/` (mode souvenir, par défaut) | Animation de la porte d'entrée, arrivée dans l'entrée (point de vue 0, face à l'appartement), boutons « Mode jeu » et « Navigation classique » |
| `/?m=JgaZQe7xn5N&classique=1` | La visite telle qu'elle était, avec un bouton « Visite souvenir » pour revenir |

Dans les deux modes, le logo Matterport (non téléchargé, donc cassé) est remplacé par le texte « Souvenir depuis Pierre Dreyfus ».

Le point de départ est passé au lecteur par l'adresse (`&ss=1&sr=0,0&play=1`), comme un lien de partage Matterport.
Si l'adresse contient déjà un point de départ (`ss`, `sp` ou `start`), il est respecté et l'intro n'est pas jouée.

**Mode jeu** : le lecteur sait déjà avancer tant qu'une touche W/A/S/D ou flèche est enfoncée. Le mode jeu lui renvoie ces touches selon
leur position physique (donc ZQSD sur un clavier AZERTY), transforme les mouvements de la souris verrouillée en petits glisser
(regarder autour), et un clic va vers le viseur. Échap quitte le mode jeu. Sur mobile, un joystick virtuel remplace le clavier
et on regarde en glissant sur l'écran.

## Balade libre en 3D (`/balade/`)

Une page indépendante du lecteur Matterport : on se promène à hauteur d'yeux (1,30 m) dans le maillage 3D texturé
de la visite, comme dans un jeu, sans sauter de point de vue en point de vue. Liens depuis l'écran de la porte
(« Balade libre en 3D ») et depuis la barre du mode souvenir (« Balade 3D »).

| Fichier | Rôle |
|---|---|
| `balade/index.html`, `balade/balade.css` | La page : accueil, barre de boutons, plan, joystick |
| `balade/balade.js` | Chargement du maillage, collisions, commandes, plan |
| `balade/panoramas.js` | Projection des photos 360 des points de vue sur le maillage |
| `balade/vendor/` | Three.js r169 et ses chargeurs (glTF, Draco, KTX2), servis par le site plutôt que par un CDN |

**Données utilisées** : les 3 tuiles de détail maximal du maillage, `models/.../assets/mesh_tiles/~/3/lod3_*.glb`
(glTF compressé Draco, textures KTX2 2048 px, environ 3 Mo en tout). Sur ordinateur, une fois la visite prête, les textures sont
remplacées par les JPG 4096 px du même dossier (environ 7 Mo). Sur téléphone, on garde les KTX2 pour ménager la mémoire graphique.
Les textures du scan contiennent déjà la lumière : elles sont affichées sans éclairage (`MeshBasicMaterial`).

**Photos 360 projetées** : le maillage est grossier et sa texture floue de près. Comme le lecteur Matterport, on
projette donc sur le maillage les photos 360 des points de vue. Chaque pixel mélange les photos des 4 points de vue
les plus proches (en privilégiant ceux visibles depuis le joueur) : une photo compte d'autant plus que la direction
dans laquelle elle a vu ce pixel est proche de la direction du regard. Debout sur un point de vue, on voit exactement
sa photo ; en marchant, l'image glisse continûment vers la suivante. Une photo qui entre ou sort de la liste des 4 le fait
en fondu (0,5 s). Pour chaque point de vue, une carte de distances (cube 512 px, rendu du maillage depuis le centre
de la photo, en flottant filtré si la carte graphique le permet) indique ce que la photo voit vraiment ; si aucune
photo ne voit un pixel, on garde la texture du maillage. Là où le scan n'a rien (vue par une fenêtre ouverte), une
sphère de fond affiche les photos à l'infini.

Fluidité : photos décodées hors du fil principal (`ImageBitmapLoader`) et envoyées à la carte graphique dès leur arrivée,
points suivants préchargés, regard légèrement lissé, résolution abaissée automatiquement si les images ralentissent.

- Photos : `models/.../assets/pan/2k/~/<sweepUuid>_skybox<0-5>.jpg` (2048 px), ou `pan/high/` (1024 px) sur écran tactile,
  pour ménager la mémoire graphique (environ 100 Mo par photo en 2k). 6 photos en mémoire (4 affichées, 2 préchargées).
- Points de vue : `_mp_api/mp/models/graph_GetShowcaseSweeps.json`, seulement ceux du scan (`placement: auto`, 28 sur 32) :
  les 4 photos ajoutées à la main sont placées approximativement.
- Orientation des faces, mesurée en comparant les faces aux rendus du maillage (identique pour tous les points) :
  une direction L dans le repère de la photo (z vers le haut, rotation `pano.rotation`) se lit dans le cube à
  `(-L.y, L.z, L.x)`, avec les faces skybox 2, 4, 0, 5, 1, 3 dans l'ordre +x, -x, +y, -y, +z, -z.
- Hauteur des yeux à 1,30 m : les photos sont prises à 1,19 m, plus on en est près, moins l'image se déforme.
  Le plan montre les points de vue ; le toucher à moins de 70 cm d'un point y place exactement.
- La tache bleue au plafond du couloir d'entrée est dans la photo d'origine (point de vue 0), tout comme le flou au sol
  sous chaque point de vue (le trépied, flouté par Matterport).

**Collisions** : le scan ne distingue pas les murs des meubles. Au chargement, on dessine une grille de 5 cm vue de dessus :
- « sol » : couvert par un triangle horizontal à moins de 15 cm du sol ;
- « obstacle » : traversé par un triangle entre 30 cm et 1,50 m de haut (murs, meubles, portes ouvertes).

On peut marcher sur le sol (petits trous bouchés sur 15 cm), à plus de 20 cm de tout obstacle. Les tapis et objets bas
ne bloquent pas. Si on se retrouve hors de la zone (trou du scan), on peut toujours en sortir. Cette même grille dessine le plan.

**Commandes** : ZQSD / WASD ou flèches (touches physiques, donc ZQSD en AZERTY), souris verrouillée pour regarder,
Maj pour courir, M pour le plan, L pour la lumière « fin de journée » (filtre chaud et vignettage), Échap pour libérer la souris.
Sur écran tactile : joystick en bas à gauche, glisser ailleurs pour regarder. Toucher le plan téléporte à l'endroit touché.

**Repères** : le maillage est en mètres, y vers le haut. Les positions des points de vue (`graph_GetShowcaseSweeps.json`,
z vers le haut) se convertissent par `(x, y, z) -> (x, z, -y)`. Le départ est le point de vue 0 (l'entrée), face au séjour.

`/balade/?debug` expose `window.__balade` (position du joueur, grilles) pour les tests.

## Déploiement

Le repo GitHub est relié à Vercel (offre Hobby) :

- preset « Other », aucune commande de build, répertoire racine du repo ;
- chaque push crée un déploiement de prévisualisation, `main` est la production.

Environ 13 770 fichiers et 545 Mo sont déployés.
