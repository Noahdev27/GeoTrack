# Prompts d'exécution — GeoTrack V2

Ces prompts pilotent le passage à l'échelle décrit dans [`CAHIER_DES_CHARGES.md`](./CAHIER_DES_CHARGES.md). Il y en a **un par lot**, dans l'ordre de la feuille de route.

## Mode d'emploi

1. Ouvrir une session Claude Code sur le dépôt. `CLAUDE.md` est chargé automatiquement : il contient les conventions.
2. Coller **le prompt du lot** (bloc de code ci-dessous), tel quel ou complété.
3. Une session = un lot = une branche = une PR. Ne pas enchaîner deux lots dans la même PR.
4. Avant le lot suivant, vérifier que la PR précédente est mergée et que la CI est verte.
5. Si un lot dépend d'une décision (D1–D5), la trancher d'abord : le prompt s'arrête et pose la question si elle ne l'est pas.

Chaque prompt suit la même structure : **Objectif → Contexte → Tâches → Contraintes → Critères d'acceptation → Vérifications → Livrable**.

---

## Préambule commun (inclus implicitement via CLAUDE.md)

```text
Tu travailles sur GeoTrack (React 19 + TypeScript strict + Vite 7 + Capacitor 8 Android + Leaflet).
Lis d'abord CLAUDE.md, docs/CAHIER_DES_CHARGES.md et le code concerné avant de modifier quoi que ce soit.
Règles : changements minimaux et ciblés ; code et commentaires en français cohérents avec l'existant ;
pas de dépendance ajoutée sans vérifier sa compatibilité (version, peerDependencies Capacitor 8, date de publication) ;
chaque nouvelle logique a ses tests ; `npm run typecheck && npm test && npm run build` doivent passer avant tout commit ;
ne jamais committer de secret ; mettre à jour README et docs si le comportement change.
Si une information manque pour une décision produit, pose la question au lieu de supposer.
```

---

## Phase 0 — Fondations

### L0.1 — Lint, tests de composants et E2E

```text
Objectif : rendre la qualité vérifiable automatiquement avant de faire grossir le projet.

Contexte : aucun linter ; 36 tests Vitest en environnement node (utils/services) ; pas de tests
de composants ni E2E ; CI dans .github/workflows/android.yml (jobs web + android-apk).

Tâches :
1. Ajouter ESLint 9 (flat config) avec typescript-eslint, eslint-plugin-react-hooks et
   eslint-plugin-react-refresh, plus Prettier (aligné sur le style actuel : 2 espaces,
   quotes simples, point-virgules, ~120 colonnes). Corriger toutes les erreurs remontées,
   en particulier les dépendances de hooks, sans changer le comportement.
2. Ajouter les tests de composants : Vitest en environnement jsdom pour les fichiers *.test.tsx,
   avec @testing-library/react. Couvrir Dashboard (formatage et état vide), Controls
   (boutons selon le statut, désactivation du mode pendant un suivi) et TripHistory
   (liste vide, sélection, suppression avec confirmation).
3. Tester useTracker avec renderHook : démarrage en simulation, pause, reprise (nouveau
   segment), arrêt (sauvegarde + synchro), reprise d'un trajet actif restauré. Mocker
   @capacitor/preferences, @capacitor/network et @capacitor/geolocation, et utiliser les fake timers.
4. Ajouter un E2E Playwright (tests/e2e) qui sert le build avec `vite preview` et vérifie :
   simulation ×10 → distance > 0 après 3 s → Pause → Terminer → le trajet apparaît dans
   l'historique ; puis le passage hors-ligne (context.setOffline) affiche « Hors-ligne » et
   un trajet terminé reste « En attente » jusqu'au retour du réseau.
   Les tuiles OSM peuvent être bloquées : les intercepter (page.route) et renvoyer une image vide.
5. Ajouter les scripts npm `lint`, `format`, `test:coverage` et `test:e2e`. Faire exécuter
   lint + coverage + e2e par le job CI `web`, avec un seuil de couverture de 80 % sur
   src/utils et src/services.

Contraintes : ne pas modifier la logique métier, sauf pour corriger un vrai bug trouvé par
les tests (le signaler dans la PR).

Critères d'acceptation :
- `npm run lint` passe sans erreur ni avertissement.
- Les tests unitaires, de composants et de hooks passent, avec une couverture utils/services ≥ 80 %.
- L'E2E passe en local et en CI.
- La CI est verte sur la PR.

Vérifications : npm run lint && npm run typecheck && npm run test:coverage && npm run build && npm run test:e2e

Livrable : branche `feat/l0.1-qualite`, PR « L0.1 — Lint, tests de composants et E2E ».
```

