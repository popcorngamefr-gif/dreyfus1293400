"""Genere _mp_manifest.js a partir des fichiers presents dans le repo.

Le serveur Python de matterport-dl verifiait l'existence des fichiers a chaque
requete (textures recadrees, locales, reponses graph). Sur un hebergement
statique, JSNetProxy.js fait ces choix cote navigateur a l'aide de cette liste.

A relancer uniquement si les donnees de la visite changent :
    python scripts/generer-manifeste.py
"""

import json
import os
import re

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    os.chdir(RACINE)

    graph_dir = "_mp_api/mp/models"
    graph_ops = sorted(m.group(1) for f in os.listdir(graph_dir) if (m := re.fullmatch(r"graph_(\w+)\.json", f)))

    locales = sorted(m.group(1) for f in os.listdir("locale/messages") if (m := re.fullmatch(r"strings_(\w+)\.json", f)))

    crops = []
    for dossier, _, fichiers in os.walk("models"):
        for f in fichiers:
            if ".jpgcrop=" in f or ".jpgwidth=" in f:
                crops.append("/" + os.path.join(dossier, f).replace(os.sep, "/"))
    crops.sort()

    manifeste = {"graphOps": graph_ops, "locales": locales, "crops": crops}
    with open("_mp_manifest.js", "w", encoding="utf-8", newline="\n") as f:
        f.write("// Fichier genere par scripts/generer-manifeste.py, ne pas modifier a la main.\n")
        f.write("window._MpManifest = " + json.dumps(manifeste, separators=(",", ":")) + ";\n")
    print(f"_mp_manifest.js : {len(graph_ops)} operations graph, {len(locales)} locales, {len(crops)} textures recadrees")


if __name__ == "__main__":
    main()
