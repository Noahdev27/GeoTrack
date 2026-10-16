# Cahier des charges — GeoTrack V2 (passage à l'échelle)

> Version 1.1 — 16/10/2026 (phases 0 et 1 livrées)
> Point de départ : MVP livré (commit `9999e36`). Ce document décrit la cible produit, les exigences et la feuille de route. Les prompts d'exécution sont dans [`PROMPTS.md`](./PROMPTS.md).

---

## 1. Contexte et état actuel

### 1.1 Ce que fait le MVP

| Domaine            | État MVP                                                          | Fichiers                                                    |
| ------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| Carte temps réel   | Leaflet + OSM, tracé segmenté, marqueur orienté, suivi/recentrage | `src/components/MapView.tsx`                                |
| Source de position | Simulation (itinéraire Paris, ×1–×10) + GPS natif Capacitor       | `src/services/simulation.ts`, `src/hooks/useGeolocation.ts` |
| Métriques          | Distance, temps actif, vitesses moy./inst./max, filtrage du bruit | `src/utils/geo.ts`                                          |
| Offline            | Capacitor Preferences, reprise après crash                        | `src/services/storage.ts`                                   |
| Synchro            | File + backoff, serveur simulé ou `VITE_SYNC_ENDPOINT`            | `src/services/sync.ts`                                      |
| Android            | Projet Capacitor 8, permissions, APK debug via CI                 | `android/`, `.github/workflows/android.yml`                 |
| Tests              | 36 tests Vitest (utils, services)                                 | `src/**/*.test.ts`                                          |

### 1.2 Limites à lever — avancement

| #   | Limite initiale                                                            | État                                                                                                                                        |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pas de suivi en arrière-plan                                               | ✅ **L1.2** : service de premier plan Android (`@capacitor-community/background-geolocation`). À valider sur appareil (`TESTS_MANUELS.md`). |
| 2   | Pas de vrai backend (comptes, synchro réelle, multi-appareils)             | ⏳ Phase 2, bloquée par la **décision D1**                                                                                                  |
| 3   | Stockage qui ne tient pas la charge (JSON complet réécrit toutes les 10 s) | ✅ **L1.1** : SQLite (Android) / IndexedDB (web), points append-only, métriques O(1), tracé simplifié                                       |
| 4   | Pas de carte hors-ligne                                                    | ⏳ L4.1, bloquée par la **décision D3** (fournisseur de tuiles)                                                                             |
| 5   | Pas de dimension « livraison » (missions, preuve, dispatcher, client)      | ⏳ Phase 3 (après le backend)                                                                                                               |
| 6   | Qualité : pas de lint, ni tests de composants / E2E, ni APK release signé  | ✅ **L0.1 / L0.2** : ESLint + Prettier, 110 tests unitaires/composants/hooks, 4 E2E Playwright, release signée sur tag                      |

Livré en plus : export GPX / GeoJSON / CSV (**L1.3**), mise en page adaptée aux petits écrans.

---

## 2. Vision et objectifs

**Vision.** GeoTrack devient une solution complète de suivi de livraisons. Le livreur suit ses tournées sur mobile, même hors-ligne et écran éteint. Le dispatcher pilote la flotte en temps réel depuis un tableau de bord web. Le client final suit sa livraison via un lien.

**Objectifs mesurables (V2) :**

| #   | Objectif           | Indicateur                                            | Cible                                          |
| --- | ------------------ | ----------------------------------------------------- | ---------------------------------------------- |
| O1  | Fiabilité du suivi | Points perdus sur un trajet d'1 h écran éteint        | < 1 %                                          |
| O2  | Autonomie          | Consommation batterie en suivi standard               | ≤ 6 %/h (appareil milieu de gamme)             |
| O3  | Temps réel         | Latence position livreur → dashboard (réseau OK)      | p95 < 5 s                                      |
| O4  | Offline            | Trajet de 4 h entièrement hors-ligne puis synchronisé | 0 perte, synchro < 30 s au retour réseau       |
| O5  | Qualité            | Couverture des tests utils/services · CI              | ≥ 80 % · verte sur `main`                      |
| O6  | Performance carte  | Trajet de 20 000 points affiché                       | interaction fluide (> 45 fps), ouverture < 1 s |

---

## 3. Utilisateurs et rôles

