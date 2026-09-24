"""Recree les tuiles 360 manquantes a partir des images skybox.

Pendant le telechargement, Matterport a refuse une partie des requetes (HTTP 429, trop de
requetes, voir run_report.log) : certains points de vue n'ont aucune tuile, un autre est incomplet. Le lecteur reste alors bloque (chargement infini) quand on s'y
deplace. Les images skybox 2k de ces points existent (assets/pan/2k/~/<sweep>_skybox<N>.jpg) :
ce script les decoupe au format attendu, {niveau}_face{N}_{colonne}_{ligne}.jpg en carres de 512 px.

Niveaux generes : 512 (1x1), 1k (2x2), 2k (4x4). Le niveau 4k n'existe pas en skybox et
n'est pas recree (ce serait un simple agrandissement, et 1 536 fichiers de plus).

Seules les tuiles absentes sont creees, les tuiles telechargees ne sont jamais remplacees.
    python scripts/generer-tuiles-manquantes.py
"""

import glob
import os

from PIL import Image

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAILLE_TUILE = 512
NIVEAUX = {"512": 1, "1k": 2, "2k": 4}


def noms_attendus():
    for face in range(6):
        for niveau, cote in NIVEAUX.items():
            for x in range(cote):
                for y in range(cote):
                    yield f"{niveau}_face{face}_{x}_{y}.jpg"


def main():
    os.chdir(RACINE)
    for assets in glob.glob("models/*/assets"):
        sweeps = {os.path.basename(f).split("_skybox")[0] for f in glob.glob(os.path.join(assets, "pan", "2k", "~", "*_skybox0.jpg"))}
        for sweep in sorted(sweeps):
            dossier = os.path.join(assets, "~", "tiles", sweep)
            existantes = set(os.listdir(dossier)) if os.path.isdir(dossier) else set()
            if all(nom in existantes for nom in noms_attendus()):
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
                            nom = f"{niveau}_face{face}_{x}_{y}.jpg"
                            if nom in existantes:
                                continue
                            image.crop(boite).save(os.path.join(dossier, nom), quality=90)
                            n += 1
            if n:
                print(f"{sweep} : {n} tuiles creees")


if __name__ == "__main__":
    main()
