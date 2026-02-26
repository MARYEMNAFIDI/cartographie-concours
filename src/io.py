from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import streamlit as st


class DataLoadError(RuntimeError):
    """Raised when a required file cannot be loaded."""


class DataSchemaError(RuntimeError):
    """Raised when file columns or GeoJSON schema are invalid."""


REQUIRED_PARTICIPATION_COLUMNS = {
    "participation_id",
    "date",
    "zone_id",
    "race",
    "sexe",
    "categorie",
    "note_participation",
    "concours_id",
    "lieu_id",
}

REQUIRED_LIEUX_COLUMNS = {
    "lieu_id",
    "lieu_nom",
    "latitude",
    "longitude",
    "zone_id",
}


def _ensure_file_exists(path: Path) -> None:
    if not path.exists():
        raise DataLoadError(
            f"Fichier manquant: {path}\n"
            "Lancez: python scripts/generate_sample_data.py"
        )


def _ensure_columns(df: pd.DataFrame, required_columns: set[str], file_label: str) -> None:
    missing = sorted(required_columns - set(df.columns))
    if missing:
        raise DataSchemaError(
            f"Colonnes manquantes dans {file_label}: {', '.join(missing)}"
        )


def _validate_zones_geojson(geojson_data: dict) -> None:
    if not isinstance(geojson_data, dict):
        raise DataSchemaError("zones.geojson invalide: JSON racine doit etre un objet.")
    if geojson_data.get("type") != "FeatureCollection":
        raise DataSchemaError("zones.geojson invalide: type doit etre FeatureCollection.")
    features = geojson_data.get("features")
    if not isinstance(features, list) or not features:
        raise DataSchemaError("zones.geojson invalide: aucune feature.")

    for index, feature in enumerate(features, start=1):
        if feature.get("type") != "Feature":
            raise DataSchemaError(f"zones.geojson feature #{index}: type doit etre Feature.")
        props = feature.get("properties")
        if not isinstance(props, dict):
            raise DataSchemaError(
                f"zones.geojson feature #{index}: properties doit etre un objet."
            )
        if not props.get("zone_id") or not props.get("zone_name"):
            raise DataSchemaError(
                f"zones.geojson feature #{index}: zone_id et zone_name sont obligatoires."
            )
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict) or "type" not in geometry:
            raise DataSchemaError(
                f"zones.geojson feature #{index}: geometry invalide ou absente."
            )


@st.cache_data(show_spinner=False)
def load_zones(path: str) -> dict:
    file_path = Path(path)
    _ensure_file_exists(file_path)
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DataLoadError(f"Impossible de parser le JSON {file_path}: {exc}") from exc
    _validate_zones_geojson(data)
    return data


@st.cache_data(show_spinner=False)
def load_participations(path: str) -> pd.DataFrame:
    file_path = Path(path)
    _ensure_file_exists(file_path)
    try:
        if file_path.suffix.lower() == ".parquet":
            df = pd.read_parquet(file_path)
        else:
            df = pd.read_csv(file_path)
    except Exception as exc:  # noqa: BLE001
        raise DataLoadError(f"Impossible de lire {file_path}: {exc}") from exc
    _ensure_columns(df, REQUIRED_PARTICIPATION_COLUMNS, file_path.name)
    return df


@st.cache_data(show_spinner=False)
def load_lieux(path: str) -> pd.DataFrame:
    file_path = Path(path)
    _ensure_file_exists(file_path)
    try:
        df = pd.read_csv(file_path)
    except Exception as exc:  # noqa: BLE001
        raise DataLoadError(f"Impossible de lire {file_path}: {exc}") from exc
    _ensure_columns(df, REQUIRED_LIEUX_COLUMNS, file_path.name)
    return df
