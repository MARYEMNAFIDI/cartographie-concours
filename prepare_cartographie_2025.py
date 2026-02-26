from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

import pandas as pd
import requests


DEFAULT_FILE_TOKEN = "VF D"
DEFAULT_FILE_TOKEN_2 = "Notation par Juge 2025 V2.xlsx"
SHEET_NAME = "SQL Results"

GEOCODE_QUERY_BY_LIEU = {
    "AGADIR": "Agadir, Morocco",
    "FQUIH BEN SALAH": "Fquih Ben Salah, Morocco",
    "HARAS NATIONAL DE MEKNES": "Meknes, Morocco",
    "HARAS NATIONAL D EL JADIDA": "Haras National, El Jadida, Morocco",
    "HARAS NATIONAL DE BOUZNIKA": "Bouznika, Morocco",
    "HARAS NATIONAL DE MARRAKECH": "Marrakech, Morocco",
    "HARAS NATIONAL D OUJDA": "Oujda, Morocco",
    "CPEE DE SEBT GZOULA": "Sebt Gzoula, Morocco",
    "CPEE DE GUERCIF": "Guercif, Morocco",
    "CPEE DE MISSOUR": "Missour, Morocco",
    "CPEE DE AIN BENI MATHAR": "Ain Beni Mathar, Jerada Province, Morocco",
}


def find_source_file(user_path: str | None) -> Path:
    if user_path:
        candidate = Path(user_path)
        if candidate.exists():
            return candidate
    downloads = Path.home() / "Downloads"
    matches = [
        p
        for p in downloads.rglob("*.xlsx")
        if DEFAULT_FILE_TOKEN in p.name and DEFAULT_FILE_TOKEN_2 in p.name
    ]
    if not matches:
        raise FileNotFoundError(
            "Could not find source file in Downloads. Pass --source with the full path."
        )
    matches.sort(key=lambda p: (("(2)" not in str(p.parent)), len(str(p))))
    return matches[0]


def normalize_text(value):
    if pd.isna(value):
        return value
    value = str(value).strip()
    value = re.sub(r"\s+", " ", value)
    return value


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    cleaned = df.copy()
    text_cols = cleaned.select_dtypes(include=["object"]).columns
    for col in text_cols:
        cleaned[col] = cleaned[col].map(normalize_text)
    cleaned["DATE_JOURNEE_CONCOURS"] = pd.to_datetime(
        cleaned["DATE_JOURNEE_CONCOURS"], errors="coerce"
    ).dt.normalize()
    cleaned = cleaned[cleaned["DATE_JOURNEE_CONCOURS"].dt.year == 2025].copy()
    cleaned["DATE_JOURNEE_ISO"] = cleaned["DATE_JOURNEE_CONCOURS"].dt.strftime("%Y-%m-%d")
    return cleaned


def geocode_query(query: str, session: requests.Session) -> tuple[float | None, float | None, str]:
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": query, "format": "json", "limit": 1}
    headers = {"User-Agent": "codex-cartographie-sorec/1.0"}
    try:
        response = session.get(url, params=params, headers=headers, timeout=30)
        response.raise_for_status()
        payload = response.json()
        if payload:
            lat = float(payload[0]["lat"])
            lon = float(payload[0]["lon"])
            return lat, lon, "ok"
        return None, None, "no_result"
    except Exception:
        return None, None, "error"


def add_geocodes(lieux: pd.DataFrame) -> pd.DataFrame:
    rows = []
    with requests.Session() as session:
        for lieu in lieux["LIEU"].tolist():
            query = GEOCODE_QUERY_BY_LIEU.get(lieu, f"{lieu}, Morocco")
            lat, lon, status = geocode_query(query, session)
            rows.append(
                {
                    "LIEU": lieu,
                    "geocode_query": query,
                    "geocode_status": status,
                    "latitude": lat,
                    "longitude": lon,
                }
            )
            time.sleep(1.0)
    geo = pd.DataFrame(rows)
    return lieux.merge(geo, on="LIEU", how="left")