### L0.2 — Release Android signée

```text
Objectif : produire un APK et un AAB release signés et versionnés automatiquement à chaque tag.

Contexte : la CI produit seulement un APK debug. android/app/build.gradle est celui généré par Capacitor.

Tâches :
1. Configurer signingConfigs.release dans android/app/build.gradle en lisant des variables
   d'environnement (GEOTRACK_KEYSTORE_PATH, GEOTRACK_KEYSTORE_PASSWORD, GEOTRACK_KEY_ALIAS,
   GEOTRACK_KEY_PASSWORD). Si elles sont absentes, le build debug doit continuer de fonctionner.
2. Dériver versionName du tag git (vX.Y.Z), ou de package.json à défaut, et versionCode de
   X*10000 + Y*100 + Z.
3. Ajouter un workflow `.github/workflows/release.yml`, déclenché par un tag `v*`. Il décode
   le keystore depuis le secret GEOTRACK_KEYSTORE_BASE64, lance `npm ci`, `npm run cap:sync`,
   `./gradlew assembleRelease bundleRelease`, puis publie une GitHub Release avec l'APK, l'AAB
   et l'extrait du CHANGELOG correspondant.
4. Créer CHANGELOG.md (format Keep a Changelog) avec la 0.1.0 (MVP).
5. Documenter dans le README : comment générer un keystore (keytool), quels secrets créer,
   et comment publier (git tag v0.2.0 && git push --tags).

Contraintes : aucun keystore ni mot de passe dans le dépôt. Vérifier que .gitignore exclut *.jks et *.keystore.

Critères d'acceptation :
- Sans secrets, `assembleDebug` fonctionne toujours en CI.
- Avec les secrets, un tag produit une Release contenant un APK et un AAB signés
  (vérifiables avec apksigner verify).
- versionName et versionCode correspondent au tag.

Vérifications : CI verte. Si les secrets sont absents du dépôt, l'indiquer dans la PR et
donner la procédure exacte à l'utilisateur.

Livrable : branche `feat/l0.2-release`, PR « L0.2 — Release Android signée ».
```

---

## Phase 1 — Mobile robuste

### L1.1 — Stockage SQLite et moteur de trajet incrémental

