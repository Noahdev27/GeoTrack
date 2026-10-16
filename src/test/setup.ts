import { afterEach } from 'vitest';

// Nettoyage du DOM entre deux tests de composants (uniquement en environnement jsdom).
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(cleanup);
}
