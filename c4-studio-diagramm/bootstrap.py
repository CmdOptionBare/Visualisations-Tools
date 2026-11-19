#!/usr/bin/env python3
"""Fetch the pinned official Structurizr distribution, verify SHA-256, extract."""
import hashlib, io, os, tempfile, urllib.request, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
URL='https://github.com/structurizr/cli/releases/download/v2025.11.09/structurizr-cli.zip'
SHA='f5365a463fc44d539ed19bec00c48ba1e1ecda0ccfd1ba40d2e7472d264eb79a'

def main():
    dest=ROOT/'tools'/'structurizr'
    if (dest/'structurizr.sh').exists():
        print('Structurizr CLI ist vorhanden.');return
    print('Lade offiziellen Structurizr CLI 2025.11.09 (einmalig, ca. 95 MB) …',flush=True)
    with urllib.request.urlopen(URL,timeout=90) as response:archive=response.read()
    if hashlib.sha256(archive).hexdigest()!=SHA:raise RuntimeError('Prüfsumme stimmt nicht. Keine Installation vorgenommen.')
    dest.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=dest.parent,prefix='cli-') as tmp:
        with zipfile.ZipFile(io.BytesIO(archive)) as z:
            for name in z.namelist():
                if Path(name).is_absolute() or '..' in Path(name).parts:raise RuntimeError('Ungültiger Archivpfad.')
            z.extractall(tmp)
        for p in Path(tmp).iterdir():
            target=dest/p.name
            dest.mkdir(exist_ok=True)
            if target.exists():
                if target.is_file():target.unlink()
                else:raise RuntimeError('Vorhandenes Teilverzeichnis: '+str(target)+'. Bitte tools/structurizr sichern/entfernen und erneut starten.')
            os.replace(p,target)
    print('CLI installiert und SHA-256 bestätigt.',flush=True)
if __name__=='__main__':
    try:main()
    except Exception as e:raise SystemExit('Installation fehlgeschlagen: '+str(e)+'\nAlternativ offiziellen Release manuell unter tools/structurizr/ entpacken.')