```text
Objectif : supporter des trajets longs (20 000+ points) sans dégradation, avec une écriture
append-only et des stats en O(1) par point.

Contexte : src/services/storage.ts (Preferences : JSON complet réécrit) ; useTracker recalcule
computeStats sur tous les points à chaque tick ; MapView rend tous les points.

Tâches :
1. Vérifier la dernière version de @capacitor-community/sqlite compatible avec Capacitor 8
   (peerDependencies). Si aucune ne l'est, s'arrêter et proposer une alternative avant de coder.
2. Créer une couche `src/services/db/` :
   - interface `TripRepository` (createTrip, appendPoints, finishTrip, getTrip, listSummaries,
     deleteTrip, markSynced, listUnsynced, getActiveTrip) ;
   - une implémentation SQLite (natif) et une implémentation IndexedDB (web, pour dev et E2E) ;
   - un schéma versionné avec les tables trips, points (index trip_id+timestamp) et sync_queue,
     plus des migrations numérotées.
3. Migrer les données existantes : au premier lancement, lire les clés Preferences
   `geotrack:*`, les insérer en base, puis les supprimer. Rendre l'opération idempotente.
4. Créer `src/services/tripEngine.ts` : un accumulateur incrémental (distance, max, segment
   courant, dernier point) qui ingère un point en O(1). Des tests vérifient qu'il donne
   exactement les mêmes résultats que computeStats sur des jeux aléatoires (property-based
   test simple avec seed).
5. Faire de useTracker un simple consommateur : le moteur garde l'état et les points sont
   écrits par lots (toutes les 2 s ou tous les 20 points).
6. MapView : simplifier la polyline (Douglas-Peucker, tolérance selon le zoom) au-delà de
   2 000 points, avec memoization par segment.

Contraintes : garder l'API publique des hooks compatible avec App.tsx ; aucun changement
visuel ; tous les tests existants passent, ou sont adaptés quand ils mockaient Preferences.

Critères d'acceptation :
- Benchmark Vitest : l'ingestion de 20 000 points prend moins de 200 ms, et l'ajout d'un
  point ne réécrit pas le trajet.
- Les données MVP sont migrées sans perte (test dédié).
- Un trajet de 20 000 points simulés reste fluide dans l'E2E (temps d'ouverture du détail < 1 s).

Vérifications : lint, typecheck, tests, build, e2e, cap sync android, CI verte.

Livrable : branche `feat/l1.1-sqlite`, PR « L1.1 — SQLite + moteur incrémental ».
```

### L1.2 — Suivi en arrière-plan Android

```text
Objectif : le suivi continue écran éteint et app en arrière-plan, sans perte de points (objectif O1).

Contexte : useGeolocation utilise @capacitor/geolocation (premier plan uniquement). La WebView
est suspendue en arrière-plan.

Tâches :
1. Évaluer, dans cet ordre : (a) @capacitor-community/background-geolocation (compatibilité
   Capacitor 8, maintenance, foreground service) ; (b) un plugin Capacitor local dans
   android/ (Kotlin) : FusedLocationProviderClient + Foreground Service de type `location`
   + notification persistante + écriture des points en SQLite native (write-ahead).
   Choisir et justifier dans la PR. Si (a) n'écrit pas en natif pendant que la WebView dort,
   choisir (b).
2. Notification persistante : titre, distance en cours, actions Pause et Terminer qui
   pilotent le service.
3. Permissions progressives : localisation au premier plan → écran explicatif →
   ACCESS_BACKGROUND_LOCATION (Android 10+) → POST_NOTIFICATIONS (Android 13+).
   Déclarer FOREGROUND_SERVICE et FOREGROUND_SERVICE_LOCATION dans le manifeste.
4. Au retour au premier plan, ou au redémarrage après un kill, l'app relit les points écrits
   par le natif et les fusionne dans le trajet (sans doublon, par timestamp).
5. Précision adaptative : intervalle de 1 s en mouvement, 10 s après 3 minutes d'arrêt
   (vitesse < 1 km/h).
6. Écran d'aide « Optimisation batterie » : intent ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
   et liens vers dontkillmyapp.com selon le fabricant.
7. La simulation reste en JS (outil de dev) ; le GPS réel passe par le service.

Contraintes : le mode Simulation et le web continuent de fonctionner (fallback
@capacitor/geolocation sur le web). Aucun suivi ne démarre sans action explicite de l'utilisateur.

Critères d'acceptation :
- assembleDebug passe en CI ; les nouveaux tests TS (fusion des points natifs, machine à
  états des permissions) passent.
- Checklist de test manuel ajoutée dans docs/TESTS_MANUELS.md : 30 min écran éteint →
  trace continue ; kill de l'app depuis les récents → reprise sans perte ; refus de la
  permission arrière-plan → message clair et suivi au premier plan seulement.

Vérifications : lint, typecheck, tests, build, cap sync, CI verte. Signaler explicitement
dans la PR ce qui n'a pas pu être vérifié sur un appareil réel.

Livrable : branche `feat/l1.2-background`, PR « L1.2 — Suivi en arrière-plan ».
```

