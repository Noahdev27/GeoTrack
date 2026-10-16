import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.geotrack.app',
  appName: 'GeoTrack',
  webDir: 'dist',
  android: {
    // Les tuiles OpenStreetMap sont servies en HTTPS ; aucun contenu mixte n'est nécessaire.
    allowMixedContent: false,
  },
};

export default config;
