from __future__ import annotations

import re
import unicodedata
from typing import Any

import numpy as np
import pandas as pd
from pyproj import Geod


SEXE_MAP = {
    "f": "F",
    "femelle": "F",
    "female": "F",
    "m": "M",
    "male": "M",
    "mle": "M",
}

GEOD = Geod(ellps="WGS84")


def normalize_sexe(value: Any) -> str | None:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    text = (
        unicodedata.normalize("NFKD", str(value))
        .encode("ascii", "ignore")
        .decode("ascii")
        .strip()
        .lower()
    )
    text = re.sub(r"[^a-z]", "", text)
    return SEXE_MAP.get(text)


def parse_dates(series: pd.Series) -> pd.Series:
    parsed = pd.to_datetime(series, errors="coerce")
    if parsed.isna().mean() > 0.5:
        parsed_alt = pd.to_datetime(series, errors="coerce", dayfirst=True)
        parsed = parsed.fillna(parsed_alt)
    return parsed


def safe_ratio(numerator: float, denominator: float) -> float | None:
    if denominator is None or denominator == 0:
        return None
    return float(numerator) / float(denominator)


def format_ratio(value: float | None) -> str:
    if value is None or pd.isna(value):
        return "N/A"
    return f"{value:.2f}"


def format_top_distribution(series: pd.Series, top_n: int) -> str:
    clean = series.dropna().astype(str).str.strip()
    if clean.empty:
        return "N/A"
    counts = clean.value_counts()
    total = counts.sum()
    top = counts.head(top_n)
    chunks = [f"{idx} ({(val / total) * 100:.1f}%)" for idx, val in top.items()]
    others = len(counts) - len(top)
    if others > 0:
        chunks.append(f"+{others} autres")
    return ", ".join(chunks)


def _polygon_area_km2(coords: list[list[float]]) -> float:
    if len(coords) < 4:
        return 0.0
    lons = [point[0] for point in coords]
    lats = [point[1] for point in coords]
    area, _ = GEOD.polygon_area_perimeter(lons, lats)
    return abs(area) / 1_000_000.0


def geometry_area_km2(geometry: dict | None) -> float | None:
    if not isinstance(geometry, dict):
        return None
    geom_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if not coordinates:
        return None

    if geom_type == "Polygon":
        outer_ring = coordinates[0] if coordinates else []
        area = _polygon_area_km2(outer_ring)
        return area if area > 0 else None

    if geom_type == "MultiPolygon":
        total = 0.0
        for polygon in coordinates:
            if not polygon:
                continue
            total += _polygon_area_km2(polygon[0])
        return total if total > 0 else None

    return None