def build_lieux_table(df: pd.DataFrame) -> pd.DataFrame:
    events = (
        df[
            [
                "DATE_JOURNEE_CONCOURS",
                "DATE_JOURNEE_ISO",
                "CONCOURS",
                "DESIGNATION_JRNE_CONC",
                "LIEU",
            ]
        ]
        .drop_duplicates()
        .copy()
    )
    participants = (
        df[
            [
                "DATE_JOURNEE_ISO",
                "LIEU",
                "CONCOURS",
                "CLASSE",
                "NUM_ESIREMA",
                "NOTE_GLOBALE",
            ]
        ]
        .drop_duplicates()
        .copy()
    )
    by_lieu = (
        events.groupby("LIEU", as_index=False)
        .agg(
            nb_journees=("DATE_JOURNEE_ISO", "nunique"),
            nb_evenements=("DESIGNATION_JRNE_CONC", "nunique"),
            nb_types_concours=("CONCOURS", "nunique"),
            date_debut=("DATE_JOURNEE_CONCOURS", "min"),
            date_fin=("DATE_JOURNEE_CONCOURS", "max"),
        )
        .copy()
    )
    by_participants = (
        participants.groupby("LIEU", as_index=False)
        .agg(
            nb_chevaux_uniques=("NUM_ESIREMA", "nunique"),
            note_globale_moyenne=("NOTE_GLOBALE", "mean"),
        )
        .copy()
    )
    by_detail_rows = df.groupby("LIEU", as_index=False).size().rename(columns={"size": "nb_lignes_detail"})
    lieux = by_lieu.merge(by_participants, on="LIEU", how="left").merge(
        by_detail_rows, on="LIEU", how="left"
    )
    lieux["note_globale_moyenne"] = lieux["note_globale_moyenne"].round(2)
    lieux = lieux.sort_values(["nb_evenements", "nb_chevaux_uniques"], ascending=False).reset_index(
        drop=True
    )
    lieux = add_geocodes(lieux)
    return lieux


def build_events_table(df: pd.DataFrame, lieux: pd.DataFrame) -> pd.DataFrame:
    events = (
        df[
            [
                "DATE_JOURNEE_CONCOURS",
                "DATE_JOURNEE_ISO",
                "CONCOURS",
                "CODE_RACE_CONCOURS",
                "DESIGNATION_JRNE_CONC",
                "LIEU",
            ]
        ]
        .drop_duplicates()
        .sort_values(["DATE_JOURNEE_CONCOURS", "LIEU", "CONCOURS"])
        .reset_index(drop=True)
    )
    events = events.merge(
        lieux[["LIEU", "latitude", "longitude"]],
        on="LIEU",
        how="left",
    )
    return events


def write_geojson(lieux: pd.DataFrame, out_path: Path) -> None:
    features = []
    cols_to_keep = [
        "LIEU",
        "nb_journees",
        "nb_evenements",
        "nb_types_concours",
        "date_debut",
        "date_fin",
        "nb_chevaux_uniques",
        "note_globale_moyenne",
        "nb_lignes_detail",
    ]
    for _, row in lieux.iterrows():
        lat = row.get("latitude")
        lon = row.get("longitude")
        if pd.isna(lat) or pd.isna(lon):
            continue
        properties = {}
        for col in cols_to_keep:
            value = row[col]
            if isinstance(value, pd.Timestamp):
                value = value.strftime("%Y-%m-%d")
            properties[col] = value
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
                "properties": properties,
            }
        )
    geojson = {"type": "FeatureCollection", "features": features}
    out_path.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding="utf-8")


def write_map_html(lieux: pd.DataFrame, out_path: Path) -> None:
    points = []
    for _, row in lieux.iterrows():
        lat = row.get("latitude")
        lon = row.get("longitude")
        if pd.isna(lat) or pd.isna(lon):
            continue
        points.append(
            {
                "lieu": row["LIEU"],
                "latitude": float(lat),
                "longitude": float(lon),
                "nb_journees": int(row["nb_journees"]),
                "nb_evenements": int(row["nb_evenements"]),
                "nb_types_concours": int(row["nb_types_concours"]),
                "nb_chevaux_uniques": int(row["nb_chevaux_uniques"]),
                "note_globale_moyenne": float(row["note_globale_moyenne"])
                if not pd.isna(row["note_globale_moyenne"])
                else None,
                "date_debut": row["date_debut"].strftime("%Y-%m-%d"),
                "date_fin": row["date_fin"].strftime("%Y-%m-%d"),
            }
        )
    if points:
        center_lat = sum(p["latitude"] for p in points) / len(points)
        center_lon = sum(p["longitude"] for p in points) / len(points)
    else:
        center_lat, center_lon = 31.8, -7.0
    html_template = """<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cartographie SOREC - Concours 2025</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  <style>
    body { margin: 0; font-family: Segoe UI, Arial, sans-serif; background: #f7f7f7; }
    #map { height: 92vh; width: 100vw; }
    .header { padding: 10px 14px; background: #0a3d62; color: #fff; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">Concours SOREC 2025 - Lieux et intensite des evenements</div>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <script>
    const map = L.map('map').setView([__CENTER_LAT__, __CENTER_LON__], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const lieuxData = __LIEUX_DATA__;

    lieuxData.forEach((d) => {
      const radius = 6 + Math.sqrt(d.nb_evenements) * 3;
      const marker = L.circleMarker([d.latitude, d.longitude], {
        radius,
        color: '#0a3d62',
        weight: 1,
        fillColor: '#1e90ff',
        fillOpacity: 0.55
      }).addTo(map);

      const note = d.note_globale_moyenne === null ? 'N/A' : d.note_globale_moyenne.toFixed(2);
      const popup = `
        <b>${d.lieu}</b><br/>
        Journees: ${d.nb_journees}<br/>
        Evenements: ${d.nb_evenements}<br/>
        Types concours: ${d.nb_types_concours}<br/>
        Chevaux uniques: ${d.nb_chevaux_uniques}<br/>
        Note globale moyenne: ${note}<br/>
        Periode: ${d.date_debut} au ${d.date_fin}
      `;
      marker.bindPopup(popup);
    });
  </script>
</body>
</html>
"""
    html = html_template.replace("__CENTER_LAT__", f"{center_lat:.6f}")
    html = html.replace("__CENTER_LON__", f"{center_lon:.6f}")
    html = html.replace("__LIEUX_DATA__", json.dumps(points, ensure_ascii=False))
    out_path.write_text(html, encoding="utf-8")


