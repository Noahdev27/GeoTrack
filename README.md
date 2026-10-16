# GeoTrack MVP

Application mobile hybride de suivi de trajet en temps réel : carte dynamique, suivi GPS natif ou simulé, métriques en direct et stockage offline-first avec synchronisation automatique.

**Stack** : React 19 + TypeScript + Vite · Capacitor 8 (Android) · Leaflet / react-leaflet · Vitest

## Démarrage rapide

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests unitaires (calculs, simulateur, stockage, synchro)
npm run build      # typecheck + build de production dans dist/
```

## Build Android (.apk)

Prérequis : JDK 21 et Android SDK (Android Studio), variable `ANDROID_HOME` définie.

```bash
npm run cap:sync      # build web + npx cap sync android
npm run cap:open      # ouvre le projet dans Android Studio
npm run android:apk   # ou en ligne de commande → android/app/build/outputs/apk/debug/app-debug.apk
```

Le workflow GitHub Actions `.github/workflows/android.yml` exécute les tests, le build web puis `assembleDebug`, et publie l'APK en artefact (`geotrack-debug-apk`).

## Fonctionnalités

| Fonctionnalité | Implémentation |
| --- | --- |
| Carte interactive | `components/MapView.tsx` : tuiles OpenStreetMap, tracé par segment (pas de ligne fantôme après une pause), marqueur orienté selon le cap, cercle de précision GPS, suivi automatique désactivé au glisser + bouton de recentrage, recadrage sur un trajet de l'historique. |
| Simulation GPS | `services/simulation.ts` : véhicule qui suit un itinéraire point par point (Louvre → Tour Eiffel), vitesse réaliste variable, bruit GPS, accélération ×1 / ×2 / ×5 / ×10, aller-retour continu. |
| GPS natif | `hooks/useGeolocation.ts` : `@capacitor/geolocation` (haute précision, `watchPosition`), vérification et demande des permissions, gestion du refus, de la localisation approximative (Android 12+) et des services de localisation désactivés. |
| Dashboard | `components/Dashboard.tsx` + `utils/geo.ts` : distance (Haversine), temps actif hors pauses, vitesse moyenne, instantanée et max. Les relevés bruités sont filtrés (précision > 50 m, micro-déplacements < 3 m, sauts aberrants > 250 km/h). |
| Offline-first | `services/storage.ts` : trajets stockés avec `@capacitor/preferences` (SharedPreferences sur Android, localStorage sur le web). Le trajet en cours est sauvegardé toutes les 10 s et au passage en arrière-plan, puis proposé à la reprise si l'app a été tuée. |
| Synchronisation | `services/sync.ts` : file des trajets non synchronisés, envoi dès que `@capacitor/network` signale le réseau, nouvel essai avec backoff exponentiel (5 s → 5 min). |

### Configurer le backend de synchronisation

Copiez `.env.example` en `.env` et renseignez `VITE_SYNC_ENDPOINT` : chaque trajet terminé y est envoyé en `POST` JSON (objet `Trip`, voir `src/types`). Si la variable est absente, un serveur simulé est utilisé : la synchro aboutit en ligne et échoue hors-ligne, ce qui permet de tester tout le cycle.

## Architecture

```
src/
├── components/   MapView, Dashboard, Controls, StatusBar, TripHistory
├── hooks/        useGeolocation (GPS natif + permissions), useTracker (machine à états du suivi),
│                 useSync, useTripHistory
├── services/     simulation (GPS simulé), storage (Preferences), sync (file offline + réseau)
├── types/        LatLng, TrackPoint, Trip, TripStats, SyncState…
└── utils/        geo (distance, vitesse, filtrage), format (affichage fr-FR)
```

Cycle du suivi (`useTracker`) : `idle → tracking ⇄ paused → idle`. À l'arrêt, le trajet est figé, enregistré localement puis mis en file de synchronisation.

## Permissions Android

Déclarées dans `android/app/src/main/AndroidManifest.xml` : `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_NETWORK_STATE`, `INTERNET`. Le GPS matériel est déclaré `required="false"` : l'app s'installe aussi sur les appareils sans GPS (mode Simulation).

## Feuille de route

- [`docs/CAHIER_DES_CHARGES.md`](docs/CAHIER_DES_CHARGES.md) : cible V2 (suivi en arrière-plan, SQLite, backend Supabase, dashboard dispatcher, missions de livraison, lien client, cartes hors-ligne…), exigences, architecture et risques.
- [`docs/PROMPTS.md`](docs/PROMPTS.md) : un prompt d'exécution par lot, avec ses critères d'acceptation.

## Limites connues du MVP

- Le suivi fonctionne app au premier plan. Pour un suivi écran éteint ou en arrière-plan, il faudra un service de premier plan Android (par ex. `@capacitor-community/background-geolocation`).
- Les tuiles de carte ne sont pas mises en cache : hors-ligne, le tracé et les métriques restent disponibles mais pas le fond de carte.
- Preferences convient aux volumes d'un MVP. Pour des centaines de trajets longs, il faudra passer à SQLite (`@capacitor-community/sqlite`).