### L1.3 — Export GPX / GeoJSON / CSV

```text
Objectif : permettre d'exporter et de partager un trajet.

Tâches :
1. Ajouter src/utils/export.ts : toGPX(trip) (GPX 1.1 valide, un <trkseg> par segment,
   <time> ISO, <ele> si l'altitude est connue), toGeoJSON(trip) (MultiLineString +
   propriétés de stats) et toCSV(trip) (en-tête, séparateur `;`, décimales `.`).
2. Ajouter un bouton « Exporter » dans le détail d'un trajet : choix du format, puis
   @capacitor/filesystem + @capacitor/share sur natif, téléchargement via Blob sur le web.
3. Tests : snapshot de chaque format sur un trajet fixe, et validation de structure
   (le GPX se parse avec DOMParser, le GeoJSON a des coordonnées [lng, lat]).

Critères d'acceptation : les 3 formats s'ouvrent correctement (GPX dans un viewer standard,
GeoJSON sur geojson.io) ; tests verts ; CI verte.

Livrable : branche `feat/l1.3-export`, PR « L1.3 — Export de trajets ».
```

---

## Phase 2 — Backend

### L2.1 — Monorepo et package partagé

```text
Objectif : préparer l'arrivée du dashboard web sans dupliquer les types ni la logique géo.

Tâches :
1. Passer en npm workspaces : apps/mobile (déplacer l'app actuelle avec android/,
   capacitor.config.ts, vite.config.ts…), apps/dashboard (squelette Vite + React + TS)
   et packages/shared.
2. packages/shared : types (src/types), utils geo et format, et plus tard le client API.
   L'app mobile les importe via `@geotrack/shared`.
3. Adapter les scripts racine (dev:mobile, dev:dashboard, test, lint, build), les chemins
   Capacitor (webDir), la CI (cache, chemins android/) et le README.
4. Utiliser `git mv` pour conserver l'historique.

Contraintes : aucun changement fonctionnel ; l'APK debug doit toujours sortir de la CI.

Critères d'acceptation : `npm test` à la racine exécute tous les workspaces ; les jobs
web et android-apk sont verts ; `apps/dashboard` affiche une page vide qui importe un util partagé.

Livrable : branche `chore/l2.1-monorepo`, PR « L2.1 — Monorepo ».
```

### L2.2 — Supabase : schéma, RLS et authentification

```text
Prérequis : décision D1 = Supabase (sinon s'arrêter et demander).

Objectif : un backend sécurisé multi-tenant avec authentification.

Tâches :
1. Créer supabase/ (CLI) avec des migrations SQL : extension postgis ; tables organizations,
   profiles (id = auth.uid, org_id, role enum driver|dispatcher|admin, display_name),
   trips (id uuid fourni par le client, org_id, driver_id, mode, started_at, ended_at,
   stats jsonb, updated_at), track_points (trip_id, recorded_at, geom geography(Point,4326),
   accuracy, speed, altitude, segment ; PK (trip_id, recorded_at)) et driver_positions
   (driver_id PK, org_id, geom, speed, heading, updated_at).
2. Politiques RLS : un driver lit et écrit uniquement ses trips, points et sa position ;
   un dispatcher ou admin lit tout son org_id ; personne ne lit hors de son org. Écrire
   des tests SQL des politiques (pgTAP ou scripts exécutés en CI avec `supabase start`).
3. Trigger : à la création d'un utilisateur, créer son profile (org et rôle fournis par
   une invitation ; la table invitations fait partie de ce lot).
4. Mobile : écran de connexion (email + magic link ou mot de passe) avec @supabase/supabase-js.
   Session persistée via un adaptateur de stockage Capacitor (Preferences ou SecureStorage),
   et déconnexion. Le mode Simulation reste accessible sans compte (mode démo).
5. Variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.example ; jamais de
   service_role côté client.

Contraintes : toutes les écritures passent par RLS ; aucune clé secrète dans le dépôt ou l'APK.

Critères d'acceptation : les tests RLS prouvent l'isolation (driver A ≠ driver B ; org X ≠ org Y) ;
connexion et déconnexion fonctionnent sur le web et Android ; CI verte (job supabase ajouté).

Livrable : branche `feat/l2.2-supabase`, PR « L2.2 — Backend Supabase + Auth ».
```

