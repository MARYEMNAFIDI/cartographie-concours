import { useEffect, useMemo, useState } from "react";
import { type Layer, type LeafletMouseEvent, type PathOptions } from "leaflet";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { buildBoundsFromGeoJson, buildBoundsFromPoints, mergeBounds } from "../utils/bounds";
import { loadEliteCsv, type EliteHorsePoint } from "../utils/elite";
import { loadZonesGeoJson, type ZoneGeoJson, type ZoneGeoJsonFeature } from "../utils/geojson";
import { loadLieuxCsv, type LieuPoint } from "../utils/lieux";

type ZonesMapProps = {
  showZones: boolean;
  mapView: "lieux" | "elite_regions" | "haras_etalons";
  showElitePoints: boolean;
  geoJsonUrl: string;
  regionsGeoJsonUrl: string;
  lieuxCsvUrl: string;
  eliteCsvUrl: string;
  lieuFilter: string;
  onSelectionChange?: (detail: MapSelectionDetail | null) => void;
};

export type MapSelectionDetail = {
  id: string;
  typeLabel: string;
  title: string;
  subtitle?: string;
  badges?: string[];
  metrics?: Array<{ label: string; value: string }>;
  accentColor?: string;
  rows: Array<{ label: string; value: string }>;
};

const DEFAULT_CENTER: [number, number] = [33.5731, -7.5898];
const DEFAULT_ZOOM = 6;

const MAP_PALETTE = {
  charbon: "#1f2937",
  bleuGris: "#3b82f6",
  vertGris: "#14b8a6",
  beige: "#a78bfa",
  sable: "#f59e0b",
  brun: "#ef4444",
  charbonFonce: "#0f172a",
} as const;

const BASE_STYLE: PathOptions = {
  color: MAP_PALETTE.charbon,
  weight: 2,
  opacity: 0.95,
  fillColor: MAP_PALETTE.bleuGris,
  fillOpacity: 0.18,
};

const HOVER_STYLE: PathOptions = {
  ...BASE_STYLE,
  fillOpacity: 0.3,
};

type EliteRegionPoint = {
  regionName: string;
  latitude: number;
  longitude: number;
  nbChevauxElite: number;
  nbChevauxBarbe: number;
  nbChevauxArabeBarbe: number;
  nbParticipationsElite: number;
  noteEliteMoyenne: number;
  topLieux: string[];
};

type JitteredElitePoint = EliteHorsePoint & {
  displayLatitude: number;
  displayLongitude: number;
};

type HarasRatioPoint = {
  harasId: string;
  shortLabel: string;
  harasName: string;
  latitude: number;
  longitude: number;
  etalons: number;
  palfreniersRepro: number;
  ratioEtalonsParPalfrenier: number;
  ratioPalfreniersParEtalon: number;
};

type HarasReference = {
  harasId: string;
  shortLabel: string;
  token: string;
  defaultName: string;
  fallbackLatitude: number;
  fallbackLongitude: number;
  etalons: number;
  palfreniersRepro: number;
  forceFixedCoordinates?: boolean;
};

const HARAS_REFERENCE: readonly HarasReference[] = [
  {
    harasId: "bouznika",
    shortLabel: "BOUZNIKA",
    token: "bouznika",
    defaultName: "HARAS NATIONAL DE BOUZNIKA",
    fallbackLatitude: 33.781005,
    fallbackLongitude: -7.1610294,
    etalons: 18,
    palfreniersRepro: 9,
  },
  {
    harasId: "eljadida",
    shortLabel: "EL JADIDA",
    token: "jadida",
    defaultName: "HARAS NATIONAL D EL JADIDA",
    fallbackLatitude: 33.2440832,
    fallbackLongitude: -8.4767251,
    etalons: 40,
    palfreniersRepro: 11,
  },
  {
    harasId: "meknes",
    shortLabel: "MEKNES",
    token: "meknes",
    defaultName: "HARAS NATIONAL DE MEKNES",
    fallbackLatitude: 33.8991667,
    fallbackLongitude: -5.5466667,
    forceFixedCoordinates: true,
    etalons: 34,
    palfreniersRepro: 14,
  },
  {
    harasId: "marrakech",
    shortLabel: "MARRAKECH",
    token: "marrakech",
    defaultName: "HARAS NATIONAL DE MARRAKECH",
    fallbackLatitude: 31.6258257,
    fallbackLongitude: -7.9891608,
    etalons: 38,
    palfreniersRepro: 12,
  },
  {
    harasId: "oujda",
    shortLabel: "OUJDA",
    token: "oujda",
    defaultName: "HARAS NATIONAL D OUJDA",
    fallbackLatitude: 34.677874,
    fallbackLongitude: -1.929306,
    etalons: 28,
    palfreniersRepro: 16,
  },
];

type OrganizerKey = "bouznika" | "eljadida" | "meknes" | "marrakech" | "oujda";

const ORGANIZER_META: Record<
  OrganizerKey,
  { label: string; baseColor: string; lineColor: string; borderColor: string }
> = {
  bouznika: {
    label: "Haras Bouznika",
    baseColor: "#3b82f6",
    lineColor: "#93c5fd",
    borderColor: "#1d4ed8",
  },
  eljadida: {
    label: "Haras El Jadida",
    baseColor: "#ef4444",
    lineColor: "#fca5a5",
    borderColor: "#b91c1c",
  },
  meknes: {
    label: "Haras Meknes",
    baseColor: "#22c55e",
    lineColor: "#86efac",
    borderColor: "#15803d",
  },
  marrakech: {
    label: "Haras Marrakech",
    baseColor: "#f59e0b",
    lineColor: "#fcd34d",
    borderColor: "#b45309",
  },
  oujda: {
    label: "Haras Oujda",
    baseColor: "#8b5cf6",
    lineColor: "#c4b5fd",
    borderColor: "#6d28d9",
  },
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeTextForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function resolveOrganizerKey(value?: string): OrganizerKey | null {
  if (!value) {
    return null;
  }
  const normalized = normalizeTextForMatch(value);

  if (normalized.includes("BOUZNIKA")) {
    return "bouznika";
  }
  if (normalized.includes("EL JADIDA") || normalized.includes("JADIDA")) {
    return "eljadida";
  }
  if (
    normalized.includes("OUJDA") ||
    normalized.includes("GUERCIF") ||
    normalized.includes("MISSOUR") ||
    normalized.includes("AIN BENI MATHAR") ||
    normalized.includes("AIN BNI MATHAR") ||
    normalized.includes("JERADA")
  ) {
    return "oujda";
  }
  if (normalized.includes("MEKNES") || normalized.includes("IFRANE") || normalized.includes("FES")) {
    return "meknes";
  }
  if (
    normalized.includes("MARRAKECH") ||
    normalized.includes("AGADIR") ||
    normalized.includes("SEBT GZOULA") ||
    normalized.includes("FQUIH BEN SALAH") ||
    normalized.includes("FKIH BEN SALAH")
  ) {
    return "marrakech";
  }

  return null;
}

type RegionFeature = GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>;
type RegionMeta = { feature: RegionFeature; regionId: string; regionName: string };
type RegionSplitRule = {
  matchTerms: string[];
  splitLongitude: number;
  westOrganizer: OrganizerKey;
  eastOrganizer: OrganizerKey;
  forceBothSides?: boolean;
};

const REGION_SPLIT_RULES: readonly RegionSplitRule[] = [
  {
    // Fes-Meknes: division forcee en 2 comme Beni Mellal-Khenifra.
    // Partie droite (Est) en violet (Oujda), reste en vert (Meknes).
    matchTerms: ["FES", "MEKNES"],
    splitLongitude: -4.39,
    westOrganizer: "meknes",
    eastOrganizer: "oujda",
    forceBothSides: true,
  },
  {
    // Beni Mellal-Khenifra: division Meknes / Marrakech.
    matchTerms: ["BENI", "MELLAL", "KHENIFRA"],
    splitLongitude: -6.15,
    westOrganizer: "marrakech",
    eastOrganizer: "meknes",
    forceBothSides: true,
  },
];

function getRegionName(feature: RegionFeature, index: number): string {
  const props = feature.properties ?? {};
  const candidates = [
    props.zone_name,
    props.zoneName,
    props.shapeName,
    props.nom,
    props.NAME_1,
    props.name,
  ];
  const found = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return found ? String(found) : `Region ${index + 1}`;
}

function getRegionId(feature: RegionFeature, index: number): string {
  const props = feature.properties ?? {};
  const candidates = [props.zone_id, props.shapeISO, props.shapeID, props.id];
  const found = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return found ? String(found) : `region-${index + 1}`;
}

function normalizeRegionLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function regionMatchesRule(regionName: string, rule: RegionSplitRule): boolean {
  const normalized = normalizeRegionLabel(regionName);
  const aliasesFor = (term: string): string[] => {
    if (term === "FES" || term === "FEZ") {
      return ["FES", "FEZ"];
    }
    return [term];
  };
  return rule.matchTerms.every((term) =>
    aliasesFor(term).some((alias) => normalized.includes(alias)),
  );
}

function toLinearRing(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) {
    return [];
  }
  const ring: Array<[number, number]> = [];
  value.forEach((point) => {
    if (
      Array.isArray(point) &&
      point.length >= 2 &&
      typeof point[0] === "number" &&
      typeof point[1] === "number"
    ) {
      ring.push([point[0], point[1]]);
    }
  });
  return ring.length >= 3 ? ring : [];
}

