# GeoTrack — consignes pour Claude

App mobile hybride de suivi de trajet/livraison : React 19 + TypeScript strict + Vite 7, Capacitor 8 (Android), Leaflet (react-leaflet 5), Vitest.

- Spécification et feuille de route : `docs/CAHIER_DES_CHARGES.md`
- Prompts par lot (une session = un lot = une PR) : `docs/PROMPTS.md`

## Commandes

```bash
npm run typecheck   # tsc -b
npm test            # vitest run (src/**/*.test.ts)
npm run build       # typecheck + build dans dist/
npx cap sync android
```

À exécuter avant **chaque** commit : `npm run typecheck && npm test && npm run build`.

## Architecture

- `src/types` : modèle de données (`Trip`, `TrackPoint`, `TripStats`…). Un `TrackPoint` porte un `segment` : aucune distance n'est comptée entre deux segments (pauses).
- `src/utils` : fonctions pures (géo, formatage fr-FR), testées.
- `src/services` : simulation GPS, stockage (Capacitor Preferences), synchro (`SyncService` : file + backoff, transport injectable). Pas de React ici.
- `src/hooks` : `useTracker` (machine à états idle → tracking ⇄ paused), `useGeolocation` (plugin natif + permissions), `useSync`, `useTripHistory`.
- `src/components` : présentation (MapView, Dashboard, Controls, StatusBar, TripHistory).
- `android/` est commité. Les permissions vivent dans `android/app/src/main/AndroidManifest.xml`.

## Conventions

- Textes UI, commentaires et messages de commit en **français**. Identifiants de code en anglais.
- Style : 2 espaces, quotes simples, point-virgules, lignes ≤ ~120 colonnes.
- Logique métier dans des fonctions pures ou des services testables, pas dans les composants.
- Toute nouvelle logique a des tests. Les plugins Capacitor sont mockés avec `vi.mock`.
- Avant d'ajouter une dépendance, vérifier sa compatibilité Capacitor 8 et React 19 (peerDependencies).
- Avec react-leaflet, `className` se passe en **prop directe** d'une couche, pas dans `pathOptions` (sinon il est ignoré). Le rendu SVG est requis pour le style CSS des tracés.
- Le filtre anti-aberrations GPS (`DEFAULT_GPS_FILTER`) ne s'applique pas tel quel à la simulation accélérée.
- Aucun secret dans le dépôt ni dans l'APK. Les variables publiques passent par `VITE_*` (voir `.env.example`).

## Environnement cloud

Le SDK Android n'est pas téléchargeable depuis les conteneurs Claude Code (dl.google.com bloqué) : on vérifie le build APK via la CI GitHub Actions (`.github/workflows/android.yml`). Les tuiles OSM peuvent aussi être bloquées : dans Playwright, les intercepter.
