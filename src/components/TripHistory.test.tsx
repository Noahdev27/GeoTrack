// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TripSummary } from '../types';
import { TripHistory } from './TripHistory';

const summary = (id: string, syncedAt: number | null): TripSummary => ({
  id,
  name: id,
  mode: 'gps',
  startedAt: new Date(2026, 9, 16, 14, 5).getTime(),
  endedAt: null,
  stats: { distanceMeters: 1500, durationMs: 60_000, avgSpeedKmh: 90, currentSpeedKmh: 0, maxSpeedKmh: 95 },
  syncedAt,
});

function setup(trips: TripSummary[], loading = false) {
  const handlers = { onSelect: vi.fn(), onDelete: vi.fn(), onClose: vi.fn() };
  render(<TripHistory trips={trips} loading={loading} selectedId={null} {...handlers} />);
  return handlers;
}

describe('TripHistory', () => {
  afterEach(() => vi.restoreAllMocks());

  it('affiche un état vide et un état de chargement', () => {
    setup([]);
    expect(screen.getByText(/Aucun trajet enregistré/)).toBeTruthy();
  });

  it('affiche le chargement', () => {
    setup([], true);
    expect(screen.getByText('Chargement…')).toBeTruthy();
  });

  it('liste les trajets avec leur état de synchronisation', () => {
    setup([summary('a', 123), summary('b', null)]);
    expect(screen.getAllByText(/16\/10\/2026 14:05/)).toHaveLength(2);
    expect(screen.getByText('Synchronisé')).toBeTruthy();
    expect(screen.getByText('En attente de synchro')).toBeTruthy();
  });

  it('sélectionne un trajet', () => {
    const h = setup([summary('a', null)]);
    fireEvent.click(screen.getByText(/16\/10\/2026 14:05/));
    expect(h.onSelect).toHaveBeenCalledWith('a');
  });

  it('demande confirmation avant suppression', () => {
    const h = setup([summary('a', null)]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const del = screen.getByRole('button', { name: 'Supprimer le trajet' });
    fireEvent.click(del);
    expect(h.onDelete).not.toHaveBeenCalled();
    fireEvent.click(del);
    expect(h.onDelete).toHaveBeenCalledWith('a');
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('se ferme au clic sur le fond, pas sur la feuille', () => {
    const h = setup([]);
    fireEvent.click(screen.getByRole('dialog'));
    expect(h.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(h.onClose).toHaveBeenCalledOnce();
  });
});
