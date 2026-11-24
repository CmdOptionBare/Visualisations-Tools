# C4 Studio

Lokale Umgebung für benannte Structurizr-Ordnerprojekte. Die interaktiven Diagramme entstehen aus dem **offiziellen Structurizr-Parser**, nicht aus einem eigenen DSL-Teilparser. Enthalten: das erklärte ACP-Beispiel und die Architektur des Studios selbst.

## Starten

Voraussetzungen: **Python 3.10+**, **Java 21+**, **Graphviz** (`dot`). Keine Python-/Node-Pakete, kein Docker und keine API-Schlüssel nötig. Beim ersten Start lädt `bootstrap.py` einmalig den offiziellen Structurizr CLI 2025.11.09 von GitHub nach `tools/structurizr/` und prüft dessen feste SHA-256-Prüfsumme. Dafür ist Internetzugriff nötig (ca. 95 MB). Danach arbeitet das Studio offline. Alternativ den offiziellen Release manuell unter diesem Pfad entpacken. Das Studio-Archiv muss vollständig entpackt werden.

macOS, mit Homebrew:

```sh
brew install python openjdk@21 graphviz
export PATH="$(brew --prefix openjdk@21)/bin:$PATH"
cd /dein/pfad/c4-studio
bash start.sh
```

Linux (Debian/Ubuntu, falls die Pakete in der Distribution verfügbar sind):

```sh
sudo apt install python3 openjdk-21-jre graphviz
cd /dein/pfad/c4-studio
bash start.sh
```

Danach **http://127.0.0.1:4777** öffnen. Auf macOS kann `start.command` nach Installation der Voraussetzungen auch per Doppelklick gestartet werden. Ein anderer Port: `PORT=4888 bash start.sh`.

Die Anwendung bindet nur an die lokale Loopback-Adresse. Sie ist als Einzelbenutzer-Werkzeug gedacht. Sie steuert selbst keine Coding-Agenten: ACP wird hier modelliert und erklärt. Die Browseroberfläche braucht den mitgelieferten lokalen Server und funktioniert nicht durch direktes Öffnen von `index.html`.

## Projekte und DSL

```text
c4-studio/
├── start.sh
├── server.py
├── diagram-projects/
│   ├── ACP-Protokoll/
│   │   ├── workspace.dsl
│   │   ├── model/{systems,relationships}.dsl
│   │   ├── views/levels.dsl
│   │   ├── templates/Arbeitsplatz/1.0.0/environment.dsl
│   │   └── templates.lock.json
│   └── C4-Studio/workspace.dsl
├── Templates/
│   └── Arbeitsplatz/{1.0.0,1.1.0}/environment.dsl
├── data/history.sqlite3     # beim ersten Start erzeugt
├── static/
└── tools/structurizr/
```

- Projektordner nach `diagram-projects/` kopieren und die Seite neu laden. Alternativ auf **＋** neben Diagrammprojekte klicken und einen Ordner importieren. Ein Ordner kann mehrere Projekte mit jeweils eigener `workspace.dsl` enthalten. Der Import kopiert Dateien; er erzeugt keine dauerhafte Browser-Verknüpfung zum ursprünglichen Verzeichnis.
- Ein frisches Projekt kann mit **Neues DSL-Projekt** angelegt werden. In **DSL-Quelle** eine Datei auswählen, ändern oder eine neue Datei anlegen. **DSL prüfen & anzeigen** kompiliert den Entwurf ohne ihn zu speichern.
- Relative Datei- und Verzeichnis-Includes bleiben beim offiziellen Parser. Der sichere lokale Modus beschränkt Includes auf das jeweilige Projekt, erlaubt keine HTTPS-Includes, `..`, `workspace extends`, Plugins oder Scripts. Gemeinsam genutzte Templates werden deshalb in das Projekt kopiert.
- **Revision speichern** validiert zuerst und übernimmt nur gültige DSL. Der vollständige Quellsatz wird in SQLite gespeichert und im Projektordner materialisiert.
- Nach externen Editor-Änderungen **Ordner laden** wählen. Es gibt kein automatisches Live-Watching und keine Mehrbenutzer-Konfliktauflösung.
- **Projekt** exportiert den letzten gespeicherten Stand als ZIP. Revisionen bleiben in der Studio-Datenbank. Für ein vollständiges Backup sowohl `diagram-projects/`, `Templates/` als auch `data/` sichern.

