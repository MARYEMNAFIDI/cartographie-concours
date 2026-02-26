import { useEffect, useMemo, useState } from "react";
import { divIcon, type Layer, type LeafletMouseEvent, type PathOptions } from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { buildBoundsFromGeoJson, buildBoundsFromPoints, mergeBounds } from "../utils/bounds";
import { loadEliteCsv, type EliteHorsePoint } from "../utils/elite";
import { loadZonesGeoJson, type ZoneGeoJson, type ZoneGeoJsonFeature } from "../utils/geojson";
import { loadLieuxCsv, type LieuPoint } from "../utils/lieux";

type ZonesMapProps = {
  showZones: boolean;
  mapView: "lieux" | "elite_regions";
  showElitePoints: boolean;
  geoJsonUrl: string;
  lieuxCsvUrl: string;
  eliteCsvUrl: string;
  lieuFilter: string;
};

const DEFAULT_CENTER: [number, number] = [33.5731, -7.5898];
const DEFAULT_ZOOM = 6;

const BASE_STYLE: PathOptions = {
  color: "#1d4ed8",
  weight: 2,
  opacity: 0.95,
  fillColor: "#3b82f6",
  fillOpacity: 0.15,
};

const HOVER_STYLE: PathOptions = {
  ...BASE_STYLE,
  fillOpacity: 0.3,
};

const HORSE_ICON = divIcon({
  className: "horse-marker-wrapper",
  html: '<div class="horse-marker" title="Lieu de concours">&#128052;</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

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

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
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
  geojson: ZoneGeoJson | null;
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
  lieuxCsvUrl,
  eliteCsvUrl,
  lieuFilter,
}: ZonesMapProps) {
  const [geojson, setGeojson] = useState<ZoneGeoJson | null>(null);
  const [lieux, setLieux] = useState<LieuPoint[]>([]);
  const [elitePoints, setElitePoints] = useState<EliteHorsePoint[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [lieuxError, setLieuxError] = useState<string | null>(null);
  const [eliteError, setEliteError] = useState<string | null>(null);
  const formatPct = (value?: number) => (typeof value === "number" ? `${value.toFixed(2)}%` : "N/A");

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

  const geoData = useMemo(() => geojson as unknown as GeoJSON.GeoJsonObject, [geojson]);

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
      const haystack = `${lieu.lieuNom} ${lieu.ville} ${lieu.adresse}`.toLowerCase();
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

    return filteredLieux.map((item) => ({
      latitude: item.latitude,
      longitude: item.longitude,
    }));
  }, [mapView, filteredLieux, eliteRegionPoints, jitteredElitePoints, showElitePoints]);

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

  return (
    <div className="map-shell">
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {showZones && geojson && (
          <GeoJSON
            data={geoData}
            style={BASE_STYLE}
            onEachFeature={onEachFeature}
          />
        )}

        {mapView === "lieux" &&
          filteredLieux.map((lieu) => (
            <Marker
              key={lieu.lieuId}
              position={[lieu.latitude, lieu.longitude]}
              icon={HORSE_ICON}
            >
              <Popup>
                <div className="leaflet-popup-content-custom">
                  <strong>Lieu:</strong> {lieu.lieuNom}
                  {lieu.zoneId && (
                    <>
                      <br />
                      <strong>Zone ID:</strong> {lieu.zoneId}
                    </>
                  )}
                  {typeof lieu.nbConcours === "number" && (
                    <>
                      <br />
                      <strong>Concours organises:</strong> {lieu.nbConcours}
                    </>
                  )}
                  {typeof lieu.nbLignesAr === "number" && typeof lieu.nbLignesArbe === "number" && (
                    <>
                      <br />
                      <strong>Distribution:</strong>
                      <div className="dist-line">
                        <span className="dist-chip dist-chip-ar">
                          AR: {lieu.nbLignesAr} ({formatPct(lieu.partArPct)})
                        </span>
                        <span className="dist-chip dist-chip-arbe">
                          ARBE: {lieu.nbLignesArbe} ({formatPct(lieu.partArbePct)})
                        </span>
                      </div>
                    </>
                  )}
                  <>
                    <br />
                    <strong>Periode:</strong> 2025 seulement
                  </>
                </div>
              </Popup>
            </Marker>
          ))}

        {mapView === "elite_regions" &&
          eliteRegionPoints.map((region) => (
            <CircleMarker
              key={region.regionName}
              center={[region.latitude, region.longitude]}
              radius={8 + Math.sqrt(region.nbChevauxElite) * 1.6}
              pathOptions={{
                color: "#92400e",
                weight: 2,
                fillColor: "#fbbf24",
                fillOpacity: 0.75,
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
                  color: isArabeBarbe ? "#1e3a8a" : "#7f1d1d",
                  weight: 1.2,
                  fillColor: isArabeBarbe ? "#2563eb" : "#ef4444",
                  fillOpacity: 0.95,
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

        <FitBounds geojson={showZones ? geojson : null} points={fitPoints} enabled />
      </MapContainer>

      {showZones && dataError && (
        <div className="map-overlay-error">{dataError || "GeoJSON introuvable."}</div>
      )}
      {lieuxError && <div className="map-overlay-error map-overlay-error-secondary">{lieuxError}</div>}
      {mapView === "elite_regions" && eliteError && (
        <div className="map-overlay-error map-overlay-error-tertiary">{eliteError}</div>
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
    </div>
  );
}
