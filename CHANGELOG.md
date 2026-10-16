# Changelog

Toutes les évolutions notables de GeoTrack. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- Lint (ESLint + Prettier), tests de composants et de hooks, tests E2E Playwright, seuils de couverture en CI.
- Build release Android signé et versionné depuis le tag git ; workflow de publication GitHub Release (APK + AAB).

## [0.1.0] - 2026-10-16

### Ajouté

- MVP : carte Leaflet temps réel, simulation GPS, GPS natif Capacitor avec gestion des permissions.
- Dashboard : distance, temps actif, vitesses moyenne / instantanée / max.
- Stockage offline (Capacitor Preferences), reprise d'un trajet interrompu, synchronisation automatique avec backoff.
- Historique des trajets, projet Android Capacitor, CI de build APK debug.
