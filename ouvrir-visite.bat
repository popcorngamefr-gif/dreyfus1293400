@echo off
cd /d "C:\Users\tbelotti\Documents\visite-matterport\outil-correctif\matterport-dl-refs-pull-205-head"
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 5; Start-Process 'http://127.0.0.1:8080'"
py -3 run.py JgaZQe7xn5N 127.0.0.1 8080 --base-folder "C:\Users\tbelotti\Documents\visite-matterport\downloads"
