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

## Déploiement

Le repo GitHub est relié à Vercel (offre Hobby) :

- preset « Other », aucune commande de build, répertoire racine du repo ;
- chaque push crée un déploiement de prévisualisation, `main` est la production.

Environ 13 750 fichiers et 540 Mo sont déployés.