## Interaktive C4-Navigation

Im ACP-Projekt:

1. **C1:** Agenten-Arbeitsplatz anklicken → C2.
2. **C2:** Lokaler Client & Orchestrator anklicken → C3.
3. **C3:** eine Komponente dieses Clients anklicken → zugehöriger Ablauf.
4. Über Breadcrumbs, Ebenentasten oder den View-Selektor zurück bzw. zu anderen Views wechseln.

Drill-down-Ziele werden aus den Scopes der DSL-Views abgeleitet. Ohne passende tiefere View öffnet ein Element seine Details. Gibt es mehrere passende Views, ist die erste das Klickziel; alle Views stehen im Selektor. Zoom, Verschieben und SVG-Export sind enthalten.

**C4 ist im klassischen C4-Modell die Code-Ebene.** Dein gewünschter Fluss ist hier eine `dynamic` View des gleichen DSL-Modells, als C4-Ersatz gekennzeichnet. Die Abfolge stammt aus den nummerierten Relationships der dynamischen View. Bei Wiederholung desselben Elements zeigt das Diagramm nummerierte Kanten zwischen gemeinsamen Knoten, keine künstliche Code-Repräsentation.

Der Renderer unterstützt System-Landscape-, System-Context-, Container-, Component- und Dynamic-Views. Er übernimmt deren expliziten Element-/Beziehungsumfang aus dem kompilierten JSON. Graphviz berechnet die Positionen und berücksichtigt die Layout-Richtung. Eigene Structurizr-Themes, manuelle Koordinaten, vollständige DSL-Styles, Deployment-, Filtered- und Custom-Views werden noch nicht wiedergegeben. Das Studio ist somit kein vollständiger Ersatz für den offiziellen Structurizr-Renderer. Die Modell- und Include-Syntax verarbeitet der offizielle Parser.

## Templates, Pins und Revisionen

**Templates & Versionen** zeigt die verfügbaren Versionen und die Bindung des aktuellen Projekts. Das ACP-Beispiel ist auf `Arbeitsplatz` **1.0.0** fixiert; **1.1.0** liegt als bewusst separat anzunehmendes Update bereit.

- Neue Version unter Name + SemVer (`1.2.0`) anlegen. Ein Fragment enthält keinen eigenen Workspace-Block.
- Bei erstmaliger Einbindung `model` oder `views` als Kontext wählen. Das Studio kopiert die Dateien ins Projekt, ergänzt explizite Includes und schreibt `templates.lock.json`.
- **Version im Entwurf übernehmen** aktualisiert die vendorten Dateien, Include-Pfade und den Pin. Das vollständige Projekt wird sofort kompiliert. Bei Namenskollisionen oder ungültigem Fragment bleibt der ursprüngliche Entwurf unverändert.
- Die Version bleibt zunächst ein Entwurf. **Revision speichern** schreibt den neuen Stand dauerhaft. Ohne Speichern kann man zum gespeicherten Stand zurückkehren.
- Eine veröffentlichte Template-Version lässt sich über die Oberfläche nicht überschreiben. Änderungen werden als neue Version angelegt. Manuelle Änderungen im Dateisystem sind technisch möglich; deshalb enthält jede Revision auch die tatsächlich verwendeten Template-Quellen, nicht nur deren Versionsnummer.
- **Revisionen → Als Entwurf laden** stellt einen alten vollständigen Quellsatz her. Speichern erzeugt eine neue Revision. Alte Revisionen werden nicht verändert.

Alle Includes eines Modellfragments müssen im gewählten Kontext gültig sein. Beispielsweise brauchen Komponenten einen Container als Kontext; `model` allein passt dafür nicht. Der UI-Assistent fügt ausschließlich am Anfang des model-/views-Blocks von `workspace.dsl` ein. Für spezifische Container-/Komponenten-Templates oder abhängige Fragmente den Include-Pfad im DSL-Editor an der passenden Stelle setzen. Auch Templates können als explizit nummerierte Dateien strukturiert werden, wenn ihre Definitionen voneinander abhängen.

## Warum SQLite statt einer Graph-Datenbank?

Der Architekturgraph liegt bereits im Structurizr-Modell. Für Versionsstände braucht das Studio vor allem unveränderliche Quellsnapshots einschließlich eingebundener Templates. SQLite löst diese Aufgabe eingebettet und ohne zusätzliche Installation. Die Datenbank ist ein Revisionsspeicher, die DSL bleibt die maßgebliche Modellquelle.

