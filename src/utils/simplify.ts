/** Mètres par pixel pour les tuiles Web Mercator (256 px) à une latitude et un zoom donnés. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (156_543.033_92 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * Simplification de Douglas-Peucker (itérative) d'une polyligne [lat, lng].
 * Les distances sont calculées dans une projection équirectangulaire locale, en mètres :
 * suffisant pour l'affichage. Les extrémités sont toujours conservées.
 */
export function simplifyPath(path: readonly [number, number][], toleranceMeters: number): [number, number][] {
  const n = path.length;
  if (n <= 2 || !(toleranceMeters > 0)) return path.slice();

  const kx = 111_320 * Math.cos((path[0][0] * Math.PI) / 180);
  const ky = 110_540;
  const xs = path.map((p) => p[1] * kx);
  const ys = path.map((p) => p[0] * ky);
  const tolerance2 = toleranceMeters * toleranceMeters;

  /** Carré de la distance du point i au segment [a, b]. */
  const dist2 = (i: number, a: number, b: number) => {
    const dx = xs[b] - xs[a];
    const dy = ys[b] - ys[a];
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((xs[i] - xs[a]) * dx + (ys[i] - ys[a]) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const ex = xs[a] + t * dx - xs[i];
    const ey = ys[a] + t * dy - ys[i];
    return ex * ex + ey * ey;
  };

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    let maxD = 0;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = dist2(i, a, b);
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (index !== -1 && maxD > tolerance2) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return path.filter((_, i) => keep[i] === 1);
}
