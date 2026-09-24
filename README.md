# Visite virtuelle : 16 rue Pierre Dreyfus

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

## Déploiement

Le repo GitHub est relié à Vercel (offre Hobby) :

- preset « Other », aucune commande de build, répertoire racine du repo ;
- chaque push crée un déploiement de prévisualisation, `main` est la production.

Environ 12 600 fichiers et 530 Mo sont déployés.
