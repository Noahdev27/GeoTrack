// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExportActions } from './ExportActions';

describe('ExportActions', () => {
  it('propose les trois formats', () => {
    const onExport = vi.fn();
    render(<ExportActions busy={false} onExport={onExport} />);
    for (const [label, format] of [
      ['GPX', 'gpx'],
      ['GeoJSON', 'geojson'],
      ['CSV', 'csv'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(onExport).toHaveBeenLastCalledWith(format);
    }
  });

  it('se désactive pendant un export', () => {
    render(<ExportActions busy onExport={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'GPX' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
