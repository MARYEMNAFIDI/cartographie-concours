import { useState } from "react";
import ZonesMap from "./components/ZonesMap";

export default function App() {
  const [lieuFilter, setLieuFilter] = useState("");
  const [mapView, setMapView] = useState<"lieux" | "elite_regions">("lieux");
  const [showElitePoints, setShowElitePoints] = useState(true);
  const nextView = mapView === "lieux" ? "elite_regions" : "lieux";

  return (
    <div className="app-root">
      <div className="page-frame">
        <div className="map-toolbar">
          <button
            type="button"
            className="view-toggle-btn"
            onClick={() => setMapView(nextView)}
          >
            {mapView === "lieux"
              ? "Basculer: Repartition elites par region"
              : "Basculer: Lieux de concours"}
          </button>

          <div className="view-current">
            Vue actuelle:{" "}
            <strong>{mapView === "lieux" ? "Lieux de concours" : "Repartition elites par region"}</strong>
          </div>

          <label className="filter-label" htmlFor="lieu-filter">
            Filtrer (region/ville/lieu/cheval)
          </label>
          <div className="filter-and-legend">
            <input
              id="lieu-filter"
              className="filter-input"
              type="text"
              value={lieuFilter}
              onChange={(event) => setLieuFilter(event.target.value)}
              placeholder="Ex: Meknes, Oujda, Agadir, OUASSIMA..."
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
