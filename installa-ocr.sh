#!/bin/bash
# installa-ocr.sh — prepara l'OCR locale (GLM-OCR via Ollama) sul Mac, in un colpo solo.
#
# Uso (una sola riga nel Terminale):
#   curl -fsSL https://raw.githubusercontent.com/Purepath23/Assistente-legale/claude/gracious-allen-oeuoyq/installa-ocr.sh | bash
#
# Cosa fa: scarica/aggiorna il progetto in ~/Assistente-legale, controlla Node,
# avvia Ollama, scarica il modello glm-ocr se manca e verifica che tutto funzioni.
# Si puo rilanciare quante volte si vuole.

BRANCH="claude/gracious-allen-oeuoyq"
REPO="https://github.com/Purepath23/Assistente-legale.git"
DIR="$HOME/Assistente-legale"
MODEL="glm-ocr:q8_0"

ok()   { printf '\033[32m✔\033[0m %s\n' "$1"; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
die()  { printf '\n\033[31m✘ %s\033[0m\n' "$1"; exit 1; }

step "1/5  Progetto"
command -v git >/dev/null || die "git non trovato. Esegui: xcode-select --install  e poi rilancia questo comando."
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH" || die "Non riesco ad aggiornare il progetto (connessione?)."
  git -C "$DIR" checkout -q "$BRANCH" 2>/dev/null || git -C "$DIR" checkout -q -b "$BRANCH" "origin/$BRANCH" \
    || die "Non riesco a passare al branch $BRANCH: in $DIR ci sono modifiche non salvate."
  git -C "$DIR" pull -q --ff-only origin "$BRANCH" || die "Non riesco ad aggiornare $DIR: ci sono modifiche locali."
  ok "Progetto aggiornato in $DIR"
elif [ -e "$DIR" ]; then
  die "$DIR esiste ma non e il progetto. Rinominalo e rilancia."
else
  git clone -q -b "$BRANCH" "$REPO" "$DIR" || die "Download del progetto non riuscito (connessione?)."
  ok "Progetto scaricato in $DIR"
fi

step "2/5  Node e PDF"
command -v node >/dev/null || die "Node.js non trovato. Installalo da https://nodejs.org (versione LTS) e rilancia."
ok "Node $(node -v)"
if command -v pdftoppm >/dev/null; then
  ok "poppler gia installato"
elif [ "$(uname)" = "Darwin" ]; then
  ok "PDF: uso il motore PDF integrato di macOS (niente da installare)"
else
  die "Manca poppler. Installalo (Debian/Ubuntu: sudo apt install poppler-utils) e rilancia."
fi

step "3/5  Ollama"
command -v ollama >/dev/null || die "Ollama non trovato. Installalo da https://ollama.com/download, aprilo una volta e rilancia."
if ! curl -fs http://127.0.0.1:11434/api/version >/dev/null; then
  open -a Ollama 2>/dev/null
  for _ in $(seq 1 30); do
    curl -fs http://127.0.0.1:11434/api/version >/dev/null && break
    sleep 1
  done
fi
curl -fs http://127.0.0.1:11434/api/version >/dev/null || die "Ollama non risponde. Apri l'app Ollama dalle Applicazioni e rilancia."
ok "Ollama attivo"

step "4/5  Modello GLM-OCR"
if ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -q '^glm-ocr:'; then
  ok "Modello gia presente"
else
  echo "Scarico $MODEL (circa 1,8 GB, qualche minuto)..."
  ollama pull "$MODEL" || die "Download del modello non riuscito. Prova: ollama signin  e poi rilancia."
  ok "Modello scaricato"
fi

step "5/5  Verifica"
node "$DIR/.claude/plugin/scripts/glm-ocr.mjs" check || die "Verifica non riuscita: copia il messaggio sopra e mandalo a Claude."

chmod +x "$DIR/OCR.command" 2>/dev/null
printf '\n\033[32mTutto pronto.\033[0m\n'
echo "Per trascrivere una scansione: apri la cartella Assistente-legale nella tua cartella Inizio,"
echo "fai doppio clic su OCR.command e trascina il PDF nella finestra."
open "$DIR" 2>/dev/null
exit 0