### L2.3 — Synchronisation incrémentale réelle

```text
Objectif : envoyer les trajets et points au backend pendant le trajet, de façon
idempotente et résiliente (objectif O4).

Contexte : src/services/sync.ts (SyncService, file + backoff) ; TripRepository (L1.1) avec sync_queue.

Tâches :
1. Créer un SupabaseTransport : upsert trips par id ; insertion des points par lots de
   500 maximum avec onConflict (trip_id, recorded_at) ignore ; upsert driver_positions
   avec la dernière position.
2. Pendant un suivi, envoyer toutes les 15 s ou tous les 50 points si le réseau est
   disponible. Le curseur de synchro par trajet est stocké en base (last_synced_timestamp).
3. Erreurs : 401 → rafraîchir la session puis réessayer une fois ; 4xx de validation →
   marquer en erreur sans boucler ; 5xx ou réseau → backoff existant.
4. StatusBar : afficher le nombre de points en attente et l'heure de la dernière synchro.
5. Tests : SyncService avec un transport simulé qui échoue aléatoirement (seed) ; vérifier
   qu'au final tous les points sont envoyés exactement une fois (déduplication par clé).

Critères d'acceptation : un trajet de 4 h simulé hors-ligne, puis en ligne, se retrouve
complet côté serveur (test d'intégration contre `supabase start` en CI) ; aucun doublon ; CI verte.

Livrable : branche `feat/l2.3-sync`, PR « L2.3 — Synchronisation Supabase ».
```

---

## Phase 3 — Opérations

### L3.1 — Dashboard dispatcher

```text
Objectif : le dispatcher voit sa flotte en direct et consulte l'historique (F4).

Tâches :
1. apps/dashboard : authentification (rôle dispatcher ou admin requis, sinon page « accès refusé »).
2. Vue « Flotte » : carte Leaflet avec un marqueur par livreur depuis driver_positions
   (abonnement Supabase Realtime) ; couleur selon la fraîcheur (< 1 min vert, < 10 min
   orange, sinon gris) ; panneau latéral listant les livreurs, avec recherche.
3. Vue « Trajets » : tableau paginé côté serveur (filtres livreur et date), détail avec
   tracé, stats et rejeu animé (curseur de temps).
4. Vue « Rapports » : km et temps de conduite par livreur et par jour sur une période,
   avec export CSV. Agrégation SQL via une vue ou une fonction RPC.
5. Réutiliser @geotrack/shared (types, format, geo) et les composants de carte, à
   extraire si besoin.
6. Tests de composants et E2E Playwright contre Supabase local, avec des données seedées.

Critères d'acceptation : une position envoyée par un livreur apparaît sur la carte en
moins de 5 s (test E2E) ; un dispatcher ne voit que son organisation ; responsive jusqu'à
la tablette ; CI verte.

Livrable : branche `feat/l3.1-dashboard`, PR « L3.1 — Dashboard dispatcher ».
```

### L3.2 — Missions de livraison, géofencing et preuve de livraison

