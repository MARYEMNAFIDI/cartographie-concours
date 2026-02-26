from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import requests


GEOBOUNDARIES_API_TMPL = "https://www.geoboundaries.org/api/current/gbOpen/MAR/{adm_level}/"
REQUEST_TIMEOUT = 120


def iter_lon_lat_pairs(coords):
    if not isinstance(coords, list) or not coords:
        return
    if len(coords) >= 2 and all(isinstance(v, (int, float)) for v in coords[:2]):
        yield float(coords[0]), float(coords[1])
        return
    for item in coords:
        yield from iter_lon_lat_pairs(item)


def geometry_centroid(geometry: dict) -> tuple[float, float] | None:
    if not isinstance(geometry, dict):
        return None
    coords = geometry.get("coordinates")
    points = list(iter_lon_lat_pairs(coords))
    if not points:
        return None
    lon = float(sum(p[0] for p in points) / len(points))
    lat = float(sum(p[1] for p in points) / len(points))
    return lon, lat


def normalize_admin_geojson(raw_geojson: dict, level_label: str) -> dict:
    features_out = []
    for idx, feature in enumerate(raw_geojson.get("features", []), start=1):
        properties = feature.get("properties", {})
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict):
            continue
        zone_id = str(properties.get("shapeID") or f"{level_label}-{idx:03d}").strip()
        zone_name = str(properties.get("shapeName") or zone_id).strip()
        features_out.append(
            {
                "type": "Feature",
                "properties": {
                    "zone_id": zone_id,
                    "zone_name": zone_name,
                    "level": level_label.lower(),
                },
                "geometry": geometry,
            }
        )
    if not features_out:
        raise RuntimeError("No usable features in downloaded boundaries.")
    return {"type": "FeatureCollection", "features": features_out}


def build_zones_geojson_real(adm_level: str) -> tuple[dict, str]:
    api_url = GEOBOUNDARIES_API_TMPL.format(adm_level=adm_level.upper())
    api_payload = requests.get(api_url, timeout=REQUEST_TIMEOUT).json()
    geojson_url = api_payload.get("gjDownloadURL")
    if not geojson_url:
        raise RuntimeError("geoBoundaries response missing gjDownloadURL.")
    raw_geojson = requests.get(geojson_url, timeout=REQUEST_TIMEOUT).json()
    normalized = normalize_admin_geojson(raw_geojson, adm_level.upper())
    return normalized, f"geoBoundaries {adm_level.upper()} (reel)"


def build_zones_geojson_fallback(adm_level: str) -> tuple[dict, str]:
    # Local fallback if network is unavailable.
    zones = [
        ("FB-001", "Province Exemple 1", [[-9.8, 30.2], [-9.0, 30.2], [-9.0, 30.8], [-9.8, 30.8], [-9.8, 30.2]]),
        ("FB-002", "Province Exemple 2", [[-8.2, 31.4], [-7.6, 31.4], [-7.6, 31.9], [-8.2, 31.9], [-8.2, 31.4]]),
        ("FB-003", "Province Exemple 3", [[-6.0, 33.8], [-5.4, 33.8], [-5.4, 34.2], [-6.0, 34.2], [-6.0, 33.8]]),
    ]
    features = [
        {
            "type": "Feature",
            "properties": {"zone_id": zid, "zone_name": zname, "level": adm_level.lower()},
            "geometry": {"type": "Polygon", "coordinates": [coords]},
        }
        for zid, zname, coords in zones
    ]
    return {"type": "FeatureCollection", "features": features}, "fallback local simplifie"


def build_zones_geojson(adm_level: str) -> tuple[dict, str]:
    try:
        return build_zones_geojson_real(adm_level=adm_level)
    except Exception:
        return build_zones_geojson_fallback(adm_level=adm_level)


