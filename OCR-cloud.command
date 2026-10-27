#!/bin/bash
# OCR-cloud.command — doppio clic dal Finder: OCR veloce ONLINE (GLM-OCR su Z.ai).
# SOLO per documenti NON riservati: le pagine vengono inviate ai server di Z.ai.
# Per documenti dei clienti usare OCR.command (tutto sul computer).

cd "$(dirname "$0")" || exit 1
KEYFILE="$HOME/.glm-ocr-zai-key"

echo "=============================================================="
echo " OCR ONLINE (Z.ai) — solo per documenti NON riservati"
echo " Le pagine del documento vengono inviate ai server di Z.ai."
echo "=============================================================="
read -r -p "Il documento NON e riservato? Scrivi SI per continuare: " OK
if [ "$OK" != "SI" ]; then
  echo "Annullato. Per documenti riservati usa OCR.command."
  read -r -p "Premi Invio per chiudere." _
  exit 1
fi

if [ ! -s "$KEYFILE" ]; then
  echo
  echo "Serve la chiave API di Z.ai (la crei sul sito z.ai, area API keys)."
  echo "Incollala qui sotto (non si vede mentre la incolli) e premi Invio."
  echo "Resta salvata solo su questo Mac, nel file $KEYFILE."
  read -r -s KEY
  echo
  if [ -z "$KEY" ]; then
    echo "Nessuna chiave inserita."
    read -r -p "Premi Invio per chiudere." _
    exit 1
  fi
  (umask 077; printf '%s' "$KEY" > "$KEYFILE")
fi

echo
echo "Trascina qui il PDF o l'immagine, poi premi Invio:"
read -r FILE
FILE=$(printf '%s' "$FILE" | sed -e 's/[[:space:]]*$//' -e "s/^'\(.*\)'$/\1/" -e 's/\\\(.\)/\1/g')

if [ ! -f "$FILE" ]; then
  echo "File non trovato: $FILE"
  read -r -p "Premi Invio per chiudere." _
  exit 1
fi

OUT="${FILE%.*}-ocr.md"
if node .claude/plugin/scripts/glm-ocr.mjs "$FILE" --cloud --out "$OUT"; then
  echo
  echo "Fatto: $OUT"
  open "$OUT"
else
  echo
  echo "Qualcosa non ha funzionato: copia il messaggio qui sopra e mandalo a Claude."
  echo "(Se l'errore riguarda la chiave, cancellala con:  rm ~/.glm-ocr-zai-key  e riprova.)"
fi
read -r -p "Premi Invio per chiudere." _