```text
Objectif : le livreur exécute des missions assignées et prouve la livraison (F5).

Tâches :
1. Migration : table deliveries (id, org_id, driver_id, address, geom, window_start,
   window_end, recipient_name, recipient_phone, notes, status enum, timestamps par statut)
   et delivery_proofs (delivery_id, photo_path, signature_path, comment, geom, created_at),
   avec RLS et un bucket Storage `proofs` (accès par org).
2. Dashboard : création de mission (géocodage d'adresse via Nominatim avec respect de la
   politique d'usage, ou fournisseur choisi en D3), assignation et liste par statut.
3. Mobile : onglet « Missions du jour » synchronisé et disponible hors-ligne (table locale
   deliveries) ; mission en cours sur la carte ; bouton « Naviguer » (intent geo: / lien
   Google Maps) ; transitions de statut.
4. Géofencing : passage automatique en `arrived` dans un rayon de 100 m (configurable),
   détecté par le moteur de trajet, avec une notification locale.
5. Preuve : photo (@capacitor/camera, compressée à moins de 500 Ko), signature (canvas)
   et commentaire, stockés localement puis envoyés à la synchro (upload Storage + ligne
   delivery_proofs).

Critères d'acceptation : le cycle complet fonctionne hors-ligne puis se synchronise ;
tests de la machine à états des statuts et du géofencing ; E2E dashboard → mobile (web) → dashboard ; CI verte.

Livrable : branche `feat/l3.2-missions`, PR « L3.2 — Missions de livraison ».
```

### L3.3 — Lien de suivi client et heure d'arrivée estimée

```text
Objectif : le destinataire suit sa livraison sans compte (F6).

Tâches :
1. Table tracking_links (token aléatoire ≥ 128 bits, delivery_id, expires_at), générée
   au passage en `en_route` et expirée une heure après `delivered`.
2. Edge Function `track` (GET ?token=) : renvoie uniquement { statut, position livreur
   arrondie, eta, fenêtre } sans exposer de données internes, avec rate limiting par IP.
3. Page publique dans apps/dashboard (/t/:token) : carte avec le livreur et la destination,
   statut, heure estimée, rafraîchissement toutes les 10 s ; « lien expiré » proprement.
4. ETA : distance restante (haversine × facteur de détour 1,3) / vitesse moyenne des
   10 dernières minutes (plancher 10 km/h). Fonction pure testée dans @geotrack/shared.
5. Partage du lien depuis le dashboard (copier) et le mobile (@capacitor/share).

Contraintes : aucune donnée personnelle du livreur (nom complet, téléphone) ni historique
de tracé exposés publiquement.

Critères d'acceptation : un token invalide ou expiré renvoie 404 ; tests de l'ETA ; E2E de
la page publique ; revue sécurité (pas d'énumération, pas de fuite) décrite dans la PR ; CI verte.

Livrable : branche `feat/l3.3-lien-client`, PR « L3.3 — Lien de suivi client ».
```

---

## Phase 4 — Confort

### L4.1 — Cartes hors-ligne

```text
Prérequis : décision D3 (fournisseur de tuiles) prise.

Objectif : le fond de carte reste disponible sans réseau (F7).

Tâches :
1. Rendre la source de tuiles configurable (URL, attribution, clé via variable d'environnement).
2. Cache : intercepter le chargement des tuiles (TileLayer personnalisé) avec un stockage
   en IndexedDB sur le web et en Filesystem/SQLite sur natif ; LRU limité à 200 Mo
   (paramétrable) ; consultation du cache d'abord quand le réseau est absent.
3. Pré-téléchargement : sélection d'une zone (rectangle) avec estimation du nombre de
   tuiles et de la taille (zooms 10–17), téléchargement en arrière-plan avec progression
   et annulation, en respectant les conditions du fournisseur.
4. Paramètres : espace utilisé, bouton « Vider le cache ».
Évaluer leaflet.offline avant d'écrire une solution maison, et justifier le choix.

Critères d'acceptation : en E2E avec context.setOffline(true), une zone préchargée
s'affiche ; la limite de taille est respectée (test) ; CI verte.

Livrable : branche `feat/l4.1-offline-maps`, PR « L4.1 — Cartes hors-ligne ».
```

### L4.2 — Notifications

