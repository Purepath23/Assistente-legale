---
description: "Mostra il riferimento completo dei comandi, agenti disponibili, skill ed esempi d'uso."
tools:
  - Read
  - Grep
  - Glob
  - Bash
  - WebSearch
  - WebFetch
---

# Aiuto BetterCallClaude Italia

Sei invocato tramite `/aiuto`. Mostra il riferimento completo dei comandi.

## Comandi (30)

| Comando | Descrizione |
|---------|-------------|
| `/legale` | Gateway intelligente — analizza intento, indirizza a specialisti |
| `/legale-5step` | Pipeline completa a 5 fasi: intake → ricerca → strategia → contraddittorio → redazione |
| `/legale-obiettivo` | Definisce condizione di successo legale verificabile (Goal Record) |
| `/legale-loop` | Esegue ciclo worker-valutatore contro un Goal Record |
| `/mappa-legale` | Traccia una pratica grande come mappa decisionale wayfinder |
| `/percorso-legale` | Lavora un ticket decisionale di una mappa wayfinder |
| `/raffina` | Trasforma query legali vaghe in prompt strutturati |
| `/ricerca` | Cerca precedenti giuridici italiani e compila memorie di ricerca |
| `/strategia` | Sviluppa strategia processuale con valutazione del rischio |
| `/redazione` | Redige documenti legali italiani con corretta formattazione delle citazioni |
| `/citazione` | Verifica e formatta citazioni giuridiche italiane |
| `/verifica` | Valida citazioni giuridiche italiane in bulk |
| `/precedente` | Cerca e analizza precedenti della Cassazione |
| `/nazionale` | Analizza secondo il diritto nazionale italiano |
| `/regionale` | Analizza secondo il diritto regionale per una regione specifica |
| `/contraddittorio` | Esegue analisi avversariale a tre agenti |
| `/briefing` | Briefing strutturato pre-esecuzione |
| `/flusso` | Definisce ed esegue workflow legali multi-agente (inclusi i flussi salvati) |
| `/crea-flusso` | Crea un flusso di lavoro personalizzato riutilizzabile combinando gli agenti del plugin |
| `/traduci` | Traduce documenti legali IT/EN |
| `/analisi-doc` | Analizza documenti legali |
| `/triage-nda` | Triage NDA: classifica GREEN/YELLOW/RED secondo diritto italiano |
| `/cronologia-legale` | Cronologia legale documentata da atti di causa |
| `/riassumi` | Consolida output delle pipeline multi-agente |
| `/start` | Onboarding — verifica MCP, guida playbook, esempi d'uso |
| `/doctor` | Diagnostica server MCP con guida contestuale |
| `/configurazione` | Alias per /start (deprecato) |
| `/privacy` | Visualizza e cambia la modalita privacy del segreto professionale |
| `/versione` | Visualizza versione plugin e stato sistema |
| `/aiuto` | Mostra questo aiuto |

## Agenti (21)

| Agente | Ruolo |
|-------|------|
| orchestrator | Coordina workflow multi-agente |
| researcher | Ricerca Cassazione, interpretazione normativa |
| strategist | Strategia processuale, valutazione causa |
| drafter | Redazione atti legali |
| citation | Verifica e formattazione citazioni |
| compliance | CONSOB, Banca d'Italia, AGCM, IVASS |
| data-protection | GDPR, Codice Privacy, DPIA |
| risk | Quantificazione rischio, analisi settlement |
| procedure | Termini CPC/CPP, competenza giurisdizionale |
| fiscal | Diritto tributario, CDI, transfer pricing |
| corporate | S.p.A./S.r.l., M&A, governance |
| realestate | Immobili, catasto, locazioni |
| translator | Traduzione giuridica IT/EN |
| regional | Tutte le 20 regioni italiane |
| summarizer | Consolidamento output pipeline |
| prompt-engineer | Affinamento query, raccomandazione workflow |
| chronology-builder | Estrae eventi di cronologia con provenienza documento+locus |
| briefing | Coordinatore briefing pre-esecuzione |
| judicial | Sintesi neutrale in workflow avversariale |
| advocate | Costruisce caso pro-posizione |
| adversary | Sfida posizioni giuridiche |

## Skill (16)