function extractPolygonRings(coordinates: unknown): Array<Array<[number, number]>> {
  if (!Array.isArray(coordinates)) {
    return [];
  }
  return coordinates
    .map((ring) => toLinearRing(ring))
    .filter((ring) => ring.length >= 3);
}

function extractMultiPolygonRings(coordinates: unknown): Array<Array<Array<[number, number]>>> {
  if (!Array.isArray(coordinates)) {
    return [];
  }
  return coordinates
    .map((polygon) => extractPolygonRings(polygon))
    .filter((polygon) => polygon.length > 0);
}

function areCoordsEqual(a: [number, number], b: [number, number], epsilon = 1e-10): boolean {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

function closeRing(ring: Array<[number, number]>): Array<[number, number]> {
  if (ring.length === 0) {
    return [];
  }
  const closed = [...ring];
  if (!areCoordsEqual(closed[0], closed[closed.length - 1])) {
    closed.push(closed[0]);
  }
  return closed;
}

function dedupeConsecutiveRingPoints(ring: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  ring.forEach((point) => {
    const last = out[out.length - 1];
    if (!last || !areCoordsEqual(last, point)) {
      out.push(point);
    }
  });
  return out;
}

function intersectSegmentWithVerticalLine(
  a: [number, number],
  b: [number, number],
  longitude: number,
): [number, number] {
  const [ax, ay] = a;
  const [bx, by] = b;
  if (Math.abs(bx - ax) < 1e-12) {
    return [longitude, ay];
  }
  const t = (longitude - ax) / (bx - ax);
  const y = ay + (by - ay) * t;
  return [longitude, y];
}

function clipRingByLongitudeHalfPlane(
  ring: Array<[number, number]>,
  splitLongitude: number,
  keepEast: boolean,
): Array<[number, number]> | null {
  const source = closeRing(ring);
  if (source.length < 4) {
    return null;
  }

  const isInside = (point: [number, number]) =>
    keepEast ? point[0] >= splitLongitude : point[0] <= splitLongitude;

  const clipped: Array<[number, number]> = [];

  for (let i = 0; i < source.length - 1; i += 1) {
    const current = source[i];
    const next = source[i + 1];
    const currentInside = isInside(current);
    const nextInside = isInside(next);

    if (nextInside) {
      if (!currentInside) {
        clipped.push(intersectSegmentWithVerticalLine(current, next, splitLongitude));
      }
      clipped.push(next);
      continue;
    }

    if (currentInside) {
      clipped.push(intersectSegmentWithVerticalLine(current, next, splitLongitude));
    }
  }

  const deduped = dedupeConsecutiveRingPoints(clipped);
  if (deduped.length < 3) {
    return null;
  }
  const closed = closeRing(deduped);
  if (closed.length < 4) {
    return null;
  }
  return closed;
}

function extractOuterRingsFromFeature(feature: RegionFeature): Array<Array<[number, number]>> {
  if (!feature.geometry) {
    return [];
  }
  if (feature.geometry.type === "Polygon") {
    const rings = extractPolygonRings((feature.geometry as GeoJSON.Polygon).coordinates);
    return rings.length > 0 ? [rings[0]] : [];
  }
  if (feature.geometry.type === "MultiPolygon") {
    const polygons = extractMultiPolygonRings((feature.geometry as GeoJSON.MultiPolygon).coordinates);
    return polygons
      .map((polygonRings) => polygonRings[0])
      .filter((ring): ring is Array<[number, number]> => Array.isArray(ring) && ring.length >= 3);
  }
  return [];
}

function buildSingleRegionFeatureCollection(feature: RegionFeature): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [feature],
  };
}

function buildSplitRegionFeatureCollection(
  feature: RegionFeature,
  splitLongitude: number,
  keepEast: boolean,
): GeoJSON.FeatureCollection {
  const outerRings = extractOuterRingsFromFeature(feature);
  const splitFeatures: GeoJSON.Feature[] = outerRings
    .map((ring) => clipRingByLongitudeHalfPlane(ring, splitLongitude, keepEast))
    .filter((ring): ring is Array<[number, number]> => Boolean(ring && ring.length >= 4))
    .map((ring) => {
      const coords = ring.map((point) => [point[0], point[1]] as GeoJSON.Position);
      const geometry: GeoJSON.Polygon = {
        type: "Polygon",
        coordinates: [coords],
      };
      return {
        type: "Feature",
        properties: { ...(feature.properties ?? {}) },
        geometry,
      } as GeoJSON.Feature;
    });

  return {
    type: "FeatureCollection",
    features: splitFeatures,
  };
}

function isPointOnSegment(
  lng: number,
  lat: number,
  a: [number, number],
  b: [number, number],
  epsilon = 1e-10,
): boolean {
  const [ax, ay] = a;
  const [bx, by] = b;
  const cross = (lat - ay) * (bx - ax) - (lng - ax) * (by - ay);
  if (Math.abs(cross) > epsilon) {
    return false;
  }
  const dot = (lng - ax) * (lng - bx) + (lat - ay) * (lat - by);
  return dot <= epsilon;
}

