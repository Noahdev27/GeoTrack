// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { Controls } from './Controls';

function setup(overrides: Partial<ComponentProps<typeof Controls>> = {}) {
  const props: ComponentProps<typeof Controls> = {
    mode: 'simulation',
    status: 'idle',
    simSpeed: 1,
    busy: false,
    onModeChange: vi.fn(),
    onSimSpeedChange: vi.fn(),
    onStart: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
  render(<Controls {...props} />);
  return props;
}

const button = (name: RegExp) => screen.getByRole('button', { name });

describe('Controls', () => {
  it('au repos : démarrer et choisir le mode', () => {
    const p = setup();
    fireEvent.click(button(/Démarrer/));
    expect(p.onStart).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('radio', { name: /GPS réel/ }));
    expect(p.onModeChange).toHaveBeenCalledWith('gps');
    expect(screen.queryByRole('button', { name: /Pause/ })).toBeNull();
  });

  it('en suivi : pause / terminer, et le changement de mode est bloqué', () => {
    const p = setup({ status: 'tracking' });
    fireEvent.click(button(/Pause/));
    fireEvent.click(button(/Terminer/));
    expect(p.onPause).toHaveBeenCalledOnce();
    expect(p.onStop).toHaveBeenCalledOnce();
    expect((screen.getByRole('radio', { name: /GPS réel/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Démarrer/ })).toBeNull();
  });

  it('en pause : reprendre', () => {
    const p = setup({ status: 'paused' });
    fireEvent.click(button(/Reprendre/));
    expect(p.onResume).toHaveBeenCalledOnce();
  });

  it('désactive Terminer pendant une opération en cours', () => {
    setup({ status: 'tracking', busy: true });
    expect((button(/Terminer/) as HTMLButtonElement).disabled).toBe(true);
  });

  it('vitesse de simulation : visible en simulation uniquement', () => {
    const p = setup({ simSpeed: 2 });
    expect(screen.getByRole('radio', { name: '×2' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: '×10' }));
    expect(p.onSimSpeedChange).toHaveBeenCalledWith(10);
  });

  it('masque la vitesse de simulation en mode GPS', () => {
    setup({ mode: 'gps' });
    expect(screen.queryByRole('radio', { name: '×10' })).toBeNull();
  });
});
