# GeoTrack — consignes pour Claude

App mobile hybride de suivi de trajet/livraison : React 19 + TypeScript strict + Vite 7, Capacitor 8 (Android), Leaflet (react-leaflet 5), Vitest.

- Spécification et feuille de route : `docs/CAHIER_DES_CHARGES.md`
- Prompts par lot (une session = un lot = une PR) : `docs/PROMPTS.md`

## Commandes

```bash
npm run typecheck   # tsc -b
npm test            # vitest run (src/**/*.test.{ts,tsx})
npm run lint        # ESLint (règles React 19 strictes)
npm run test:e2e    # Playwright (après npm run build)
npm run build       # typecheck + build dans dist/
npx cap sync android
```

À exécuter avant **chaque** commit : `npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`.

## Architecture

- `src/types` : modèle de données (`Trip`, `TrackPoint`, `TripStats`…). Un `TrackPoint` porte un `segment` : aucune distance n'est comptée entre deux segments (pauses).
- `src/utils` : fonctions pures (géo, formatage fr-FR), testées.
- `src/services` : simulation GPS, synchro (`SyncService` : file + backoff, transport injectable), `TripPersister` (tampon de points, écritures par lots sérialisées). Pas de React ici.
- `src/services/db` : interface `TripRepository` (append-only) avec deux implémentations testées par la même suite de contrat : SQLite (`@capacitor-community/sqlite`, Android) et IndexedDB (web). Schéma versionné dans `schema.ts` (ne jamais modifier une migration publiée). `storage.ts` est la façade (`tripStorage`) et importe au premier lancement les données v0.1 (Preferences).
- Métriques : `TripAccumulator` (`utils/geo.ts`) intègre chaque point en O(1) ; `computeStats` en est la version batch.
- `src/services/location/locationWatcher.ts` : source de positions. Android → `@capacitor-community/background-geolocation` (service de premier plan, suivi écran éteint ; le paquet ne fournit que des types, l'objet vient de `registerPlugin('BackgroundGeolocation')`) ; web → `@capacitor/geolocation`. Les permissions restent demandées via `@capacitor/geolocation` (`requestPermissions: false` côté plugin d'arrière-plan).
- `src/hooks` : `useTracker` (machine à états idle → tracking ⇄ paused), `useGeolocation` (plugin natif + permissions), `useSync`, `useTripHistory`.
- Tests sur appareil (permissions, écran éteint, kill, batterie) : `docs/TESTS_MANUELS.md`, à dérouler avant chaque release.
- `src/components` : présentation (MapView, Dashboard, Controls, StatusBar, TripHistory).
- `android/` est commité. Les permissions vivent dans `android/app/src/main/AndroidManifest.xml`.

## Conventions

- Textes UI, commentaires et messages de commit en **français**. Identifiants de code en anglais.
- Style : 2 espaces, quotes simples, point-virgules, lignes ≤ ~120 colonnes.
- Logique métier dans des fonctions pures ou des services testables, pas dans les composants.
- Toute nouvelle logique a des tests. Les plugins Capacitor sont mockés avec `vi.mock` (doublures dans `src/test/mocks.ts`). IndexedDB est fourni par fake-indexeddb (base vierge à chaque test) ; le SQL est testé avec sql.js (`src/test/sqljsDriver.ts`).
- Faux timers : utiliser `vi.useFakeTimers(FAKE_TIMERS)` (ne simule pas `setImmediate`, utilisé par fake-indexeddb) et attendre IndexedDB avec de vraies macro-tâches, pas `vi.waitFor`.
- Avant d'ajouter une dépendance, vérifier sa compatibilité Capacitor 8 et React 19 (peerDependencies).
- Avec react-leaflet, `className` se passe en **prop directe** d'une couche, pas dans `pathOptions` (sinon il est ignoré). Le rendu SVG est requis pour le style CSS des tracés.
- Le filtre anti-aberrations GPS (`DEFAULT_GPS_FILTER`) ne s'applique pas tel quel à la simulation accélérée.
- Aucun secret dans le dépôt ni dans l'APK. Les variables publiques passent par `VITE_*` (voir `.env.example`).

## Environnement cloud

Le SDK Android n'est pas téléchargeable depuis les conteneurs Claude Code (dl.google.com bloqué) : on vérifie le build APK via la CI GitHub Actions (`.github/workflows/android.yml`). Les tuiles OSM peuvent aussi être bloquées : dans Playwright, les intercepter.
