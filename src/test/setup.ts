import { afterEach, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

// Base IndexedDB vierge pour chaque test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

// Nettoyage du DOM entre deux tests de composants (uniquement en environnement jsdom).
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(cleanup);
}
