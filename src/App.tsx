import { useState } from "react";
import ZonesMap from "./components/ZonesMap";

type MapViewMode = "lieux" | "elite_regions" | "haras_etalons";

const VIEW_LABELS: Record<MapViewMode, string> = {
  lieux: "Lieux de concours",
  elite_regions: "Repartition elites par region",
  haras_etalons: "Repartition des etalons (5 haras)",
};

export default function App() {
  const [lieuFilter, setLieuFilter] = useState("");
  const [mapView, setMapView] = useState<MapViewMode>("lieux");
  const [lieuxYear, setLieuxYear] = useState<"2025" | "2026">("2025");
  const [showElitePoints, setShowElitePoints] = useState(true);
  const filterPlaceholder =
    mapView === "haras_etalons"
      ? "Ex: Bouznika, Meknes, Oujda..."
      : mapView === "lieux" && lieuxYear === "2026"
        ? "Ex: Marrakech, Agadir, Oujda..."
      : "Ex: Meknes, Oujda, Agadir, OUASSIMA...";
  const lieuxCsvUrl =
    mapView === "lieux" && lieuxYear === "2026"
      ? "/concours_2026_leaflet_arabe_barbe_barbe.csv"
      : "/lieux_concours_organises.csv";

  return (
    <div className="app-root">
      <div className="page-frame">
        <div className="map-toolbar">
          <label className="filter-label" htmlFor="map-view-select">
            Choisir la vue
          </label>
          <select
            id="map-view-select"
            className="filter-select"
            value={mapView}
            onChange={(event) => setMapView(event.target.value as MapViewMode)}
          >
            <option value="lieux">{VIEW_LABELS.lieux}</option>
            <option value="elite_regions">{VIEW_LABELS.elite_regions}</option>
            <option value="haras_etalons">{VIEW_LABELS.haras_etalons}</option>
          </select>

          <div className="view-current">
            Vue actuelle: <strong>{VIEW_LABELS[mapView]}</strong>
          </div>
          {mapView === "lieux" && (
            <>
              <label className="filter-label" htmlFor="lieux-year-select">
                Annee des lieux
              </label>
              <select
                id="lieux-year-select"
                className="filter-select"
                value={lieuxYear}
                onChange={(event) => setLieuxYear(event.target.value as "2025" | "2026")}
              >
                <option value="2025">2025</option>
                <option value="2026">2026</option>
              </select>
            </>
          )}

          <label className="filter-label" htmlFor="lieu-filter">
            Filtrer (region/ville/lieu/cheval/haras)
          </label>
          <div className="filter-and-legend">
            <input
              id="lieu-filter"
              className="filter-input"
              type="text"
              value={lieuFilter}
              onChange={(event) => setLieuFilter(event.target.value)}
              placeholder={filterPlaceholder}
            />
            <div className="toolbar-color-legend" aria-label="Legende couleurs">
              <div className="toolbar-legend-item">
                <span className="legend-swatch-mini legend-swatch-mini-blue" />
                ARABE BARBE
              </div>
              <div className="toolbar-legend-item">
                <span className="legend-swatch-mini legend-swatch-mini-red" />
                BARBE
              </div>
              <div className="toolbar-legend-item">
                <span className="legend-horse-badge">&#128052;</span>
                Lieux (jaune)
              </div>
              {mapView === "haras_etalons" && (
                <div className="toolbar-legend-item">
                  <span className="legend-swatch-mini legend-swatch-mini-amber" />
                  Etalons par haras
                </div>
              )}
            </div>
          </div>

          {mapView === "elite_regions" && (
            <label className="toggle-inline">
              <input
                type="checkbox"
                checked={showElitePoints}
                onChange={(event) => setShowElitePoints(event.target.checked)}
              />
              Voir effectif elite en petits points
            </label>
          )}
        </div>

        <div className="map-card">
          <ZonesMap
            showZones={false}
            mapView={mapView}
            showElitePoints={showElitePoints}
            geoJsonUrl="/zones_concours.geojson"
            lieuxCsvUrl={lieuxCsvUrl}
            eliteCsvUrl="/chevaux_elite_2025.csv"
            lieuFilter={lieuFilter}
          />
        </div>
      </div>
    </div>
  );
}
