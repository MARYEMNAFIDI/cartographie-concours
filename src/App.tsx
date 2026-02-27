import { useState } from "react";
import ZonesMap from "./components/ZonesMap";

type MapViewMode = "lieux" | "elite_regions" | "haras_etalons";

const VIEW_ORDER: MapViewMode[] = ["lieux", "elite_regions", "haras_etalons"];

const VIEW_LABELS: Record<MapViewMode, string> = {
  lieux: "Lieux de concours",
  elite_regions: "Repartition elites par region",
  haras_etalons: "Repartition des etalons (5 haras)",
};

export default function App() {
  const [lieuFilter, setLieuFilter] = useState("");
  const [mapView, setMapView] = useState<MapViewMode>("lieux");
  const [showElitePoints, setShowElitePoints] = useState(true);
  const currentViewIndex = VIEW_ORDER.indexOf(mapView);
  const nextView = VIEW_ORDER[(currentViewIndex + 1) % VIEW_ORDER.length];
  const filterPlaceholder =
    mapView === "haras_etalons"
      ? "Ex: Bouznika, Meknes, Oujda..."
      : "Ex: Meknes, Oujda, Agadir, OUASSIMA...";

  return (
    <div className="app-root">
      <div className="page-frame">
        <div className="map-toolbar">
          <button
            type="button"
            className="view-toggle-btn"
            onClick={() => setMapView(nextView)}
          >
            {`Basculer: ${VIEW_LABELS[nextView]}`}
          </button>

          <div className="view-current">
            Vue actuelle: <strong>{VIEW_LABELS[mapView]}</strong>
          </div>

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
            lieuxCsvUrl="/lieux_concours_organises.csv"
            eliteCsvUrl="/chevaux_elite_2025.csv"
            lieuFilter={lieuFilter}
          />
        </div>
      </div>
    </div>
  );
}