| Rôle                          | Description                        | Plateforme                    | Besoins clés                                                                                                     |
| ----------------------------- | ---------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Livreur / chauffeur**       | Effectue les trajets et livraisons | App Android (iOS plus tard)   | Démarrer en 1 tap, fonctionner hors-ligne et en arrière-plan, voir sa prochaine livraison, valider une livraison |
| **Dispatcher / gestionnaire** | Supervise la flotte                | Dashboard web                 | Voir toutes les positions en direct, assigner des missions, historique et rapports                               |
| **Client final**              | Destinataire d'une livraison       | Lien web public (sans compte) | Position du livreur et heure d'arrivée estimée, sans voir le reste du trajet                                     |
| **Administrateur**            | Gère l'organisation                | Dashboard web                 | Comptes, rôles, rétention des données, export                                                                    |

---

## 4. Exigences fonctionnelles

Priorités : **P0** = indispensable à la V2, **P1** = important, **P2** = confort.

### F1 — Suivi en arrière-plan (P0)

- F1.1 Le suivi continue écran éteint et app en arrière-plan, grâce à un _foreground service_ Android avec une notification persistante (« GeoTrack — suivi en cours, 3,2 km ») qui propose Pause et Terminer.
- F1.2 Les permissions sont demandées progressivement : d'abord la localisation au premier plan, puis la localisation en arrière-plan (Android 10+) avec un écran explicatif, et la notification (Android 13+).
- F1.3 Le suivi résiste à la mort du processus : les points sont écrits côté natif en flux continu (write-ahead), puis récupérés au redémarrage.
- F1.4 Précision adaptative : haute à l'arrêt bref ou en mouvement, et intervalle allongé après 3 minutes d'arrêt.
- F1.5 L'app guide l'utilisateur pour exclure GeoTrack de l'optimisation batterie (Doze, réglages fabricant).

### F2 — Stockage local robuste (P0)

- F2.1 Migration vers SQLite (`@capacitor-community/sqlite`, ou IndexedDB sur le web) avec les tables `trips`, `points`, `sync_queue`, `deliveries` et un schéma versionné.
- F2.2 Insertion des points en append-only (sans réécrire le trajet) et index sur `(trip_id, timestamp)`.
- F2.3 Migration automatique des données Preferences du MVP au premier lancement.
- F2.4 Export d'un trajet en GPX, GeoJSON et CSV, avec la feuille de partage native.

### F3 — Backend, comptes et synchronisation (P0)

- F3.1 Backend recommandé : **Supabase** (Postgres + PostGIS, Auth, Realtime, Storage, Edge Functions). Alternative : une API Node sur Postgres. _Décision D1._
- F3.2 Authentification par email + magic link ou mot de passe, avec la session conservée sur l'appareil. Les rôles `driver`, `dispatcher` et `admin` sont rattachés à une organisation.
- F3.3 La synchro est idempotente (upsert par `id` client en UUID) et incrémentale : pendant le trajet, les points partent par paquets (toutes les 15 s ou tous les 50 points) dès que le réseau est disponible.
- F3.4 En cas de conflit, c'est le serveur qui fait foi pour les métadonnées de mission, et les points ne sont jamais écrasés (ajout seul).
- F3.5 Sécurité Row Level Security : un livreur ne voit que ses données, et un dispatcher celles de son organisation.

### F4 — Dashboard dispatcher web (P1)

- F4.1 Carte de la flotte : positions en direct (Realtime), état (en route, en pause, hors-ligne depuis X min), dernière mise à jour.
- F4.2 Liste et détail des trajets, avec rejeu animé et filtres (livreur, date, distance).
- F4.3 Création et assignation des missions de livraison (F5).
- F4.4 Rapports : km par livreur et par jour, temps de conduite, livraisons à l'heure ou en retard, avec export CSV.

### F5 — Missions de livraison (P1)

- F5.1 Une mission contient une adresse (géocodée), une fenêtre horaire, un destinataire, des notes et un statut (`planned` → `en_route` → `arrived` → `delivered` | `failed`).
- F5.2 Le livreur voit sa liste de missions du jour et la prochaine sur la carte, avec la navigation externe en un tap (lien vers Google Maps ou Waze).
- F5.3 Un géofencing passe la mission en `arrived` dans un rayon de 100 m (configurable).
- F5.4 La preuve de livraison (photo, signature, commentaire) est stockée hors-ligne puis envoyée à la synchro.

### F6 — Lien de suivi client (P1)

- F6.1 Le lien est public et non devinable (token), valable de `en_route` jusqu'à une heure après `delivered`.
- F6.2 Il affiche la position du livreur (rafraîchie toutes les 10 s), l'heure d'arrivée estimée et le statut, mais jamais le tracé complet ni les autres livraisons.
- F6.3 L'heure d'arrivée est estimée par la distance restante divisée par la vitesse moyenne récente. Un routage OSRM est envisageable en P2.

### F7 — Carte hors-ligne (P1)

