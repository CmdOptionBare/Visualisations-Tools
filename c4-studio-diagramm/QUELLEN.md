# Quellen und Umsetzung

Gelesen am 7. November 2026. Dokumentation kann sich ändern; Protokollrollen sind von einzelnen Produktimplementierungen zu unterscheiden.

- ACP-Einführung: https://agentclientprotocol.com/get-started/introduction
- ACP-Nachrichtenmodell und Ablauf: https://agentclientprotocol.com/protocol/overview
- ACP-Agenten einschließlich Cursor CLI: https://agentclientprotocol.com/get-started/agents
- ACP-Clients und Integrationen: https://agentclientprotocol.com/get-started/clients
- Cursor CLI / ACP: https://cursor.com/docs/cli/acp
- A2A: https://a2a-protocol.org/latest/topics/what-is-a2a/
- Structurizr Includes: https://docs.structurizr.com/dsl/includes
- Structurizr Sprache und dynamische Views: https://docs.structurizr.com/dsl/language
- Offizielle CLI, verwendeter Release: https://github.com/structurizr/cli/releases/tag/v2025.11.09
- StructurizrVisualizr: https://github.com/semljola/StructurizrVisualizr
- Spacerizr: https://github.com/tobiascervin/spacerizr

Beide Community-Viewer sind interessante Referenzen; ihre READMEs beschreiben eigene DSL-Parser. Dieses Studio verwendet keinen Code aus diesen Projekten. Die eigene Browseroberfläche navigiert in den Views, die der offizielle Java-Parser aus der vollständigen DSL erzeugt. Graphviz rendert die Ansicht; die Darstellung ist ein eigenes reduziertes Theme.

Die vom Nutzer hochgeladene Datenbankübersicht wurde als Kontext gelesen. Die aufgeführten Datenbanken wurden weder integriert noch umfassend gegeneinander geprüft. SQLite wurde als mit Python ausgelieferter lokaler Revisionsspeicher gewählt. Das ist eine Implementierungsentscheidung, kein Benchmarkurteil über die Graph-Datenbankliste.

## Fremdsoftware

`bootstrap.py` installiert unter `tools/structurizr/` die unveränderte offizielle CLI-Distribution samt abhängigen Java-Bibliotheken. Die CLI steht unter Apache-2.0; mitgelieferte Abhängigkeiten haben eigene Lizenzen. Siehe `THIRD-PARTY.md` und die Metadaten der enthaltenen JAR-Dateien. Java und Graphviz müssen auf dem Zielsystem installiert sein.
