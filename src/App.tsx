import { useEffect, useState, type CSSProperties } from "react";
import ZonesMap, { type MapSelectionDetail } from "./components/ZonesMap";

type MapViewMode = "lieux" | "elite_regions" | "haras_etalons";

const VIEW_LABELS: Record<MapViewMode, string> = {
  lieux: "Lieux de concours",
  elite_regions: "Repartition elites par region",
  haras_etalons: "Repartition des etalons (5 haras)",
};

function getDetailsBadgeClass(badge: string): string {
  const normalized = badge.trim().toUpperCase();
  if (normalized === "BARBE") {
    return "details-badge details-badge-barbe";
  }
  if (normalized === "ARABE") {
    return "details-badge details-badge-arabe";
  }
  if (normalized === "ARABE BARBE" || normalized === "ARBE") {
    return "details-badge details-badge-arbe";
  }
  return "details-badge";
}

export default function App() {
  const [lieuFilter, setLieuFilter] = useState("");
  const [mapView, setMapView] = useState<MapViewMode>("lieux");
  const [lieuxYear, setLieuxYear] = useState<"2025" | "2026">("2025");
  const [showElitePoints, setShowElitePoints] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState<MapSelectionDetail | null>(null);

  useEffect(() => {
    setSelectedDetail(null);
  }, [mapView, lieuxYear]);

  const filterPlaceholder =
    mapView === "haras_etalons"
      ? "Ex: Bouznika, Meknes, Oujda..."
      : mapView === "lieux" && lieuxYear === "2026"
        ? "Ex: Marrakech, Agadir, Oujda..."
      : "Ex: Meknes, Oujda, Agadir, OUASSIMA...";
  const emptyDetailHint =
    mapView === "haras_etalons"
      ? "Clique sur un haras dans la carte pour voir ses details."
      : mapView === "elite_regions"
        ? "Clique sur un point elite ou un point region pour voir les details."
        : "Clique sur un lieu de concours ou un haras pour afficher les details ici.";
  const lieuxCsvUrl =
    mapView === "lieux" && lieuxYear === "2026"
      ? "/concours_2026_leaflet_arabe_barbe_barbe.csv"
      : "/lieux_concours_organises.csv";
  const detailPanelStyle: CSSProperties | undefined = selectedDetail?.accentColor
    ? ({ "--detail-accent": selectedDetail.accentColor } as CSSProperties)
    : undefined;

  return (
    <div className="app-root">
      <div className="page-frame">
        <div className="dashboard-layout">
          <aside className="sidebar-column">
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
                  {mapView === "elite_regions" && (
                    <>
                      <div className="toolbar-legend-item">
                        <span className="legend-swatch-mini legend-swatch-mini-blue" />
                        ARABE BARBE
                      </div>
                      <div className="toolbar-legend-item">
                        <span className="legend-swatch-mini legend-swatch-mini-red" />
                        BARBE
                      </div>
                    </>
                  )}
                  {mapView === "lieux" && (
                    <div className="toolbar-legend-item">
                      <span className="legend-swatch-mini legend-swatch-mini-slate" />
                      Couleurs lieux: par haras organisateur
                    </div>
                  )}
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

            <section
              className={`details-panel${selectedDetail ? " details-panel-active" : ""}`}
              style={detailPanelStyle}
            >
              <div className="details-panel-head">
                <h2 className="details-title">Details</h2>
                <span className="details-subtitle">Selection map</span>
              </div>

              {!selectedDetail && <p className="details-empty">{emptyDetailHint}</p>}

              {selectedDetail && (
                <div className="details-body">
                  <div className="details-point-type">{selectedDetail.typeLabel}</div>
                  <h3 className="details-point-title">{selectedDetail.title}</h3>
                  {selectedDetail.subtitle && (
                    <p className="details-point-subtitle">{selectedDetail.subtitle}</p>
                  )}
                  {selectedDetail.badges && selectedDetail.badges.length > 0 && (
                    <div className="details-badges">
                      {selectedDetail.badges.map((badge) => (
                        <span
                          key={`${selectedDetail.id}-badge-${badge}`}
                          className={getDetailsBadgeClass(badge)}
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  )}
                  {selectedDetail.metrics && selectedDetail.metrics.length > 0 && (
                    <div className="details-metrics">
                      {selectedDetail.metrics.map((metric) => (
                        <div key={`${selectedDetail.id}-metric-${metric.label}`} className="details-metric-row">
                          <span className="details-metric-label">{metric.label}</span>
                          <span className="details-metric-value">{metric.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="details-rows">
                    {selectedDetail.rows.map((row) => (
                      <div key={`${selectedDetail.id}-${row.label}`} className="details-row">
                        <span className="details-row-label">{row.label}</span>
                        <span className="details-row-value">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </aside>

          <div className="map-card">
            <ZonesMap
              showZones={false}
              mapView={mapView}
              showElitePoints={showElitePoints}
              geoJsonUrl="/zones_concours.geojson"
              regionsGeoJsonUrl="/maroc_regions_12.geojson"
              lieuxCsvUrl={lieuxCsvUrl}
              eliteCsvUrl="/chevaux_elite_2025.csv"
              lieuFilter={lieuFilter}
              onSelectionChange={setSelectedDetail}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