- F7.1 Les tuiles consultées sont mises en cache (LRU, limite configurable, 200 Mo par défaut).
- F7.2 Une zone (rectangle, zooms 10–17) peut être pré-téléchargée, avec la taille estimée affichée avant.
- F7.3 Le fournisseur de tuiles est configurable : OSM n'autorise pas l'usage massif, il faudra un fournisseur commercial (MapTiler, Stadia ou équivalent) en production. _Décision D3._

### F8 — Notifications (P2)

- F8.1 Push FCM : nouvelle mission assignée, mission modifiée ou annulée.
- F8.2 Rappel local : « Suivi en pause depuis 30 min, terminer le trajet ? »

### F9 — Historique et statistiques avancés (P2)

- F9.1 Graphiques de vitesse et d'altitude d'un trajet, et répartition des arrêts.
- F9.2 Résumé hebdomadaire (km, temps, nombre de livraisons).
- F9.3 Lissage du tracé (filtre de Kalman) et détection des arrêts de plus de 2 minutes.

### F10 — Paramètres et internationalisation (P2)

- F10.1 Unités (km/mi), précision GPS (éco / standard / haute), thème (auto / clair / sombre).
- F10.2 Langues français (par défaut) et anglais, sans texte en dur dans les composants.
- F10.3 Suppression du compte et des données depuis l'app (RGPD).

---

## 5. Exigences non fonctionnelles

| Domaine               | Exigence                                                                                                                                                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plateformes**       | Android 7+ (minSdk 24), cible SDK 36. Web (dashboard, lien client) sur navigateurs evergreen. iOS en phase ultérieure (D2).                                                                                                                                                                     |
| **Performance**       | Polyline simplifiée (Douglas-Peucker) au-delà de 2 000 points visibles. Calcul des stats incrémental (O(1) par point) et non plus O(n) à chaque rendu.                                                                                                                                          |
| **Batterie**          | Pas de réveil inutile : GPS natif uniquement, pas de `setInterval` JS en arrière-plan. Mesure documentée sur un appareil réel.                                                                                                                                                                  |
| **Fiabilité**         | Aucun point perdu en cas de kill : écriture native avant ACK. Synchro rejouable sans doublon.                                                                                                                                                                                                   |
| **Sécurité**          | HTTPS uniquement. Aucun secret dans l'APK (seule la clé publique `anon` Supabase est autorisée, protégée par RLS). Tokens dans un stockage sécurisé (Keystore). Dépendances auditées en CI.                                                                                                     |
| **Vie privée / RGPD** | Les données de localisation sont des données personnelles. Il faut un consentement explicite, une finalité affichée, une rétention configurable (90 jours par défaut), l'export et la suppression sur demande. Le suivi n'est actif que lorsque le livreur l'a démarré : jamais de suivi caché. |
| **Accessibilité**     | Contrastes AA, cibles tactiles ≥ 44 px, libellés ARIA, utilisable avec TalkBack pour les actions principales.                                                                                                                                                                                   |
| **Observabilité**     | Journal d'erreurs (Sentry ou équivalent) côté app et backend, sans coordonnées dans les logs.                                                                                                                                                                                                   |
| **Maintenabilité**    | TypeScript strict, ESLint et Prettier, aucun `any` non justifié, modules découplés (services purs testables, hooks fins, composants de présentation).                                                                                                                                           |

---

## 6. Architecture cible

```
geotrack/
├── apps/
│   ├── mobile/          # app actuelle (React + Capacitor) — déplacée depuis la racine
│   └── dashboard/       # React + Vite : dispatcher + page publique de suivi client
├── packages/
│   └── shared/          # types (Trip, TrackPoint, Delivery…), utils geo/format, client API
├── supabase/
│   ├── migrations/      # schéma SQL versionné (PostGIS, RLS)
│   └── functions/       # Edge Functions (lien client, ETA, webhooks)
├── android/ → apps/mobile/android/
└── docs/
```

- **Monorepo** avec npm workspaces : on reste sur npm, déjà utilisé.
- **Flux de données mobile** : source de position (plugin natif) → `PointRepository` (SQLite, append) → `TripEngine` (stats incrémentales) → UI. En parallèle : `SyncWorker` (lit `sync_queue`, envoie par paquets).
- **Modèle serveur (esquisse)** : `organizations`, `profiles(role)`, `trips`, `track_points(geom geography(Point), recorded_at, …)` partitionnée par mois si nécessaire, `deliveries`, `delivery_proofs`, `tracking_links`.
- **Temps réel** : la dernière position de chaque livreur est publiée dans une table `driver_positions` (une ligne par livreur, upsert) écoutée par Realtime, pour éviter de diffuser chaque point.

