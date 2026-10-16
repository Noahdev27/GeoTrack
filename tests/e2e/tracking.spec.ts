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

test('un rechargement en plein suivi (app tuée) restaure le trajet avec ses points', async ({ page }) => {
  await page.getByRole('radio', { name: '×10' }).click();
  await page.getByRole('button', { name: /Démarrer/ }).click();
  const distance = page.locator('.metric', { hasText: 'Distance' }).locator('.metric-value');
  await expect(distance).toHaveText(/[1-9]\d* m$| km$/, { timeout: 10_000 });
  await page.waitForTimeout(2500); // laisse passer une écriture périodique des points (2 s)
  await page.reload(); // sans Pause ni Terminer

  await expect(page.getByText(/Trajet interrompu récupéré/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Reprendre/ })).toBeVisible();
  await expect(distance).not.toHaveText('0 m');
  await expect(page.locator('.route-trace')).toHaveCount(1);
});

test('export GPX d’un trajet terminé', async ({ page }) => {
  await recordShortTrip(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('group', { name: 'Exporter le trajet' }).getByRole('button', { name: 'GPX' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^geotrack-\d{4}-\d{2}-\d{2}-\d{4}\.gpx$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const gpx = Buffer.concat(chunks).toString('utf8');
  expect(gpx).toContain('<gpx version="1.1"');
  expect((gpx.match(/<trkpt /g) ?? []).length).toBeGreaterThan(3);
});
