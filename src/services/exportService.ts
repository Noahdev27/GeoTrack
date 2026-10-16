import { Capacitor } from '@capacitor/core';
import type { Trip } from '../types';
import { EXPORT_FORMATS, exportFileName, exportTrip, type ExportFormat } from '../utils/export';

/**
 * Exporte un trajet : feuille de partage native sur Android (fichier écrit dans le cache),
 * téléchargement direct sur le web.
 */
export async function shareTrip(trip: Trip, format: ExportFormat): Promise<void> {
  const content = exportTrip(trip, format);
  const fileName = exportFileName(trip, format);

  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: trip.name, files: [uri], dialogTitle: 'Exporter le trajet' });
    return;
  }

  const url = URL.createObjectURL(new Blob([content], { type: EXPORT_FORMATS[format].mimeType }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Laisse au navigateur le temps de démarrer le téléchargement.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
