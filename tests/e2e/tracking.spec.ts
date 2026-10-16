import { expect, test, type Page } from '@playwright/test';

// PNG transparent 1×1 : les tuiles OSM peuvent être bloquées (CI, proxy) et ne doivent pas ralentir les tests.
const EMPTY_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await page.route(/tile\.openstreetmap\.org/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: EMPTY_TILE }),
  );
  await page.goto('/');
  await expect(page.getByText('Prêt à démarrer')).toBeVisible();
});

async function recordShortTrip(page: Page) {
  await page.getByRole('radio', { name: '×10' }).click();
  await page.getByRole('button', { name: /Démarrer/ }).click();
  await expect(page.getByText('Suivi en cours')).toBeVisible();
  // ×10 ≈ 100 m/s : la distance passe au kilomètre en quelques secondes.
  const distance = page.locator('.metric', { hasText: 'Distance' }).locator('.metric-value');
  await expect(distance).toHaveText(/ km$/, { timeout: 15_000 });
  await page.getByRole('button', { name: /Pause/ }).click();
  await expect(page.getByText('En pause')).toBeVisible();
  await page.getByRole('button', { name: /Terminer/ }).click();
  await expect(page.getByText(/^Trajet du /)).toBeVisible();
}

test('simulation : démarrer → pause → terminer → historique', async ({ page }) => {
  await recordShortTrip(page);
  await expect(page.locator('.route-trace')).toHaveCount(1);

  await page.getByRole('button', { name: /Historique/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Historique des trajets' });
  await expect(dialog.locator('.trip-list li')).toHaveCount(1);
  await expect(dialog.getByText('Synchronisé')).toBeVisible();
});

test('hors-ligne : le trajet reste en attente puis se synchronise au retour du réseau', async ({ page, context }) => {
  await context.setOffline(true);
  await expect(page.getByText('Hors-ligne', { exact: true })).toBeVisible();

  await recordShortTrip(page);
  await expect(page.getByText(/enregistré hors-ligne/)).toBeVisible();
  await expect(page.getByText('1 en attente')).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
  await expect(page.locator('.status-bar')).toContainText('Synchronisé', { timeout: 10_000 });

  await page.getByRole('button', { name: /Historique/ }).click();
  await expect(page.getByRole('dialog').getByText('Synchronisé')).toBeVisible();
});

test('le trajet survit à un rechargement de la page', async ({ page }) => {
  await page.getByRole('button', { name: /Démarrer/ }).click();
  await expect(page.getByText('Suivi en cours')).toBeVisible();
  await page.getByRole('button', { name: /Pause/ }).click(); // force la sauvegarde du trajet actif
  await page.reload();
  await expect(page.getByText(/Trajet interrompu récupéré/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Reprendre/ })).toBeVisible();
});
