import { latLngBounds, type LatLngBounds, type LatLngTuple } from "leaflet";

function iterLatLngPairs(coords: unknown): LatLngTuple[] {
  if (!Array.isArray(coords) || coords.length === 0) {
    return [];
  }

  if (
    coords.length >= 2 &&
    typeof coords[0] === "number" &&
    typeof coords[1] === "number"
  ) {
    const lng = coords[0] as number;
    const lat = coords[1] as number;
    return [[lat, lng] as LatLngTuple];
  }

  return coords.flatMap((item) => iterLatLngPairs(item));
}

export function buildBoundsFromGeoJson(geojson: GeoJSON.FeatureCollection): LatLngBounds | null {
  const points = geojson.features.flatMap((feature) => {
    if (!feature || !feature.geometry) {
      return [];
    }
    return iterLatLngPairs((feature.geometry as { coordinates?: unknown }).coordinates);
  });

  if (points.length === 0) {
    return null;
  }
  return latLngBounds(points);
}

export function buildBoundsFromPoints(points: Array<{ latitude: number; longitude: number }>) {
  if (points.length === 0) {
    return null;
  }
  const latLngPoints: [number, number][] = points.map((item) => [item.latitude, item.longitude]);
  return latLngBounds(latLngPoints);
}

export const buildBoundsFromLieux = buildBoundsFromPoints;

export function mergeBounds(
  first: ReturnType<typeof buildBoundsFromGeoJson>,
  second: ReturnType<typeof buildBoundsFromPoints>,
) {
  if (first && second) {
    const merged = latLngBounds(first.getSouthWest(), first.getNorthEast());
    merged.extend(second.getSouthWest());
    merged.extend(second.getNorthEast());
    return merged;
  }
  return first ?? second ?? null;
}