def write_summary(
    source: Path,
    cleaned: pd.DataFrame,
    events: pd.DataFrame,
    lieux: pd.DataFrame,
    out_path: Path,
) -> None:
    geocoded = lieux["latitude"].notna().sum()
    total = len(lieux)
    lines = [
        "Nettoyage leger + valorisation lieux concours SOREC 2025",
        "",
        f"source_file: {source}",
        f"rows_cleaned: {len(cleaned)}",
        f"event_rows_unique: {len(events)}",
        f"lieux_uniques: {total}",
        f"lieux_geocodes: {geocoded}/{total}",
        f"date_min: {cleaned['DATE_JOURNEE_CONCOURS'].min().strftime('%Y-%m-%d')}",
        f"date_max: {cleaned['DATE_JOURNEE_CONCOURS'].max().strftime('%Y-%m-%d')}",
    ]
    out_path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(
        description="Light data cleaning + map-ready location enrichment for SOREC contests."
    )
    parser.add_argument("--source", help="Optional full path to source xlsx file.", default=None)
    parser.add_argument(
        "--outdir",
        help="Output directory (default: ./outputs_cartographie_2025).",
        default="outputs_cartographie_2025",
    )
    args = parser.parse_args()

    source = find_source_file(args.source)
    outdir = Path(args.outdir).resolve()
    outdir.mkdir(parents=True, exist_ok=True)

    raw = pd.read_excel(source, sheet_name=SHEET_NAME)
    cleaned = clean_dataframe(raw)
    lieux = build_lieux_table(cleaned)
    events = build_events_table(cleaned, lieux)

    cleaned_xlsx = outdir / "concours_2025_nettoye_legere.xlsx"
    with pd.ExcelWriter(cleaned_xlsx, engine="openpyxl") as writer:
        cleaned.to_excel(writer, sheet_name="data_nettoyee", index=False)
        events.to_excel(writer, sheet_name="events_uniques", index=False)
        lieux.to_excel(writer, sheet_name="lieux_carto", index=False)

    cleaned_csv = outdir / "concours_2025_nettoye_legere.csv"
    events_csv = outdir / "evenements_concours_2025.csv"
    lieux_csv = outdir / "lieux_concours_2025_geocodes.csv"
    cleaned.to_csv(cleaned_csv, index=False, encoding="utf-8-sig")
    events.to_csv(events_csv, index=False, encoding="utf-8-sig")
    lieux.to_csv(lieux_csv, index=False, encoding="utf-8-sig")

    geojson_path = outdir / "lieux_concours_2025.geojson"
    html_map_path = outdir / "cartographie_lieux_concours_2025.html"
    summary_path = outdir / "resume_traitement.txt"
    write_geojson(lieux, geojson_path)
    write_map_html(lieux, html_map_path)
    write_summary(source, cleaned, events, lieux, summary_path)

    print(f"Source: {source}")
    print(f"Outputs saved in: {outdir}")
    print(f"- {cleaned_xlsx.name}")
    print(f"- {cleaned_csv.name}")
    print(f"- {events_csv.name}")
    print(f"- {lieux_csv.name}")
    print(f"- {geojson_path.name}")
    print(f"- {html_map_path.name}")
    print(f"- {summary_path.name}")


if __name__ == "__main__":
    main()
