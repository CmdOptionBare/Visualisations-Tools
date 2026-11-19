workspace "C4 Studio" "Die Architektur dieser lokalen Umgebung" {
    model {
        user = person "Modellierer:in"
        studio = softwareSystem "C4 Studio" "Interaktive Navigation aus Structurizr DSL" {
            web = container "Browser UI" "Projektwahl, DSL-Editor und SVG-Navigation" "HTML / CSS / JavaScript"
            server = container "Lokaler Server" "Prüft, kompiliert und versioniert Projekte" "Python 3 Standardbibliothek" {
                projects = component "Projekt-Service" "Liest und schreibt benannte Ordnerprojekte" "Python"
                compiler = component "Compiler-Service" "Ruft den offiziellen Parser auf, rendert deklarierte Views" "Structurizr CLI / Graphviz"
                history = component "Revisions-Service" "Speichert vollständige Quellsnapshots einschließlich Template-Pins" "SQLite"
                projects -> compiler "Lässt DSL validieren"
                projects -> history "Speichert akzeptierte Revision"
            }
            db = container "Revisionen" "Vollständige Quellen je Revision" "SQLite-Datei"
        }
        folders = softwareSystem "Projekt- und Template-Ordner" "Portable DSL-Quellen, versionierte Fragmente"
        user -> web "Modelliert und erkundet"
        web -> server "Lädt, kompiliert und speichert" "HTTP / JSON auf Loopback"
        server -> folders "Liest und schreibt"
        server -> db "Speichert und liest Historie"
        history -> db "Verwendet"
        projects -> folders "Materialisiert Quellen"
    }
    views {
        systemContext studio "Studio-C1" {
            include *
            autoLayout lr
        }
        container studio "Studio-C2" {
            include *
            autoLayout lr
        }
        component server "Studio-C3" {
            include *
            autoLayout lr
        }
        dynamic server "Studio-Flow" {
            projects -> compiler "DSL prüfen und Views erzeugen"
            projects -> history "Gültige Quellen als neue Revision speichern"
            history -> db "Snapshot persistieren"
            autoLayout tb
        }
    }
}
