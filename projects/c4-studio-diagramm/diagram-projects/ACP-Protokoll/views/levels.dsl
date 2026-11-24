systemContext workbench "C1" {
    include *
    autoLayout lr
    title "C1 · Wer arbeitet mit wem?"
}
container workbench "C2" {
    include *
    autoLayout lr
    title "C2 · Client, Brücke und getrennte Agentenprozesse"
}
component bridge "C3" {
    include *
    autoLayout lr
    title "C3 · Komponenten des lokalen Clients"
}
dynamic bridge "C4-Flow" {
    ui -> router "Auftrag mit Kontext"
    router -> acp "initialize; danach session/new und session/prompt"
    acp -> permissions "Optional: session/request_permission oder Werkzeuganfrage"
    permissions -> acp "Entscheidung oder Werkzeugergebnis"
    acp -> router "session/update; danach Abschluss der Prompt-Anfrage"
    router -> ui "Ergebnis; optional Folgeauftrag an Agent B"
    autoLayout tb
    title "C4-Ersatz · Ablauf statt Code: exemplarischer Prompt-Turn"
}
