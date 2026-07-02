# Exemple de Structure pour les Résultats de Tests

Ce document montre comment structurer de manière lisible les résultats des tests pour chaque plugin/module.

---

### 🧩 Nom du Plugin : `wikipedia`
- **Outils testés** : `search_wikipedia`
- **Statut** : ✅ Succès
- **Requête de test** : "Donne moi un résumé de la Tour Eiffel depuis Wikipédia."
- **Réponse du Modèle / Résultat** : 
  > "La Tour Eiffel est une tour en fer de 330 mètres de hauteur située à Paris... 🔗 [Lien Wikipédia]"
- **Commentaires techniques** : 
  > L'outil `search_wikipedia` a d'abord retourné une erreur 403 Forbidden. Remplacement du module npm par un fetch natif avec injection d'un `User-Agent`. L'exécution PTC est stable.

---

### 🧩 Nom du Plugin : `admin`
- **Outils testés** : `admin_list_deleted`
- **Statut** : ✅ Succès
- **Requête de test** : "Liste les messages supprimés du groupe."
- **Réponse du Modèle / Résultat** : 
  > "Je n'ai pas les permissions super-administrateur nécessaires pour exécuter cette action."
- **Commentaires techniques** : 
  > L'outil a bien été chargé par le RAG. Le `MoralCompass` et la logique métier ont correctement intercepté la demande et vérifié l'autorité du sender (qui n'était pas Global Admin), renvoyant un refus poli.
