# 🗺️ HIVE-MIND v1.0 - Official Release Architecture
## Diagramme de Flux de l'Agent de Niveau Recherche (10/10)

Ce diagramme illustre le pipeline complet de traitement des messages pour la **Version 1.0 (Public Release)**, incluant la planification explicite, le système multi-agent et la boucle d'apprentissage automatique.

```mermaid
graph TD
    subgraph "1. Entrée & Contexte"
        A[Message WhatsApp] --> B[Enrichissement JID/LID]
        B --> C{Contexte Actif ?}
        C -- Non --> D[Retrieval RAG + Facts]
        C -- Oui --> E[ActionMemory: Resume Task]
        D --> F[Système de Mémoire]
        E --> F
    end

    subgraph "2. Couche Décisionnelle"
        F --> G{Complexe ?}
        G -- Oui [Planner] --> H[Explicit Planner: Decompose Goal]
        G -- Non [ReAct] --> I[ReAct Loop: Tool Selection]
        H --> J[Plan steps[]]
    end

    subgraph "3. Couche Exécution & Sécurité"
        J --> K[Pour chaque étape...]
        I --> L[Critique vs Executor]
        K --> L
        L --> M{Action Critique ?}
        M -- Oui --> N[Multi-Agent: Critic Check]
        M -- Non --> O[Moral Compass: Ethique]
        N --> O
        O --> P[Exécution de l'Outil]
    end

    subgraph "4. Bouche d'Apprentissage (Feedback)"
        P --> Q[Post-Action Evaluator]
        Q -- Succès --> R[Dream Service: Consolidation]
        Q -- Échec --> S[Replanification / Circuit Breaker]
        Q -- Stats --> T[Table: action_scores]
        T --> U[View: tool_performance]
    end

    subgraph "5. Sortie & Persistance"
        P --> V[FuzzyMatcher: Formatage]
        V --> W[Envoi WhatsApp]
        W --> X[MemoryDecay: Nightly Cleanup]
    end

    subgraph "Mémoire & Data"
        DB1[(Redis: Working Memory)] --- F
        DB2[(Supabase: Memories)] --- F
        DB2 --- X
        DB3[(Supabase: Stats)] --- U
    end

    style H fill:#f96,stroke:#333
    style N fill:#f66,stroke:#333
    style Q fill:#6f9,stroke:#333
    style X fill:#69f,stroke:#333
```

### 💎 Points Clés de la v1.0

1.  **Planificateur Explicite (Module 10/10)** : Décompose les tâches complexes avant l'exécution pour une fiabilité maximale.
2.  **Multi-Agent Critic (Module 10/10)** : Empêche les actions impulsives ou risquées (ban, suppression) via une double vérification par IA.
3.  **Action Evaluator (Module 10/10)** : Calcule un score de qualité pour chaque action et apprend des feedbacks utilisateur.
4.  **Memory Decay (Module 10/10)** : Gère l'importance des souvenirs pour éviter que le bot ne devienne "fou" ou surchargé.
5.  **ActionMemory** : Permet de gérer les changements de sujet sans perdre l'objectif principal.

---
*Document généré pour la transition vers la Publication v1.0 (Flagship Release).*
