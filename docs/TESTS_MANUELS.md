# Tests manuels sur appareil Android

Ces vérifications ne sont pas automatisables en CI : elles demandent un vrai téléphone, un vrai GPS et l'OS qui gère l'énergie.
À dérouler **avant chaque release**, sur au moins un appareil récent (Android 14+) et si possible un appareil d'un fabricant « agressif » sur la batterie (Xiaomi, Samsung, Huawei, OnePlus).

Installer l'APK : `adb install -r app-debug.apk` (artefact `geotrack-debug-apk` de la CI) ou l'APK signé de la release.

## 1. Permissions

| #   | Scénario                                           | Résultat attendu                                                                                                    |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Premier lancement → mode GPS → Démarrer            | Invite système de localisation (précise / approximative)                                                            |
| 1.2 | Refuser                                            | Message « L'accès à la localisation est nécessaire… », le suivi ne démarre pas, le mode Simulation reste utilisable |
| 1.3 | Accorder « approximative » seulement               | Le suivi démarre ; message « Localisation approximative uniquement… »                                               |
| 1.4 | Refuser deux fois (refus définitif), puis Démarrer | Message d'erreur clair ; « Réglages » ouvre la page de l'app                                                        |
| 1.5 | GPS du téléphone coupé → Démarrer                  | Message « Les services de localisation sont désactivés… »                                                           |
| 1.6 | Android 13+ : refuser les notifications            | Le suivi fonctionne quand même (la notification de suivi peut être masquée)                                         |

## 2. Suivi en arrière-plan

| #   | Scénario                                                | Résultat attendu                                                                          |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 2.1 | Démarrer en GPS, passer l'app en arrière-plan           | Notification persistante « GeoTrack — suivi en cours »                                    |
| 2.2 | Marcher / rouler 30 min **écran éteint**                | Au retour : tracé continu sans trou > 30 s, distance cohérente avec le parcours réel      |
| 2.3 | Ouvrir une autre app (navigation, appel) pendant 10 min | Le tracé continue pendant ce temps                                                        |
| 2.4 | Pause → arrière-plan 5 min → Reprendre                  | Aucun point pendant la pause, pas de ligne entre la position de pause et celle de reprise |
| 2.5 | Terminer                                                | La notification disparaît ; le trajet est dans l'historique                               |

## 3. Robustesse

| #   | Scénario                                                         | Résultat attendu                                                                                         |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 3.1 | Pendant un suivi : fermer l'app depuis les apps récentes (swipe) | Au relancement : « Trajet interrompu récupéré », tous les points sauf, au plus, les 2 dernières secondes |
| 3.2 | Pendant un suivi : redémarrer le téléphone                       | Idem 3.1 (reprise en pause)                                                                              |
| 3.3 | Mode avion pendant tout un trajet, puis réseau rétabli           | Trajet « En attente de synchro » puis « Synchronisé » sans action                                        |
| 3.4 | Mise à jour depuis la v0.1 (données Preferences)                 | Les anciens trajets apparaissent dans l'historique                                                       |

## 4. Batterie (objectif O2 : ≤ 6 %/h)

1. Batterie chargée à 100 %, luminosité automatique, pas d'autre app active.
2. Suivi GPS 1 h écran éteint (en voiture ou à pied).
3. Noter la consommation (Réglages → Batterie → GeoTrack) et le modèle de l'appareil dans la PR de release.

## 5. Export

| #   | Scénario                                                   | Résultat attendu                                                                   |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 5.1 | Trajet terminé → Exporter GPX                              | Feuille de partage Android ; le fichier s'ouvre dans une app GPX (OsmAnd, Strava…) |
| 5.2 | GeoJSON → envoyer sur un ordinateur, ouvrir sur geojson.io | Tracé au bon endroit (pas inversé lat/lng)                                         |
| 5.3 | CSV → ouvrir dans un tableur                               | Une ligne par point, colonnes séparées                                             |