Die hochgeladene Datenbankliste ist Recherchematerial, keine verifizierte Produktauswahl. Ihre einzelnen Funktions-, Lizenz- und Performance-Aussagen wurden hier nicht bestätigt. Insbesondere werden Kùzu und LadybugDB nicht ungeprüft als dasselbe Produkt behandelt. Falls später graphübergreifende Abfragen, Impact-Analysen oder semantische Diffs gebraucht werden, kann ein Graphindex aus jedem kompilierten Modell abgeleitet werden. Die DSL sollte auch dann nicht durch eine zweite editierbare Modellquelle ersetzt werden.

## ACP knapp erklärt

ACP = **Agent Client Protocol**. Ein Client (Editor, Desktop-Anwendung oder lokale Brücke für eine Browser-UI) steuert einen Agenten. Nachrichten nutzen JSON-RPC 2.0, typischerweise über stdio zwischen lokalen Prozessen.

1. Client startet Agenten und sendet `initialize`; Versionen und Fähigkeiten werden ausgehandelt. Falls nötig, folgt Anmeldung.
2. Client legt mit `session/new` eine Sitzung an (oder lädt eine unterstützte Sitzung).
3. `session/prompt` startet einen Turn. Der Agent sendet `session/update`, fordert bei Bedarf Freigaben oder Datei-/Terminalaktionen an. Der Client beantwortet diese entsprechend Fähigkeiten und Regeln. Die Antwort auf `session/prompt` beendet den Turn.
4. Ein Orchestrator kann ein Ergebnis aus Sitzung A als Kontext in Sitzung B senden. **Diese Vermittlung ist Anwendungslogik, kein automatisch entstehender ACP-Agentenkanal.** Ein Agent kann auch selbst ACP-Client eines Unteragenten sein, wenn dies implementiert wurde.

A2A wurde von Google initiiert und wird unter der Linux Foundation weitergeführt. Es adressiert die Kooperation unabhängiger Agentendienste mit eigener Agentenbeschreibung und Aufgaben-/Ergebnisverwaltung. ACP-Unterstützung bedeutet weder A2A-Unterstützung noch automatische Agent-zu-Agent-Kommunikation.

Ein normaler Browser kann lokale stdio-Prozesse nicht direkt starten. Er braucht eine lokale Brücke/Integration. Dass Xcode, Cursor oder ein Grok-bezogenes Produkt installiert ist, belegt keine konkrete Protokollrolle. Cursor CLI ist in der offiziellen ACP-Agentenliste verlinkt. Für Grok und A2A muss die konkrete Anwendung/Version/der Adapter geprüft werden; das Beispiel behauptet diese Unterstützung nicht.

Die detaillierte Erklärung und anklickbare Quellen stehen unter **ACP verstehen**. `QUELLEN.md` enthält dieselben Referenzen. Das Beispiel ist ein Anwendungsentwurf; es führt keine ACP- oder A2A-Verbindungen aus.

## Grenzen und Prüfung

- Vollständiger offizieller DSL-Parse vor jeder Anzeige/Speicherung, Layout als SVG über Graphviz.
- HTTP-/Backend-Integrationstests prüfen Kompilierung, Projekttrennung, Snapshot-Restore, Template-Pins, Update und Fehlerfälle. Nach dem einmaligen Bootstrap führt `python3 tests.py` sie isoliert aus.
- Syntaxprüfung von Python und Browser-JavaScript durchgeführt. In dieser Ausführungsumgebung war keine vom Sites-Workflow unterstützte Browsersteuerung verfügbar; visuelle Browserabnahme steht aus.
- Lokale Versionierung ohne Branches, automatisches Zusammenführen oder semantischen Element-Diff. SQLite-Snapshots sind keine Git-Commits.
- Compilerstand ist bewusst fixiert. Neuere ACP-Inhalte ändern diese CLI-Version nicht. Bei Bedarf kann ein späterer offizieller CLI-Stand separat geprüft und die Distribution ausgetauscht werden.
- Schriftarten werden optional von Google Fonts geladen; ohne Netzwerk funktionieren die System-Fallbacks. Diagramme, Editor, Modelle und Templates benötigen beim normalen Betrieb kein Internet.
