import { useEffect, useMemo, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { LatLng, TrackPoint } from '../types';
import { metersPerPixel, simplifyPath } from '../utils/simplify';

export interface MapViewProps {
  /** Points du tracé affiché (trajet en cours ou trajet consulté). */
  points: readonly TrackPoint[];
  /** Position courante du véhicule. */
  position: LatLng | null;
  heading?: number | null;
  accuracy?: number | null;
  /** Itinéraire prévu (mode simulation), affiché en pointillés. */
  plannedRoute?: readonly LatLng[];
  /** Si vrai, la carte suit le véhicule. */
  follow: boolean;
  onFollowChange: (follow: boolean) => void;
  /** Change de valeur pour demander un recadrage sur l'ensemble du tracé. */
  fitKey?: string | null;
  initialCenter: LatLng;
}

const toTuple = (p: LatLng): [number, number] => [p.lat, p.lng];

function vehicleIcon(heading: number | null | undefined) {
  const rotation = heading != null && Number.isFinite(heading) ? Math.round(heading) : null;
  return L.divIcon({
    className: 'vehicle-marker',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html:
      rotation === null
        ? '<div class="vehicle-dot"></div>'
        : `<div class="vehicle-arrow" style="transform: rotate(${rotation}deg)">
             <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
               <circle cx="12" cy="12" r="10" class="vehicle-arrow-bg"/>
               <path d="M12 5l5 12-5-3-5 3z" class="vehicle-arrow-fg"/>
             </svg>
           </div>`,
  });
}

/** Découpe le tracé par segment pour ne pas relier les points de part et d'autre d'une pause. */
function splitSegments(points: readonly TrackPoint[]): [number, number][][] {
  const out: [number, number][][] = [];
  let current: [number, number][] = [];
  let seg: number | null = null;
  for (const p of points) {
    if (seg !== null && p.segment !== seg) {
      out.push(current);
      current = [];
    }
    seg = p.segment;
    current.push(toTuple(p));
  }
  if (current.length) out.push(current);
  return out;
}

function FollowController({
  position,
  follow,
  onFollowChange,
}: Pick<MapViewProps, 'position' | 'follow' | 'onFollowChange'>) {
  const map = useMap();
  useMapEvents({ dragstart: () => onFollowChange(false) });
  useEffect(() => {
    if (follow && position) map.panTo(toTuple(position), { animate: true, duration: 0.5 });
  }, [map, follow, position]);
  return null;
}

function FitBounds({ points, fitKey }: { points: readonly TrackPoint[]; fitKey?: string | null }) {
  const map = useMap();
  // fitKey n'est défini que pour un trajet consulté (points figés) : pas de recadrage pendant un suivi.
  useEffect(() => {
    if (!fitKey || points.length === 0) return;
    map.fitBounds(L.latLngBounds(points.map(toTuple)), { padding: [32, 32], maxZoom: 17 });
  }, [map, fitKey, points]);
  return null;
}

/** Leaflet doit recalculer sa taille quand le conteneur change (rotation, panneau, clavier…). */
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

/** Au-delà de ce nombre de points, le tracé affiché est simplifié (les données restent intactes). */
const SIMPLIFY_THRESHOLD = 2000;

/** Tracé du trajet, simplifié selon le zoom pour rester fluide sur les longs trajets. */
function TraceLayer({ points }: { points: readonly TrackPoint[] }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const segments = useMemo(() => splitSegments(points), [points]);
  const displayed = useMemo(() => {
    if (points.length <= SIMPLIFY_THRESHOLD) return segments;
    // Tolérance ≈ 1 pixel : la simplification est invisible à l'écran.
    const tolerance = metersPerPixel(points[0].lat, zoom);
    return segments.map((seg) => simplifyPath(seg, tolerance));
  }, [segments, points, zoom]);

  return displayed.map((seg, i) => (
    <Polyline
      key={i}
      positions={seg}
      className="route-trace"
      pathOptions={{ weight: 5, lineCap: 'round', lineJoin: 'round' }}
    />
  ));
}

export function MapView(props: MapViewProps) {
  const { points, position, heading, accuracy, plannedRoute, follow, onFollowChange, fitKey, initialCenter } = props;
  // Cap arrondi à 5° pour ne pas recréer l'icône à chaque relevé.
  const headingBucket = heading == null || !Number.isFinite(heading) ? null : Math.round(heading / 5) * 5;
  const icon = useMemo(() => vehicleIcon(headingBucket), [headingBucket]);
  const start = points[0];

  return (
    <MapContainer center={toTuple(initialCenter)} zoom={15} className="map" zoomControl={false} attributionControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {plannedRoute && plannedRoute.length > 1 && (
        <Polyline
          positions={plannedRoute.map(toTuple)}
          className="route-planned"
          pathOptions={{ weight: 4, dashArray: '6 8' }}
        />
      )}
      <TraceLayer points={points} />
      {start && (
        <CircleMarker
          center={toTuple(start)}
          radius={7}
          className="route-start"
          pathOptions={{ weight: 3, fillOpacity: 1 }}
        />
      )}
      {position && accuracy != null && accuracy > 5 && (
        <Circle center={toTuple(position)} radius={accuracy} className="accuracy-circle" pathOptions={{ weight: 1 }} />
      )}
      {position && <Marker position={toTuple(position)} icon={icon} interactive={false} />}
      <FollowController position={position} follow={follow} onFollowChange={onFollowChange} />
      <FitBounds points={points} fitKey={fitKey} />
      <AutoResize />
    </MapContainer>
  );
}