---

## 7. Qualité, tests et livraison

| Niveau          | Outil                                                 | Périmètre minimal                                                                          |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Lint / format   | ESLint (react-hooks, typescript-eslint) + Prettier    | Bloquant en CI                                                                             |
| Unitaires       | Vitest                                                | utils, services, moteurs (≥ 80 % de couverture)                                            |
| Composants      | Vitest + Testing Library + jsdom                      | Dashboard, Controls, TripHistory, écrans de permission                                     |
| E2E web         | Playwright                                            | Simulation complète : démarrer → pause → terminer → historique ; mode hors-ligne → synchro |
| Base de données | Tests SQL des RLS (pgTAP ou scripts supabase)         | Isolation entre organisations et entre livreurs                                            |
| Android         | Build `assembleDebug` + `assembleRelease` signé en CI | Smoke test manuel documenté (checklist) par release                                        |

- **Versioning** : semver. `versionCode` et `versionName` Android sont dérivés du tag, et un `CHANGELOG.md` est tenu à jour.
- **Release** : un tag `vX.Y.Z` produit une CI qui publie un APK et un AAB signés (keystore dans les secrets GitHub) dans une GitHub Release.
- **Branches** : une branche par lot (voir PROMPTS.md), une PR par lot, et merge seulement si la CI est verte.

---

## 8. Feuille de route

| Phase                  | Lots                                                                                                       | Livrable                      | Dépendances |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------- |
| **0 — Fondations**     | L0.1 Lint + tests composants + E2E · L0.2 Release signée                                                   | CI complète, APK release      | —           |
| **1 — Mobile robuste** | L1.1 SQLite + stats incrémentales · L1.2 Suivi en arrière-plan · L1.3 Export GPX/GeoJSON/CSV               | Suivi fiable écran éteint     | L0.1        |
| **2 — Backend**        | L2.1 Monorepo + package partagé · L2.2 Supabase schéma + RLS + Auth · L2.3 Synchro incrémentale réelle     | Données multi-appareils       | L1.1, D1    |
| **3 — Opérations**     | L3.1 Dashboard dispatcher · L3.2 Missions + géofencing + preuve · L3.3 Lien client + ETA                   | Produit « livraison » complet | L2.x        |
| **4 — Confort**        | L4.1 Cartes hors-ligne · L4.2 Notifications · L4.3 Stats avancées + Kalman · L4.4 Paramètres + i18n + RGPD | V2 complète                   | L3.x        |

Chaque lot a ses critères d'acceptation dans le prompt correspondant de [`PROMPTS.md`](./PROMPTS.md).

---

## 9. Risques

| Risque                                                                               | Impact                 | Parade                                                                                                                              |
| ------------------------------------------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Optimisations batterie des fabricants (Xiaomi, Samsung, Huawei) qui tuent le service | Points perdus          | Foreground service, guide d'exclusion, détection des trous et avertissement                                                         |
| Plugin de géolocalisation en arrière-plan non compatible avec Capacitor 8            | Blocage L1.2           | Vérifier la compatibilité en premier ; plan B : plugin Capacitor local (Kotlin, `FusedLocationProviderClient` + foreground service) |
| Politique Google Play sur la localisation en arrière-plan                            | Refus de publication   | Déclaration et vidéo de justification, finalité claire, suivi démarré explicitement                                                 |
| Coût et limites des tuiles OSM                                                       | Blocage du fournisseur | Fournisseur commercial avec clé (D3)                                                                                                |
| Volume de points côté serveur                                                        | Coût, lenteur          | Paquets, simplification à l'archivage, partitionnement, rétention                                                                   |
| RGPD                                                                                 | Juridique              | Consentement, rétention, suppression, registre des traitements                                                                      |

---

## 10. Décisions à valider (par le porteur du projet)

| #   | Question                            | Recommandation                                                                    |
| --- | ----------------------------------- | --------------------------------------------------------------------------------- |
| D1  | Backend                             | **Supabase** : rapide à mettre en place, Postgres/PostGIS, RLS, Realtime          |
| D2  | iOS dans la V2 ?                    | Non : Android d'abord, iOS une fois la V2 stabilisée                              |
| D3  | Fournisseur de tuiles en production | MapTiler ou Stadia (offre gratuite pour démarrer)                                 |
| D4  | Mono-organisation ou multi-tenant ? | Multi-tenant dès le schéma (colonne `org_id`), même avec un seul client au départ |
| D5  | Distribution                        | APK direct au début, puis Google Play (test interne → production)                 |