function isPointInLinearRing(lng: number, lat: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const pi = ring[i];
    const pj = ring[j];
    if (isPointOnSegment(lng, lat, pj, pi)) {
      return true;
    }
    const intersects =
      (pi[1] > lat) !== (pj[1] > lat) &&
      lng < ((pj[0] - pi[0]) * (lat - pi[1])) / (pj[1] - pi[1]) + pi[0];
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function isPointInPolygonRings(
  lng: number,
  lat: number,
  rings: Array<Array<[number, number]>>,
): boolean {
  if (rings.length === 0) {
    return false;
  }
  if (!isPointInLinearRing(lng, lat, rings[0])) {
    return false;
  }
  for (let i = 1; i < rings.length; i += 1) {
    if (isPointInLinearRing(lng, lat, rings[i])) {
      return false;
    }
  }
  return true;
}

function isPointInRegionFeature(feature: RegionFeature, lng: number, lat: number): boolean {
  const geometry = feature.geometry;
  if (!geometry) {
    return false;
  }
  if (geometry.type === "Polygon") {
    const rings = extractPolygonRings((geometry as GeoJSON.Polygon).coordinates);
    return isPointInPolygonRings(lng, lat, rings);
  }
  if (geometry.type === "MultiPolygon") {
    const polygons = extractMultiPolygonRings((geometry as GeoJSON.MultiPolygon).coordinates);
    return polygons.some((rings) => isPointInPolygonRings(lng, lat, rings));
  }
  return false;
}

function findRegionForPoint(
  regions: RegionMeta[],
  lng: number,
  lat: number,
): RegionMeta | null {
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    if (!isPointInRegionFeature(region.feature, lng, lat)) {
      continue;
    }
    return region;
  }
  return null;
}

function roundRatioToInteger(value: number): number {
  const truncated = Math.trunc(value);
  const decimalPart = value - truncated;
  return decimalPart >= 0.5 ? Math.ceil(value) : Math.floor(value);
}