```text
Objectif : informer le livreur des missions et des oublis (F8).

Tâches :
1. Push FCM via @capacitor/push-notifications : enregistrement du token dans une table
   device_tokens (RLS) ; Edge Function déclenchée à l'insertion ou modification d'une
   delivery assignée ; un tap ouvre la mission.
2. Notification locale (@capacitor/local-notifications) : « Suivi en pause depuis 30 min ».
3. Documenter la configuration Firebase (google-services.json non commité, injecté en CI
   via un secret).

Critères d'acceptation : tests de la logique de déclenchement ; procédure de test manuel
dans docs/TESTS_MANUELS.md ; CI verte sans secret Firebase (build conditionnel).

Livrable : branche `feat/l4.2-notifications`, PR « L4.2 — Notifications ».
```

### L4.3 — Statistiques avancées et lissage

```text
Objectif : un historique exploitable et un tracé plus propre (F9).

Tâches :
1. Filtre de Kalman 2D (position + vitesse) dans @geotrack/shared, appliqué en option à
   l'affichage. Les points bruts restent stockés.
2. Détection des arrêts (> 2 min, rayon de 30 m), affichés sur la carte et dans les stats.
3. Graphiques vitesse et altitude dans le détail d'un trajet (bibliothèque légère, à choisir
   en vérifiant la taille du bundle), avec curseur synchronisé avec la carte.
4. Écran « Résumé de la semaine » (km, temps, nombre de trajets et de livraisons).

Critères d'acceptation : tests du Kalman (réduction du RMS sur une trace bruitée générée)
et de la détection d'arrêts ; bundle mobile < +80 Ko gzip ; CI verte.

Livrable : branche `feat/l4.3-stats`, PR « L4.3 — Statistiques avancées ».
```

### L4.4 — Paramètres, i18n et RGPD

```text
Objectif : personnalisation, langue anglaise et conformité vie privée (F10, exigences RGPD).

Tâches :
1. Écran Paramètres : unités km/mi, précision GPS (éco, standard, haute), thème
   (auto, clair, sombre) et taille du cache de cartes. Valeurs persistées et appliquées
   immédiatement.
2. i18n : extraire tous les textes (mobile et dashboard) dans des fichiers fr.json et
   en.json (react-i18next ou solution légère) ; formats dates et nombres via Intl selon la
   langue ; test qui échoue si une clé manque dans une langue.
3. RGPD : écran de consentement au premier lancement (finalité, durée de conservation) ;
   export de toutes mes données (JSON) ; suppression du compte (Edge Function qui supprime
   les données de l'utilisateur) ; rétention serveur configurable par organisation
   (pg_cron qui purge les points de plus de N jours).
4. Rédiger docs/CONFIDENTIALITE.md (base de la politique de confidentialité exigée par Google Play).

Critères d'acceptation : aucun texte en dur restant (vérifié par une règle de lint ou un
script) ; suppression du compte testée de bout en bout ; CI verte.

Livrable : branche `feat/l4.4-parametres-rgpd`, PR « L4.4 — Paramètres, i18n, RGPD ».
```

---

## Prompts transverses (à tout moment)

### Revue avant merge

```text
Fais une revue complète de la PR courante : bugs de logique, cas limites (offline,
permission refusée, kill de l'app, horloge qui recule, trajet vide), sécurité (RLS, fuite
de données de localisation, secrets), performance (re-renders, O(n) par tick) et
cohérence avec docs/CAHIER_DES_CHARGES.md. Corrige ce qui est certain, et liste ce qui
demande une décision.
```

### Débogage terrain

```text
Un utilisateur signale : « <symptôme exact, appareil, version Android, version app> ».
Reproduis d'abord le problème (test qui échoue, ou scénario Playwright ou simulation), puis
identifie la cause racine, corrige-la avec un test de non-régression et explique la cause
dans la PR. Pas de correctif sans reproduction ; si la reproduction est impossible ici,
dis-le et propose l'instrumentation à ajouter.
```

### Mise à jour du cahier des charges

```text
Le lot <Lx.y> est mergé. Mets à jour docs/CAHIER_DES_CHARGES.md (section 1 « état actuel »,
risques levés ou apparus, décisions prises) et CHANGELOG.md. Ne modifie pas le code.
```