def build_lieux_from_zones(
    zones_geojson: dict, lieux_per_zone: int = 1, seed: int = 42
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    lieu_idx = 1
    for feature in zones_geojson.get("features", []):
        props = feature.get("properties", {})
        zone_id = str(props.get("zone_id"))
        zone_name = str(props.get("zone_name"))
        centroid = geometry_centroid(feature.get("geometry", {}))
        if centroid is None:
            continue
        base_lon, base_lat = centroid
        for local_idx in range(lieux_per_zone):
            lon_jitter = float(rng.normal(0, 0.10)) if local_idx > 0 else 0.0
            lat_jitter = float(rng.normal(0, 0.08)) if local_idx > 0 else 0.0
            rows.append(
                {
                    "lieu_id": f"L{lieu_idx:04d}",
                    "lieu_nom": f"Centre Equestre {zone_name} {local_idx + 1}",
                    "latitude": round(base_lat + lat_jitter, 6),
                    "longitude": round(base_lon + lon_jitter, 6),
                    "zone_id": zone_id,
                    "ville": zone_name,
                    "adresse": f"Site provincial de concours - {zone_name}",
                }
            )
            lieu_idx += 1
    if not rows:
        raise RuntimeError("No lieux could be generated from boundaries.")
    return pd.DataFrame(rows)


def build_participations(lieux: pd.DataFrame, n_rows: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    races = ["Arabe-Barbe", "Pur-Sang Arabe", "Barbe", "Anglo-Arabe", "Arabe"]
    categories = ["Junior", "Senior", "Elite", "Loisir"]
    types = ["Regional", "National", "Qualification"]
    sexe_values = ["F", "Femelle", "Female", "M", "Male"]

    start_date = np.datetime64("2025-01-01")
    end_date = np.datetime64("2025-12-31")
    days_span = int((end_date - start_date) / np.timedelta64(1, "D"))

    lieux = lieux.reset_index(drop=True).copy()
    zone_effect = {
        zone: float(rng.normal(0, 3)) for zone in lieux["zone_id"].dropna().unique().tolist()
    }

    # Ensure at least one participation per lieu.
    min_rows = len(lieux)
    n_total = max(n_rows, min_rows)
    base_lieux = lieux.copy()
    extra_count = n_total - min_rows
    if extra_count > 0:
        extra_idx = rng.integers(0, len(lieux), size=extra_count)
        extra_lieux = lieux.iloc[extra_idx].reset_index(drop=True)
        selected_lieux = pd.concat([base_lieux, extra_lieux], ignore_index=True)
    else:
        selected_lieux = base_lieux

    n = len(selected_lieux)
    dates = [
        start_date + np.timedelta64(int(rng.integers(0, days_span + 1)), "D")
        for _ in range(n)
    ]
    base_notes = rng.normal(loc=71, scale=10, size=n)
    adjusted_notes = np.array(
        [
            base_notes[i] + zone_effect.get(selected_lieux.iloc[i]["zone_id"], 0.0)
            for i in range(n)
        ]
    )
    notes = np.clip(adjusted_notes, 40, 98).round(2)
    concours_ids = [f"C{int(x):04d}" for x in rng.integers(1, 500, size=n)]

    data = pd.DataFrame(
        {
            "participation_id": [f"P{i:06d}" for i in range(1, n + 1)],
            "date": pd.to_datetime(dates).strftime("%Y-%m-%d"),
            "zone_id": selected_lieux["zone_id"].values,
            "race": rng.choice(races, size=n, p=[0.24, 0.20, 0.19, 0.17, 0.20]),
            "sexe": rng.choice(sexe_values, size=n),
            "categorie": rng.choice(categories, size=n, p=[0.25, 0.35, 0.20, 0.20]),
            "note_participation": notes,
            "concours_id": concours_ids,
            "lieu_id": selected_lieux["lieu_id"].values,
            "type_concours": rng.choice(types, size=n, p=[0.5, 0.3, 0.2]),
        }
    )
    return data


def write_if_allowed(path: Path, content: str, force: bool) -> None:
    if path.exists() and not force:
        print(f"Skip existing file (use --force to overwrite): {path}")
        return
    path.write_text(content, encoding="utf-8")
    print(f"Wrote: {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate sample data for the dashboard.")
    parser.add_argument("--output-dir", default="data", help="Output data directory.")
    parser.add_argument("--rows", type=int, default=1200, help="Number of participations.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed.")
    parser.add_argument(
        "--admin-level",
        type=str,
        default="ADM2",
        choices=["ADM1", "ADM2"],
        help="Administrative level for Morocco boundaries.",
    )
    parser.add_argument(
        "--lieux-per-zone",
        type=int,
        default=1,
        help="Number of generated places per zone.",
    )
    parser.add_argument("--force", action="store_true", help="Overwrite existing files.")
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    zones_geojson, zones_source = build_zones_geojson(adm_level=args.admin_level)
    lieux_df = build_lieux_from_zones(
        zones_geojson, lieux_per_zone=max(1, int(args.lieux_per_zone)), seed=args.seed
    )
    participations_df = build_participations(lieux_df, n_rows=args.rows, seed=args.seed)

    zones_path = out_dir / "zones.geojson"
    lieux_path = out_dir / "lieux.csv"
    participations_path = out_dir / "participations.csv"

    write_if_allowed(
        zones_path,
        json.dumps(zones_geojson, ensure_ascii=False, indent=2),
        force=args.force,
    )
    if lieux_path.exists() and not args.force:
        print(f"Skip existing file (use --force to overwrite): {lieux_path}")
    else:
        lieux_df.to_csv(lieux_path, index=False, encoding="utf-8")
        print(f"Wrote: {lieux_path}")

    if participations_path.exists() and not args.force:
        print(f"Skip existing file (use --force to overwrite): {participations_path}")
    else:
        participations_df.to_csv(participations_path, index=False, encoding="utf-8")
        print(f"Wrote: {participations_path}")

    print(f"Zones source: {zones_source}")
    print(
        f"Summary: zones={len(zones_geojson.get('features', []))}, "
        f"lieux={len(lieux_df)}, participations={len(participations_df)}"
    )


if __name__ == "__main__":
    main()
