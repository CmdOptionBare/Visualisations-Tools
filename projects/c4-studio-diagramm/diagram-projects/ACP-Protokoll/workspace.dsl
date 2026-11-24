workspace "ACP verstehen" "Vom Editor zum Agenten – und zur orchestrierten Zusammenarbeit" {
    model {
        !include model/systems.dsl
        !include templates/Arbeitsplatz/1.0.0/environment.dsl
        !include model/relationships.dsl
    }
    views {
        !include views/levels.dsl
    }
}