function splitRaceReference(value: string): string[] {
  return value
    .split(/[\/|,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function formatLieuDisplayName(value?: string): string {
  if (!value) {
    return "";
  }
  return value.replace(/^\s*CPEE\s+(?:DE|DU|D['’])?\s*/i, "").trim();
}

function getRaceChipMeta(raceValue: string): { label: string; className: string } {
  const race = raceValue.trim().toUpperCase();
  if (race === "ARBE" || race.includes("ARABE BARBE")) {
    return { label: "ARABE BARBE", className: "dist-chip-arbe" };
  }
  if (race === "BARBE") {
    return { label: "BARBE", className: "dist-chip-ar" };
  }
  return { label: raceValue.trim(), className: "dist-chip" };
}

function compactRows(
  rows: Array<{ label: string; value: string | number | null | undefined }>,
): Array<{ label: string; value: string }> {
  return rows
    .filter((row) => row.value !== null && row.value !== undefined && String(row.value).trim().length > 0)
    .map((row) => ({ label: row.label, value: String(row.value) }));
}

function formatIntegerMetric(value?: number): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return String(Math.round(value));
}

function buildHarasRatioPoints(lieux: LieuPoint[]): HarasRatioPoint[] {
  return HARAS_REFERENCE.map((item) => {
    const match = lieux.find((lieu) => normalizeKey(lieu.lieuNom).includes(item.token));
    const useFixedCoordinates = item.forceFixedCoordinates === true;
    const etalons = item.etalons;
    const palfreniersRepro = item.palfreniersRepro;

    return {
      harasId: item.harasId,
      shortLabel: item.shortLabel,
      harasName: match?.lieuNom ?? item.defaultName,
      latitude: useFixedCoordinates ? item.fallbackLatitude : match?.latitude ?? item.fallbackLatitude,
      longitude:
        useFixedCoordinates ? item.fallbackLongitude : match?.longitude ?? item.fallbackLongitude,
      etalons,
      palfreniersRepro,
      ratioEtalonsParPalfrenier: palfreniersRepro > 0 ? etalons / palfreniersRepro : 0,
      ratioPalfreniersParEtalon: etalons > 0 ? palfreniersRepro / etalons : 0,
    };
  }).sort((a, b) => b.etalons - a.etalons);
}

function buildJitteredElitePoints(points: EliteHorsePoint[]): JitteredElitePoint[] {
  const byCoord = new Map<string, EliteHorsePoint[]>();

  points.forEach((point) => {
    const key = `${point.latitude.toFixed(6)}|${point.longitude.toFixed(6)}`;
    if (!byCoord.has(key)) {
      byCoord.set(key, []);
    }
    byCoord.get(key)?.push(point);
  });

  const out: JitteredElitePoint[] = [];
  byCoord.forEach((group) => {
    const ordered = [...group].sort((a, b) =>
      a.cheval.localeCompare(b.cheval, "fr", { sensitivity: "base" }),
    );

    ordered.forEach((point, index) => {
      if (ordered.length === 1) {
        out.push({
          ...point,
          displayLatitude: point.latitude,
          displayLongitude: point.longitude,
        });
        return;
      }

      // Spread nearby points so elite horses at the same venue stay clickable.
      const angle = (index * 137.508) * (Math.PI / 180);
      const radius = 0.0011 * Math.sqrt(index + 1);
      const cosLat = Math.max(Math.cos((point.latitude * Math.PI) / 180), 0.2);
      const latOffset = radius * Math.sin(angle);
      const lngOffset = (radius * Math.cos(angle)) / cosLat;

      out.push({
        ...point,
        displayLatitude: point.latitude + latOffset,
        displayLongitude: point.longitude + lngOffset,
      });
    });
  });

  return out;
}

function aggregateEliteByRegion(
  points: EliteHorsePoint[],
  lieuxByName: Map<string, LieuPoint>,
): EliteRegionPoint[] {
  const grouped = new Map<
    string,
    {
      regionName: string;
      latSum: number;
      lonSum: number;
      coordCount: number;
      chevaux: Set<string>;
      chevauxBarbe: Set<string>;
      chevauxArabeBarbe: Set<string>;
      participations: number;
      noteWeighted: number;
      lieuxCount: Map<string, number>;
    }
  >();

  points.forEach((point) => {
    const lieu = lieuxByName.get(normalizeKey(point.lieu));
    const regionName = (lieu?.ville || lieu?.lieuNom || point.lieu || "Region inconnue").trim();
    const latitude = lieu?.latitude ?? point.latitude;
    const longitude = lieu?.longitude ?? point.longitude;

    if (!grouped.has(regionName)) {
      grouped.set(regionName, {
        regionName,
        latSum: 0,
        lonSum: 0,
        coordCount: 0,
        chevaux: new Set<string>(),
        chevauxBarbe: new Set<string>(),
        chevauxArabeBarbe: new Set<string>(),
        participations: 0,
        noteWeighted: 0,
        lieuxCount: new Map<string, number>(),
      });
    }

    const acc = grouped.get(regionName);
    if (!acc) {
      return;
    }

    acc.latSum += latitude;
    acc.lonSum += longitude;
    acc.coordCount += 1;
    acc.chevaux.add(point.cheval);
    const race = point.raceReference.trim().toUpperCase();
    if (race === "BARBE") {
      acc.chevauxBarbe.add(point.cheval);
    } else if (race === "ARBE") {
      acc.chevauxArabeBarbe.add(point.cheval);
    }
    acc.participations += point.participationsElite;
    acc.noteWeighted += point.noteEliteMoyenne * Math.max(point.participationsElite, 1);

    const lieuName = point.lieu || "Lieu inconnu";
    acc.lieuxCount.set(lieuName, (acc.lieuxCount.get(lieuName) ?? 0) + 1);
  });

  return Array.from(grouped.values())
    .map((acc) => {
      const topLieux = Array.from(acc.lieuxCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map((item) => item[0]);

      return {
        regionName: acc.regionName,
        latitude: acc.latSum / Math.max(acc.coordCount, 1),
        longitude: acc.lonSum / Math.max(acc.coordCount, 1),
        nbChevauxElite: acc.chevaux.size,
        nbChevauxBarbe: acc.chevauxBarbe.size,
        nbChevauxArabeBarbe: acc.chevauxArabeBarbe.size,
        nbParticipationsElite: acc.participations,
        noteEliteMoyenne:
          acc.participations > 0 ? acc.noteWeighted / acc.participations : 0,
        topLieux,
      };
    })
    .sort((a, b) => b.nbChevauxElite - a.nbChevauxElite);
}

function FitBounds({
  geojson,
  points,
  enabled,
}: {
  geojson: GeoJSON.FeatureCollection | null;
  points: Array<{ latitude: number; longitude: number }>;
  enabled: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const zoneBounds = geojson ? buildBoundsFromGeoJson(geojson) : null;
    const lieuBounds = buildBoundsFromPoints(points);
    const bounds = mergeBounds(zoneBounds, lieuBounds);
    if (bounds) {
      map.fitBounds(bounds, { padding: [32, 32] });
    }
  }, [geojson, points, enabled, map]);

  return null;
}

function buildPopupHtml(feature: ZoneGeoJsonFeature): string {
  const zoneName = feature.properties.zone_name ?? "Zone sans nom";
  const zoneId = feature.properties.zone_id ?? "N/A";
  return `<div class="leaflet-popup-content-custom"><strong>Zone:</strong> ${zoneName}<br/><strong>ID:</strong> ${zoneId}</div>`;
}

export default function ZonesMap({
  showZones,
  mapView,
  showElitePoints,
  geoJsonUrl,
  regionsGeoJsonUrl,
  lieuxCsvUrl,
  eliteCsvUrl,
  lieuFilter,
  onSelectionChange,
}: ZonesMapProps) {
  const [geojson, setGeojson] = useState<ZoneGeoJson | null>(null);
  const [regionsGeojson, setRegionsGeojson] = useState<ZoneGeoJson | null>(null);
  const [lieux, setLieux] = useState<LieuPoint[]>([]);
  const [elitePoints, setElitePoints] = useState<EliteHorsePoint[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [regionsError, setRegionsError] = useState<string | null>(null);
  const [lieuxError, setLieuxError] = useState<string | null>(null);
  const [eliteError, setEliteError] = useState<string | null>(null);

  useEffect(() => {
    onSelectionChange?.(null);
  }, [mapView, onSelectionChange]);

  useEffect(() => {
    if (!showZones) {
      setDataError(null);
      setGeojson(null);
      return;
    }

    let cancelled = false;

    async function fetchGeoJson() {
      try {
        setDataError(null);
        const zones = await loadZonesGeoJson(geoJsonUrl);
        if (!cancelled) {
          setGeojson(zones);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "GeoJSON introuvable.";
          setDataError(message || "GeoJSON introuvable.");
          setGeojson(null);
        }
      }
    }

    void fetchGeoJson();
    return () => {
      cancelled = true;
    };
  }, [geoJsonUrl, showZones]);

  useEffect(() => {
    if (!regionsGeoJsonUrl) {
      setRegionsGeojson(null);
      setRegionsError(null);
      return;
    }

    let cancelled = false;

    async function fetchRegionsGeoJson() {
      try {
        setRegionsError(null);
        const regions = await loadZonesGeoJson(regionsGeoJsonUrl);
        if (!cancelled) {
          setRegionsGeojson(regions);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Regions introuvables.";
          setRegionsError(message || "Regions introuvables.");
          setRegionsGeojson(null);
        }
      }
    }

    void fetchRegionsGeoJson();
    return () => {
      cancelled = true;
    };
  }, [regionsGeoJsonUrl]);

  useEffect(() => {
    let cancelled = false;

    async function fetchLieux() {
      try {
        setLieuxError(null);
        const points = await loadLieuxCsv(lieuxCsvUrl);
        if (!cancelled) {
          setLieux(points);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Lieux introuvables.";
          setLieuxError(message || "Lieux introuvables.");
          setLieux([]);
        }
      }
    }

    void fetchLieux();
    return () => {
      cancelled = true;
    };
  }, [lieuxCsvUrl]);

  useEffect(() => {
    let cancelled = false;

    async function fetchElite() {
      try {
        setEliteError(null);
        const points = await loadEliteCsv(eliteCsvUrl);
        if (!cancelled) {
          setElitePoints(points);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Chevaux elite introuvables.";
          setEliteError(message || "Chevaux elite introuvables.");
          setElitePoints([]);
        }
      }
    }

    void fetchElite();
    return () => {
      cancelled = true;
    };
  }, [eliteCsvUrl]);

  const zoneGeoData = useMemo(() => geojson as unknown as GeoJSON.GeoJsonObject, [geojson]);
  const regionsGeoData = useMemo(
    () => regionsGeojson as unknown as GeoJSON.FeatureCollection | null,
    [regionsGeojson],
  );

  const lieuxByName = useMemo(() => {
    const out = new Map<string, LieuPoint>();
    lieux.forEach((lieu) => {
      out.set(normalizeKey(lieu.lieuNom), lieu);
    });
    return out;
  }, [lieux]);

  const filteredLieux = useMemo(() => {
    const term = lieuFilter.trim().toLowerCase();
    if (!term) {
      return lieux;
    }
    return lieux.filter((lieu) => {
      const haystack =
        `${lieu.lieuNom} ${lieu.ville} ${lieu.adresse} ${lieu.harasOrganisateur ?? ""} ${lieu.anneeReference ?? ""} ${lieu.raceReference ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [lieuFilter, lieux]);

  const filteredElite = useMemo(() => {
    const term = lieuFilter.trim().toLowerCase();
    if (!term) {
      return elitePoints;
    }
    return elitePoints.filter((point) => {
      const region = lieuxByName.get(normalizeKey(point.lieu))?.ville ?? "";
      const haystack =
        `${point.cheval} ${point.lieu} ${point.concoursReference} ${point.raceReference} ${region}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [lieuFilter, elitePoints, lieuxByName]);

  const filteredHaras = useMemo(() => {
    const term = lieuFilter.trim().toLowerCase();
    const allHaras = buildHarasRatioPoints(lieux);
    if (!term) {
      return allHaras;
    }
    return allHaras.filter((haras) =>
      `${haras.shortLabel} ${haras.harasName}`.toLowerCase().includes(term),
    );
  }, [lieuFilter, lieux]);

  const lieuxOrganizerData = useMemo(
    () =>
      filteredLieux.map((lieu) => {
        const organizerKey =
          resolveOrganizerKey(lieu.harasOrganisateur) ??
          resolveOrganizerKey(lieu.lieuNom) ??
          resolveOrganizerKey(lieu.ville);
        return { lieu, organizerKey };
      }),
    [filteredLieux],
  );

  const harasAnchors = useMemo(() => {
    return HARAS_REFERENCE.map((ref) => {
      const organizerKey = ref.harasId as OrganizerKey;
      const useFixedCoordinates = ref.forceFixedCoordinates === true;
      const match = lieux.find((lieu) => {
        const lieuOrganizerKey =
          resolveOrganizerKey(lieu.harasOrganisateur) ?? resolveOrganizerKey(lieu.lieuNom);
        if (lieuOrganizerKey !== organizerKey) {
          return false;
        }
        return normalizeKey(lieu.lieuNom).includes(ref.token);
      });

      return {
        organizerKey,
        label: ORGANIZER_META[organizerKey].label,
        latitude: useFixedCoordinates ? ref.fallbackLatitude : match?.latitude ?? ref.fallbackLatitude,
        longitude:
          useFixedCoordinates ? ref.fallbackLongitude : match?.longitude ?? ref.fallbackLongitude,
      };
    });
  }, [lieux]);

  const harasAnchorByKey = useMemo(() => {
    const out = new Map<OrganizerKey, { latitude: number; longitude: number; label: string }>();
    harasAnchors.forEach((item) => {
      out.set(item.organizerKey, {
        latitude: item.latitude,
        longitude: item.longitude,
        label: item.label,
      });
    });
    return out;
  }, [harasAnchors]);

  const organizerRegionOverlays = useMemo(() => {
    if (!regionsGeoData) {
      return [];
    }

    const regionFeatures = regionsGeoData.features.filter(
      (feature): feature is RegionFeature => Boolean(feature && feature.geometry),
    );
    const regions = regionFeatures.map((feature, index) => ({
      feature,
      regionId: getRegionId(feature, index),
      regionName: getRegionName(feature, index),
    }));
    const overlaysByOrganizer = new Map<
      OrganizerKey,
      Map<
        string,
        {
          featureCollection: GeoJSON.FeatureCollection;
          regionName: string;
          concoursCount: number;
          hasHaras: boolean;
        }
      >
    >();
    (Object.keys(ORGANIZER_META) as OrganizerKey[]).forEach((organizerKey) => {
      overlaysByOrganizer.set(organizerKey, new Map());
    });

    const registerPoint = (
      organizerKey: OrganizerKey,
      latitude: number,
      longitude: number,
      pointType: "haras" | "concours",
    ) => {
      const regionMatch = findRegionForPoint(regions, longitude, latitude);
      if (!regionMatch) {
        return;
      }
      const regionsForOrganizer = overlaysByOrganizer.get(organizerKey);
      if (!regionsForOrganizer) {
        return;
      }
      const existing = regionsForOrganizer.get(regionMatch.regionId);
      if (existing) {
        if (pointType === "haras") {
          existing.hasHaras = true;
        } else {
          existing.concoursCount += 1;
        }
        return;
      }
      regionsForOrganizer.set(regionMatch.regionId, {
        featureCollection: buildSingleRegionFeatureCollection(regionMatch.feature),
        regionName: regionMatch.regionName,
        concoursCount: pointType === "concours" ? 1 : 0,
        hasHaras: pointType === "haras",
      });
    };

    harasAnchors.forEach((haras) => {
      registerPoint(haras.organizerKey, haras.latitude, haras.longitude, "haras");
    });
    lieuxOrganizerData.forEach(({ lieu, organizerKey }) => {
      if (!organizerKey) {
        return;
      }
      registerPoint(organizerKey, lieu.latitude, lieu.longitude, "concours");
    });

    REGION_SPLIT_RULES.forEach((rule) => {
      regions
        .filter((region) => regionMatchesRule(region.regionName, rule))
        .forEach((region) => {
          let westOrganizer = rule.westOrganizer;
          let eastOrganizer = rule.eastOrganizer;

          if (
            rule.matchTerms.includes("BENI") &&
            rule.matchTerms.includes("MELLAL") &&
            rule.matchTerms.includes("KHENIFRA")
          ) {
            // Keep Khenifra side attached to Meknes (green), opposite side to Marrakech.
            const khenifraLongitude = -5.67;
            const khenifraIsOnEastSide = khenifraLongitude >= rule.splitLongitude;
            if (khenifraIsOnEastSide) {
              eastOrganizer = "meknes";
              westOrganizer = "marrakech";
            } else {
              westOrganizer = "meknes";
              eastOrganizer = "marrakech";
            }
          }

          const organizers = Object.keys(ORGANIZER_META) as OrganizerKey[];
          const hadAny = organizers.some((key) =>
            overlaysByOrganizer.get(key)?.has(region.regionId),
          );
          if (!hadAny) {
            return;
          }

          const westExisting = overlaysByOrganizer.get(westOrganizer)?.get(region.regionId);
          const eastExisting = overlaysByOrganizer.get(eastOrganizer)?.get(region.regionId);

          organizers.forEach((key) => {
            overlaysByOrganizer.get(key)?.delete(region.regionId);
          });

          const westSplit = buildSplitRegionFeatureCollection(
            region.feature,
            rule.splitLongitude,
            false,
          );
          const eastSplit = buildSplitRegionFeatureCollection(
            region.feature,
            rule.splitLongitude,
            true,
          );

          const shouldShowWest = rule.forceBothSides === true || Boolean(westExisting);
          const shouldShowEast = rule.forceBothSides === true || Boolean(eastExisting);

          if (shouldShowWest) {
            const westTarget = overlaysByOrganizer.get(westOrganizer);
            if (westTarget) {
              westTarget.set(`${region.regionId}-west`, {
                featureCollection:
                  westSplit.features.length > 0
                    ? westSplit
                    : buildSingleRegionFeatureCollection(region.feature),
                regionName: `${region.regionName} - Ouest`,
                concoursCount: westExisting?.concoursCount ?? 0,
                hasHaras: westExisting?.hasHaras ?? false,
              });
            }
          }

          if (shouldShowEast) {
            const eastTarget = overlaysByOrganizer.get(eastOrganizer);
            if (eastTarget) {
              eastTarget.set(`${region.regionId}-east`, {
                featureCollection:
                  eastSplit.features.length > 0
                    ? eastSplit
                    : buildSingleRegionFeatureCollection(region.feature),
                regionName: `${region.regionName} - Est`,
                concoursCount: eastExisting?.concoursCount ?? 0,
                hasHaras: eastExisting?.hasHaras ?? false,
              });
            }
          }
        });
    });

    const overlayOrganizerKeys = (Object.keys(ORGANIZER_META) as OrganizerKey[]).filter(
      (organizerKey) => organizerKey !== "eljadida" && organizerKey !== "bouznika",
    );

    return overlayOrganizerKeys
      .map((organizerKey) => {
        const entries = Array.from(overlaysByOrganizer.get(organizerKey)?.values() ?? []);
        if (entries.length === 0) {
          return null;
        }
        const featureCollection: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: entries.flatMap((entry) => entry.featureCollection.features),
        };
        return {
          organizerKey,
          featureCollection,
          regionCount: entries.length,
          concoursCount: entries.reduce((sum, entry) => sum + entry.concoursCount, 0),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [regionsGeoData, harasAnchors, lieuxOrganizerData]);

  const eliteRegionPoints = useMemo(
    () => aggregateEliteByRegion(filteredElite, lieuxByName),
    [filteredElite, lieuxByName],
  );
  const jitteredElitePoints = useMemo(
    () => buildJitteredElitePoints(filteredElite),
    [filteredElite],
  );

  const fitPoints = useMemo(() => {
    if (mapView === "elite_regions") {
      const regionPoints = eliteRegionPoints.map((item) => ({
        latitude: item.latitude,
        longitude: item.longitude,
      }));
      if (!showElitePoints) {
        return regionPoints;
      }
      return [
        ...regionPoints,
        ...jitteredElitePoints.map((item) => ({
          latitude: item.displayLatitude,
          longitude: item.displayLongitude,
        })),
      ];
    }
    if (mapView === "haras_etalons") {
      return filteredHaras.map((item) => ({
        latitude: item.latitude,
        longitude: item.longitude,
      }));
    }

    return [
      ...lieuxOrganizerData.map((item) => ({
        latitude: item.lieu.latitude,
        longitude: item.lieu.longitude,
      })),
      ...harasAnchors.map((item) => ({
        latitude: item.latitude,
        longitude: item.longitude,
      })),
    ];
  }, [
    mapView,
    filteredHaras,
    eliteRegionPoints,
    jitteredElitePoints,
    lieuxOrganizerData,
    harasAnchors,
    showElitePoints,
  ]);

  const onEachFeature = (feature: GeoJSON.Feature, layer: Layer) => {
    const zoneFeature = feature as unknown as ZoneGeoJsonFeature;
    const popupHtml = buildPopupHtml(zoneFeature);
    layer.bindPopup(popupHtml);

    layer.on("mouseover", () => {
      const shape = layer as Layer & { setStyle?: (style: PathOptions) => void };
      shape.setStyle?.(HOVER_STYLE);
    });

    layer.on("mouseout", () => {
      const shape = layer as Layer & { setStyle?: (style: PathOptions) => void };
      shape.setStyle?.(BASE_STYLE);
    });

    layer.on("click", (event: LeafletMouseEvent) => {
      layer.openPopup(event.latlng);
    });
  };

  const selectLieu = (lieu: LieuPoint) => {
    const organizerKey =
      resolveOrganizerKey(lieu.harasOrganisateur) ??
      resolveOrganizerKey(lieu.lieuNom) ??
      resolveOrganizerKey(lieu.ville);
    const organizerMeta = organizerKey ? ORGANIZER_META[organizerKey] : null;
    const racePartsFromCsv = splitRaceReference(lieu.raceReference ?? "");
    const inferredRaceParts: string[] = [];
    if ((lieu.nbLignesAr ?? 0) > 0 || (lieu.nbEvenementsAr ?? 0) > 0) {
      inferredRaceParts.push("BARBE");
    }
    if ((lieu.nbLignesArbe ?? 0) > 0 || (lieu.nbEvenementsArbe ?? 0) > 0) {
      inferredRaceParts.push("ARABE BARBE");
    }
    const mergedRaceParts = [...racePartsFromCsv, ...inferredRaceParts];
    const raceBadges = Array.from(
      new Set(
        mergedRaceParts
          .map((racePart) => getRaceChipMeta(racePart).label)
          .filter((label) => label.length > 0),
      ),
    );

    const participationsBarbe = formatIntegerMetric(lieu.nbLignesAr);
    const participationsArabeBarbe = formatIntegerMetric(lieu.nbLignesArbe);
    const totalParticipations =
      typeof lieu.nbLignesAr === "number" || typeof lieu.nbLignesArbe === "number"
        ? formatIntegerMetric((lieu.nbLignesAr ?? 0) + (lieu.nbLignesArbe ?? 0))
        : undefined;

    onSelectionChange?.({
      id: lieu.lieuId,
      typeLabel: "Concours",
      title: formatLieuDisplayName(lieu.lieuNom),
      subtitle: lieu.popupLabel || undefined,
      badges: raceBadges,
      metrics: compactRows([
        { label: "Part. BARBE", value: participationsBarbe },
        { label: "Part. ARABE BARBE", value: participationsArabeBarbe },
        { label: "Journees", value: formatIntegerMetric(lieu.nbJournees) },
        { label: "Total participants", value: totalParticipations },
      ]),
      accentColor: organizerMeta?.baseColor,
      rows: compactRows([
        { label: "Lieu concours", value: lieu.ville || formatLieuDisplayName(lieu.lieuNom) },
        { label: "Haras organisateur", value: lieu.harasOrganisateur || organizerMeta?.label },
        { label: "Periode", value: lieu.anneeReference || "2025" },
      ]),
    });
  };

  const selectHarasAnchor = (organizerKey: OrganizerKey) => {
    const meta = ORGANIZER_META[organizerKey];
    onSelectionChange?.({
      id: `anchor-${organizerKey}`,
      typeLabel: "Haras principal",
      title: meta.label,
      accentColor: meta.baseColor,
      rows: compactRows([
        { label: "Type", value: "Haras national" },
      ]),
    });
  };

  const selectEliteRegion = (region: EliteRegionPoint) => {
    onSelectionChange?.({
      id: `elite-region-${region.regionName}`,
      typeLabel: "Region elite",
      title: region.regionName,
      accentColor: MAP_PALETTE.sable,
      rows: compactRows([
        { label: "Chevaux elite", value: region.nbChevauxElite },
        { label: "BARBE", value: region.nbChevauxBarbe },
        { label: "ARABE BARBE", value: region.nbChevauxArabeBarbe },
        { label: "Participations elite", value: region.nbParticipationsElite },
        { label: "Note elite moyenne", value: `${region.noteEliteMoyenne.toFixed(2)} / 100` },
        { label: "Top lieux", value: region.topLieux.join(", ") },
        { label: "Periode", value: "2025 seulement" },
      ]),
    });
  };

  const selectEliteHorse = (elite: EliteHorsePoint) => {
    const race = elite.raceReference.trim().toUpperCase();
    const raceLabel = race === "ARBE" ? "ARABE BARBE" : race || "N/A";
    const isArabeBarbe = race === "ARBE" || raceLabel.includes("ARABE");
    onSelectionChange?.({
      id: elite.id,
      typeLabel: "Cheval elite",
      title: elite.cheval,
      subtitle: elite.concoursReference || undefined,
      badges: [raceLabel],
      accentColor: isArabeBarbe ? "#2563eb" : "#ef4444",
      rows: compactRows([
        { label: "Race", value: raceLabel },
        { label: "Note max", value: `${elite.noteEliteMax.toFixed(2)} / 100` },
        { label: "Note moyenne", value: `${elite.noteEliteMoyenne.toFixed(2)} / 100` },
        { label: "Participations elite", value: elite.participationsElite },
        { label: "Lieu", value: elite.lieu },
        { label: "Date", value: elite.dateReference },
      ]),
    });
  };

  const selectHarasRatio = (haras: HarasRatioPoint) => {
    const organizerMeta =
      ORGANIZER_META[haras.harasId as OrganizerKey] ?? ORGANIZER_META.meknes;
    onSelectionChange?.({
      id: `haras-${haras.harasId}`,
      typeLabel: "Haras etalons",
      title: haras.shortLabel,
      subtitle: haras.harasName,
      accentColor: organizerMeta.baseColor,
      rows: compactRows([
        { label: "Etalons", value: haras.etalons },
        { label: "Palfreniers (repro)", value: haras.palfreniersRepro },
        { label: "E/p", value: roundRatioToInteger(haras.ratioEtalonsParPalfrenier) },
        { label: "P/e", value: roundRatioToInteger(haras.ratioPalfreniersParEtalon) },
      ]),
    });
  };

  return (
    <div className="map-shell">
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {showZones && geojson && (
          <GeoJSON
            data={zoneGeoData}
            style={BASE_STYLE}
            onEachFeature={onEachFeature}
          />
        )}

        {mapView === "lieux" && regionsGeoData && (
          <GeoJSON
            data={regionsGeoData}
            style={() => ({
              color: "#475569",
              weight: 1.05,
              opacity: 0.78,
              fillColor: "#f8fafc",
              fillOpacity: 0.18,
            })}
            interactive={false}
          />
        )}

        {mapView === "lieux" &&
          organizerRegionOverlays.map((overlay) => {
            const meta = ORGANIZER_META[overlay.organizerKey];
            return [
              <GeoJSON
                key={`overlay-border-halo-${overlay.organizerKey}`}
                data={overlay.featureCollection}
                style={() => ({
                  color: "#ffffff",
                  weight: 3.2,
                  opacity: 0.88,
                  fillOpacity: 0,
                })}
                interactive={false}
              />,
              <GeoJSON
                key={`overlay-region-${overlay.organizerKey}`}
                data={overlay.featureCollection}
                style={() => ({
                  color: meta.borderColor,
                  weight: 1.8,
                  opacity: 0.98,
                  fillColor: meta.baseColor,
                  fillOpacity: 0.32,
                })}
                interactive={false}
              />,
            ];
          })}

        {mapView === "lieux" &&
          lieuxOrganizerData.map(({ lieu, organizerKey }) => {
            if (!organizerKey) {
              return null;
            }
            const harasAnchor = harasAnchorByKey.get(organizerKey);
            if (!harasAnchor) {
              return null;
            }
            const isHarasItself =
              Math.abs(lieu.latitude - harasAnchor.latitude) < 0.0005 &&
              Math.abs(lieu.longitude - harasAnchor.longitude) < 0.0005;
            if (isHarasItself) {
              return null;
            }
            return (
              <Polyline
                key={`coverage-${lieu.lieuId}`}
                positions={[
                  [harasAnchor.latitude, harasAnchor.longitude],
                  [lieu.latitude, lieu.longitude],
                ]}
                pathOptions={{
                  color: ORGANIZER_META[organizerKey].lineColor,
                  weight: 1.4,
                  opacity: 0.45,
                  dashArray: "5 7",
                }}
              />
            );
          })}

        {mapView === "lieux" &&
          lieuxOrganizerData.map(({ lieu, organizerKey }) => {
            const colorMeta = organizerKey ? ORGANIZER_META[organizerKey] : null;
            const activity = Math.max(lieu.nbJournees ?? 1, lieu.nbConcours ?? 1);
            const pointRadius = 4 + Math.min(activity, 5) * 0.45;
            const harasAnchor = organizerKey ? harasAnchorByKey.get(organizerKey) : null;
            const isHarasAnchorPoint =
              !!harasAnchor &&
              Math.abs(lieu.latitude - harasAnchor.latitude) < 0.02 &&
              Math.abs(lieu.longitude - harasAnchor.longitude) < 0.02;
            const normalizedLieuName = normalizeTextForMatch(lieu.lieuNom);
            const isHarasLieuName =
              normalizedLieuName.includes("HARAS NATIONAL") ||
              normalizedLieuName.includes("HARAS ") ||
              normalizedLieuName.startsWith("HN ");
            const showConcoursLabel = !isHarasAnchorPoint && !isHarasLieuName;
            return (
              <CircleMarker
                key={lieu.lieuId}
                center={[lieu.latitude, lieu.longitude]}
                radius={pointRadius}
                pathOptions={{
                  color: colorMeta?.borderColor ?? MAP_PALETTE.charbon,
                  weight: 1.2,
                  fillColor: colorMeta?.baseColor ?? MAP_PALETTE.bleuGris,
                  fillOpacity: 0.9,
                }}
                eventHandlers={{
                  click: () => selectLieu(lieu),
                }}
              >
                {showConcoursLabel && (
                  <Tooltip
                    permanent
                  direction="top"
                  offset={[0, -8]}
                  className="concours-tooltip"
                >
                    <div className="concours-tooltip-content">
                      {formatLieuDisplayName(lieu.lieuNom)}
                    </div>
                  </Tooltip>
                )}
                <Popup>
                  <div className="leaflet-popup-content-custom">
                    <strong>Lieu:</strong> {formatLieuDisplayName(lieu.lieuNom)}
                    {lieu.popupLabel && (
                      <>
                        <br />
                        <strong>Reference:</strong> {lieu.popupLabel}
                      </>
                    )}
                    {lieu.harasOrganisateur && (
                      <>
                        <br />
                        <strong>Haras organisateur:</strong> {lieu.harasOrganisateur}
                      </>
                    )}
                    {typeof lieu.nbJournees === "number" && (
                      <>
                        <br />
                        <strong>Journees:</strong> {lieu.nbJournees}
                      </>
                    )}
                    {typeof lieu.nbConcours === "number" && (
                      <>
                        <br />
                        <strong>Concours organises:</strong> {lieu.nbConcours}
                      </>
                    )}
                    {lieu.raceReference && (
                      <>
                        <br />
                        <strong>Race:</strong>
                        <div className="dist-line">
                          {splitRaceReference(lieu.raceReference).map((racePart, index) => {
                            const raceMeta = getRaceChipMeta(racePart);
                            return (
                              <span
                                key={`${lieu.lieuId}-race-${raceMeta.label}-${index}`}
                                className={`dist-chip ${raceMeta.className}`}
                              >
                                {raceMeta.label}
                              </span>
                            );
                          })}
                        </div>
                      </>
                    )}
                    <>
                      <br />
                      <strong>Periode:</strong> {lieu.anneeReference || "2025"}
                    </>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        {mapView === "lieux" &&
          harasAnchors.map((haras) => {
            const colorMeta = ORGANIZER_META[haras.organizerKey];
            return (
              <CircleMarker
                key={`anchor-${haras.organizerKey}`}
                center={[haras.latitude, haras.longitude]}
                radius={12}
                pathOptions={{
                  color: colorMeta.borderColor,
                  weight: 2.2,
                  fillColor: colorMeta.baseColor,
                  fillOpacity: 0.95,
                }}
                eventHandlers={{
                  click: () => selectHarasAnchor(haras.organizerKey),
                }}
              >
                <Tooltip permanent direction="top" offset={[0, -14]} className="haras-tooltip">
                  <div className="haras-tooltip-content">
                    <strong>{colorMeta.label}</strong>
                  </div>
                </Tooltip>
                <Popup>
                  <div className="leaflet-popup-content-custom">
                    <strong>{colorMeta.label}</strong>
                    <br />
                    <strong>Type:</strong> Haras national
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        {mapView === "elite_regions" &&
          eliteRegionPoints.map((region) => (
            <CircleMarker
              key={region.regionName}
              center={[region.latitude, region.longitude]}
              radius={8 + Math.sqrt(region.nbChevauxElite) * 1.6}
              pathOptions={{
                color: MAP_PALETTE.charbon,
                weight: 2,
                fillColor: MAP_PALETTE.sable,
                fillOpacity: 0.75,
              }}
              eventHandlers={{
                click: () => selectEliteRegion(region),
              }}
            >
              <Popup>
                <div className="leaflet-popup-content-custom">
                  <strong>Region:</strong> {region.regionName}
                  <br />
                  <strong>Chevaux elite:</strong> {region.nbChevauxElite}
                  <br />
                  <strong>Repartition race:</strong>
                  <div className="dist-line">
                    <span className="dist-chip dist-chip-ar">BARBE: {region.nbChevauxBarbe}</span>
                    <span className="dist-chip dist-chip-arbe">
                      ARABE BARBE: {region.nbChevauxArabeBarbe}
                    </span>
                  </div>
                  <br />
                  <strong>Note elite moyenne:</strong> {region.noteEliteMoyenne.toFixed(2)} / 100
                  {region.topLieux.length > 0 && (
                    <>
                      <br />
                      <strong>Lieux:</strong> {region.topLieux.join(", ")}
                    </>
                  )}
                  <br />
                  <strong>Periode:</strong> 2025 seulement
                </div>
              </Popup>
            </CircleMarker>
          ))}

        {mapView === "elite_regions" &&
          showElitePoints &&
          jitteredElitePoints.map((elite) => {
            const race = elite.raceReference.trim().toUpperCase();
            const isArabeBarbe = race === "ARBE";
            const isBarbe = race === "BARBE";
            const raceLabel = isBarbe ? "BARBE" : race === "ARBE" ? "ARABE BARBE" : race || "N/A";
            return (
              <CircleMarker
                key={`elite-pt-${elite.id}`}
                center={[elite.displayLatitude, elite.displayLongitude]}
                radius={isArabeBarbe ? 4.3 : 3.6}
                pathOptions={{
                  color: isArabeBarbe ? "#1e3a8a" : "#991b1b",
                  weight: 1.2,
                  fillColor: isArabeBarbe ? "#2563eb" : "#ef4444",
                  fillOpacity: 0.95,
                }}
                eventHandlers={{
                  click: () => selectEliteHorse(elite),
                }}
              >
                <Popup>
                  <div className="leaflet-popup-content-custom">
                    <strong>Cheval elite:</strong> {elite.cheval}
                    <br />
                    <strong>Race:</strong> {raceLabel}
                    <br />
                    <strong>Note max:</strong> {elite.noteEliteMax.toFixed(2)} / 100
                    <br />
                    <strong>Lieu:</strong> {elite.lieu}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        {mapView === "haras_etalons" &&
          filteredHaras.map((haras) => {
            const organizerKey = haras.harasId as OrganizerKey;
            const colorMeta = ORGANIZER_META[organizerKey] ?? ORGANIZER_META.meknes;
            const radius = 11 + Math.sqrt(haras.etalons) * 1.7;
            const tooltipOffsetY = -Math.round(radius * 0.92);

            return (
              <CircleMarker
                key={`haras-${haras.harasId}`}
                center={[haras.latitude, haras.longitude]}
                radius={radius}
                pathOptions={{
                  color: colorMeta.borderColor,
                  weight: 2.2,
                  fillColor: colorMeta.baseColor,
                  fillOpacity: 0.88,
                }}
                eventHandlers={{
                  click: () => selectHarasRatio(haras),
                }}
              >
                <Tooltip
                  permanent
                  direction="top"
                  offset={[0, tooltipOffsetY]}
                  className="haras-tooltip"
                >
                  <div className="haras-tooltip-content">
                    <strong>{haras.shortLabel}</strong>
                    <br />
                    Etalons: {haras.etalons}
                    <br />
                    Palfreniers: {haras.palfreniersRepro}
                    <br />
                    <span className="ratio-red">
                      E/p: {roundRatioToInteger(haras.ratioEtalonsParPalfrenier)}
                    </span>
                  </div>
                </Tooltip>
                <Popup>
                  <div className="leaflet-popup-content-custom">
                    <strong>Haras:</strong> {haras.harasName}
                    <br />
                    <strong>Etalons:</strong> {haras.etalons}
                    <br />
                    <strong>Palfreniers (repro):</strong> {haras.palfreniersRepro}
                    <br />
                    <strong>Ratio Etalons / Palfrenier:</strong>{" "}
                    {roundRatioToInteger(haras.ratioEtalonsParPalfrenier)}
                    <br />
                    <strong>Ratio Palfrenier / Etalon:</strong>{" "}
                    {roundRatioToInteger(haras.ratioPalfreniersParEtalon)}
                    <br />
                    <strong>Periode:</strong> 2025 seulement
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        <FitBounds
          geojson={
            mapView === "lieux"
              ? regionsGeoData
              : showZones
                ? (geojson as unknown as GeoJSON.FeatureCollection)
                : null
          }
          points={fitPoints}
          enabled
        />
      </MapContainer>

      {showZones && dataError && (
        <div className="map-overlay-error">{dataError || "GeoJSON introuvable."}</div>
      )}
      {mapView === "lieux" && regionsError && (
        <div className="map-overlay-error map-overlay-error-tertiary">{regionsError}</div>
      )}
      {lieuxError && <div className="map-overlay-error map-overlay-error-secondary">{lieuxError}</div>}
      {mapView === "elite_regions" && eliteError && (
        <div className="map-overlay-error map-overlay-error-tertiary">{eliteError}</div>
      )}
      {mapView === "lieux" && (
        <div className="map-overlay-legend map-overlay-legend-lieux">
          <div className="legend-title">5 haras organisateurs</div>
          {harasAnchors.map((haras) => {
            const meta = ORGANIZER_META[haras.organizerKey];
            return (
              <div key={`legend-lieux-${haras.organizerKey}`} className="legend-row legend-row-wide">
                <span
                  className="legend-dot"
                  style={{ background: meta.baseColor, border: `1px solid ${meta.borderColor}` }}
                />
                {meta.label}
              </div>
            );
          })}
          <div className="legend-row legend-row-wide">Overlay: regions des haras et concours organises</div>
          <div className="legend-row legend-row-wide">Superposition de couleurs = chevauchement des concours</div>
          <div className="legend-row legend-row-wide">Traits: liaison haras - lieux</div>
        </div>
      )}
      {mapView === "elite_regions" && showElitePoints && (
        <div className="map-overlay-legend">
          <div className="legend-title">Points elite</div>
          <div className="legend-row">
            <span className="legend-dot legend-dot-barbe" />
            BARBE
          </div>
          <div className="legend-row">
            <span className="legend-dot legend-dot-arbe" />
            ARABE BARBE
          </div>
        </div>
      )}
      {mapView === "haras_etalons" && (
        <div className="map-overlay-legend map-overlay-legend-haras">
          <div className="legend-title">5 haras: effectif et ratio palfrenier</div>
          {filteredHaras.map((haras) => {
            const organizerKey = haras.harasId as OrganizerKey;
            const colorMeta = ORGANIZER_META[organizerKey] ?? ORGANIZER_META.meknes;
            return (
              <div key={`legend-haras-${haras.harasId}`} className="legend-row legend-row-wide">
                <span
                  className="legend-dot"
                  style={{
                    background: colorMeta.baseColor,
                    border: `1px solid ${colorMeta.borderColor}`,
                  }}
                />
                {haras.shortLabel}: {haras.etalons} etalons, P: {haras.palfreniersRepro},{" "}
                <span className="ratio-red">E/p: {roundRatioToInteger(haras.ratioEtalonsParPalfrenier)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
