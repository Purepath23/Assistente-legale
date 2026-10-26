#!/bin/bash
# OCR.command — doppio clic dal Finder: trascrive in locale (GLM-OCR) un PDF scansionato o un'immagine.
# Il testo viene salvato accanto al file originale come <nome>-ocr.md; nulla esce dal Mac.

cd "$(dirname "$0")" || exit 1

echo "Trascina qui il PDF o l'immagine scansionata, poi premi Invio:"
read -r FILE
# Il Finder incolla il percorso con gli spazi preceduti da "\" o tra apici: li togliamo.
FILE=$(printf '%s' "$FILE" | sed -e 's/[[:space:]]*$//' -e "s/^'\(.*\)'$/\1/" -e 's/\\\(.\)/\1/g')

if [ ! -f "$FILE" ]; then
  echo "File non trovato: $FILE"
  read -r -p "Premi Invio per chiudere." _
  exit 1
fi

OUT="${FILE%.*}-ocr.md"
if node .claude/plugin/scripts/glm-ocr.mjs "$FILE" --out "$OUT"; then
  echo
  echo "Fatto: $OUT"
  open "$OUT"
else
  echo
  echo "Qualcosa non ha funzionato: copia il messaggio qui sopra e mandalo a Claude."
fi
read -r -p "Premi Invio per chiudere." _
