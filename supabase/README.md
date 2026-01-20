# �️ Configuration de la Base de Données (Supabase)

Ce dossier contient les scripts SQL nécessaires pour initialiser la base de données du bot.

## Étape 1 : Créer le Projet

1. Allez sur [https://supabase.com](https://supabase.com) et connectez-vous.
2. Créez un **Nouveau Projet**.
3. Une fois le projet prêt, notez les informations suivantes (disponibles dans **Settings > API**) :
   - **Project URL**
   - **Service Role Key** (⚠️ Utilisez bien la clé `service_role`, pas `anon`/`public`).

## Étape 2 : Initialiser les Tables

1. Dans le tableau de bord Supabase, allez dans la section **SQL Editor** (icône en forme de terminal `>_` dans la barre latérale).
2. Cliquez sur **+ New Query**.
3. Copiez l'intégralité du contenu du fichier `supabase_setup.sql` présent dans ce dossier.
4. Collez-le dans l'éditeur SQL de Supabase.
5. Cliquez sur **Run** (bouton vert).

> ✅ Cela va créer toutes les tables nécessaires (`users`, `memories`, `autonomous_goals`, etc.).

## Étape 3 : Permissions et Sécurité (Recommandé)

Pour garantir que le bot a bien tous les droits d'écriture et que la sécurité est active :

1. Créez une nouvelle requête (**+ New Query**).
2. Copiez le contenu de `fix_permissions_and_rls.sql`.
3. Collez-le dans l'éditeur et cliquez sur **Run**.

> 🛡️ Ce script configure les droits pour le `service_role` et active le RLS (Row Level Security) sur toutes les tables.
