# Changelog

Toutes les évolutions notables de GeoTrack. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- Lint (ESLint + Prettier), tests de composants et de hooks, tests E2E Playwright, seuils de couverture en CI.
- Build release Android signé et versionné depuis le tag git ; workflow de publication GitHub Release (APK + AAB).

### Modifié

- Stockage : SQLite sur Android, IndexedDB sur le web, points ajoutés au fil de l'eau (plus de réécriture complète du trajet) ; migration automatique des données v0.1.
- Métriques incrémentales (O(1) par point) et tracé simplifié (Douglas-Peucker) au-delà de 2 000 points.
- Un trajet interrompu par l'arrêt brutal de l'app est restauré avec tous ses points sauf, au plus, les 2 dernières secondes.

## [0.1.0] - 2026-10-16

### Ajouté

- MVP : carte Leaflet temps réel, simulation GPS, GPS natif Capacitor avec gestion des permissions.
- Dashboard : distance, temps actif, vitesses moyenne / instantanée / max.
- Stockage offline (Capacitor Preferences), reprise d'un trajet interrompu, synchronisation automatique avec backoff.
- Historique des trajets, projet Android Capacitor, CI de build APK debug.
