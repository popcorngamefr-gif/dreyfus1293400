"""Recree les tuiles 360 manquantes a partir des images skybox.

matterport-dl n'a telecharge aucune tuile (dossier models/.../assets/~/tiles/<sweep>/ absent)
pour certains points de vue. Le lecteur reste alors bloque (chargement infini) quand on s'y
deplace. Les images skybox 2k de ces points existent (assets/pan/2k/~/<sweep>_skybox<N>.jpg) :
ce script les decoupe au format attendu, {niveau}_face{N}_{colonne}_{ligne}.jpg en carres de 512 px.

Niveaux generes : 512 (1x1), 1k (2x2), 2k (4x4). Le niveau 4k n'existe pas en skybox et
n'est pas recree (ce serait un simple agrandissement, et 1 536 fichiers de plus).

Ne touche pas aux points de vue qui ont deja des tuiles.
    python scripts/generer-tuiles-manquantes.py
"""

import glob
import os

from PIL import Image

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAILLE_TUILE = 512
NIVEAUX = {"512": 1, "1k": 2, "2k": 4}


def main():
    os.chdir(RACINE)
    for assets in glob.glob("models/*/assets"):
        sweeps = {os.path.basename(f).split("_skybox")[0] for f in glob.glob(os.path.join(assets, "pan", "2k", "~", "*_skybox0.jpg"))}
        for sweep in sorted(sweeps):
            dossier = os.path.join(assets, "~", "tiles", sweep)
            if os.path.isdir(dossier) and os.listdir(dossier):
                continue
            skybox = os.path.join(assets, "pan", "2k", "~", f"{sweep}_skybox{{}}.jpg")
            if not all(os.path.exists(skybox.format(face)) for face in range(6)):
                print(f"{sweep} : skybox 2k incomplete, ignore")
                continue
            os.makedirs(dossier, exist_ok=True)
            n = 0
            for face in range(6):
                source = Image.open(skybox.format(face)).convert("RGB")
                for niveau, cote in NIVEAUX.items():
                    image = source.resize((cote * TAILLE_TUILE,) * 2, Image.LANCZOS)
                    for x in range(cote):
                        for y in range(cote):
                            boite = (x * TAILLE_TUILE, y * TAILLE_TUILE, (x + 1) * TAILLE_TUILE, (y + 1) * TAILLE_TUILE)
                            image.crop(boite).save(os.path.join(dossier, f"{niveau}_face{face}_{x}_{y}.jpg"), quality=90)
                            n += 1
            print(f"{sweep} : {n} tuiles creees")


if __name__ == "__main__":
    main()
