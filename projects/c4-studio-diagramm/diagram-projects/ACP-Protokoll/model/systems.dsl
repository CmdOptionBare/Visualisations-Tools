user = person "Entwickler:in" "Gibt Aufgaben frei und prüft Ergebnisse."
workbench = softwareSystem "Agenten-Arbeitsplatz" "Ein Client steuert Agenten. Kooperation braucht eine Vermittlung." {
    browser = container "Browser-Oberfläche" "Zeigt Aufgaben, Streams und Freigaben. Ein Browser kann lokale stdio-Prozesse nicht direkt starten." "Web UI"
    bridge = container "Lokaler Client & Orchestrator" "ACP-Client; startet Agenten und vermittelt Aufgaben zwischen getrennten Sitzungen." "Lokaler Prozess" {
        ui = component "Auftragseingang" "Nimmt Prompt und Projektkontext entgegen." "Client"
        router = component "Orchestrator" "Wählt einen Agenten und übergibt Ergebnisse bei Bedarf an einen zweiten." "Eigene Anwendungslogik"
        acp = component "ACP-Verbindung" "JSON-RPC 2.0: initialize, session/new, session/prompt, session/update." "stdio"
        permissions = component "Freigabe & Werkzeuge" "Bearbeitet agentenseitige Datei-, Terminal- und Berechtigungsanfragen gemäß Fähigkeiten." "Client callbacks"
    }
    agentA = container "Agent A · z. B. Cursor CLI" "Eigenständiger Agentenprozess mit ACP-Schnittstelle; kein automatischer Peer-Kanal." "ACP-Agent"
    agentB = container "Agent B · kompatible CLI" "Separate Sitzung. Grok-Unterstützung muss für das konkrete Produkt geprüft werden." "ACP-Agent oder Adapter"
}
llm = softwareSystem "Modellanbieter" "LLM-Inferenz über die vom Agenten gewählte API; ACP ist kein Modell-API-Protokoll."
remote = softwareSystem "Entfernter Agent (optional)" "A2A-Endpunkt oder Adapter nötig. ACP allein stellt diesen nicht bereit."