| Skill | Scopo |
|-------|---------|
| italian-legal-research | Ricerca precedenti Cassazione + routing giurisdizionale |
| italian-legal-translation | Traduzione giuridica IT/EN |
| italian-legal-drafting | Redazione documenti + integrazione playbook |
| compliance-frameworks | Valutazione conformita regolamentare |
| privacy-routing | Protezione segreto professionale + fallback Cowork |
| italian-legal-strategy | Sviluppo strategia di causa |
| legal-intake | Intake unificato: modalita Refine + Briefing |
| italian-citation-formats | Formattazione citazioni |
| citation-content-verify | Verifica sostanziale citazioni (esistenza server-side via citation-verify-ita + implicazione) |
| italian-document-analysis | Intelligenza documentale + integrazione playbook |
| data-protection-law | Conformita GDPR/Codice Privacy |
| adversarial-analysis | Stress-test a tre agenti |
| legal-5step-framework | Pipeline end-to-end a 5 fasi |
| legal-chronology | Cronologia legale con provenienza obbligatoria e termini calcolabili via compute_deadlines |
| legal-evaluator | Motore verdetti per sistema goal-loop |
| legal-wayfinder | Mappe decisionali per pratiche grandi o nebbiose |

**Risorse condivise** (non skill attivabili):
- `shared/SKILL.md` — Convenzione output-as-file (bcc-output/)
- `shared/references/italian-jurisdictions.md` — Profili 20 regioni italiane

## Esempi d'Uso

```
/start

/legale Voglio valutare la mia esposizione ai sensi dell'art. 1218 CC per ritardata consegna

/raffina Ho problemi con il mio locatore

/ricerca Art. 1218 CC responsabilita contrattuale per ritardata consegna

/strategia Contenzioso locativo a Milano, locatore chiede EUR 200k danni

/redazione Contratto di lavoro per ingegnere software a Roma, bilingue IT/EN

/contraddittorio La clausola di non concorrenza in questo contratto di lavoro e valida?

/flusso litigation-prep Risarcimento danni contro produttore

/crea-flusso Pipeline personalizzata: ricerca → strategia → redazione con checkpoint

/briefing Prepara lite completa per inadempimento art. 1218 CC, EUR 500K, Milano

/regionale LOM Giurisdizione del Tribunale delle Imprese per contratti oltre EUR 30k

/legale-5step Analisi completa responsabilita contrattuale art. 1218 CC, EUR 300k

/legale-5step --breve --regione=LOM Contenzioso locativo a Milano

/triage-nda @nda.pdf Classifica questo NDA

/legale-obiettivo citazioni-pulite --target=bozza-parere.md

/legale-loop goal_20260521_abc123

/analisi-doc @contratto.pdf Analizza questo contratto di locazione commerciale

/doctor
```

## Supporto Linguistico

| Lingua | Codice | Contesto Legale |
|----------|------|---------------|
| Italiano | IT | Primario: CC, CP, CPC, Cassazione. Lingua ufficiale di tutti i tribunali italiani. |
| Inglese | EN | Lingua di lavoro con mappatura terminologia giuridica italiana. |

## Privacy

BetterCallClaude Italia include un hook PreToolUse di assistenza al rilevamento del segreto professionale (Art. 622 CP, L. 247/2012, CDF Art. 13). L'hook scansiona le chiamate tool in uscita (Write, Edit, MultiEdit, WebFetch, Bash e tutti i tool MCP) per indicatori di privilegio in italiano e inglese. I tool locali (es. `mcp__ollama__*`, se configurati) sono esclusi perche non trasmettono dati all'esterno.

| Modalita | Pattern forti | Pattern deboli+contesto | Tool locali |
|------|--------------|------------------------|--------|
| `strict` | **Bloccato** (deny) | **Bloccato** (deny) | Sempre permesso |
|          | Contenuto non privilegiato passa (server MCP cloud usabili) | | |
| `balanced` | **Conferma richiesta** (ask) | **Conferma richiesta** (ask) | Sempre permesso |
| `cloud` | **Conferma richiesta** (ask) | Permesso senza prompt | Sempre permesso |

La modalita si configura con `/privacy strict|balanced|cloud` (default: `balanced`). In modalita `strict`, il contenuto privilegiato e bloccato ma le chiamate senza pattern privilegiati passano normalmente (i server MCP cloud restano usabili per la ricerca). Per elaborare contenuto privilegiato in sicurezza, configura un server MCP locale (es. Ollama): i suoi tool sono sempre esenti.

> **Nota**: L'hook privacy e una tecnologia assistiva e non garantisce la conformita all'Art. 622 CP o alla L. 247/2012 / CDF Art. 13. Gli avvocati restano professionalmente responsabili della protezione della confidenzialita del cliente.

## Disclaimer Professionale

BetterCallClaude Italia e uno strumento di ricerca e analisi legale. Tutti gli output richiedono revisione e validazione da un avvocato qualificato prima dell'uso. Questo strumento non costituisce parere legale.

$ARGUMENTS
