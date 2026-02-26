from __future__ import annotations

import numpy as np
import pandas as pd
import streamlit as st

from src.py_utils import (
    format_ratio,
    format_top_distribution,
    geometry_area_km2,
    normalize_sexe,
    parse_dates,
    safe_ratio,
)


def _zones_dataframe(zones_geojson: dict) -> pd.DataFrame:
    rows: list[dict] = []
    for feature in zones_geojson.get("features", []):
        properties = feature.get("properties", {})
        zone_id = str(properties.get("zone_id")).strip()
        zone_name = str(properties.get("zone_name")).strip()
        level = properties.get("level") or properties.get("niveau") or "non_renseigne"

        area_geom = geometry_area_km2(feature.get("geometry"))
        area_prop = properties.get("zone_surface_km2")
        try:
            area_prop = float(area_prop) if area_prop is not None else np.nan
        except (TypeError, ValueError):
            area_prop = np.nan
        surface_km2 = area_geom if area_geom is not None else area_prop
        rows.append(
            {
                "zone_id": zone_id,
                "zone_name": zone_name,
                "level": level,
                "surface_km2": surface_km2,
            }
        )
    return pd.DataFrame(rows).drop_duplicates(subset=["zone_id"])


@st.cache_data(show_spinner=False)
def normalize_inputs(
    participations_raw: pd.DataFrame,
    lieux_raw: pd.DataFrame,
    zones_geojson: dict,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    participations = participations_raw.copy()
    lieux = lieux_raw.copy()
    zones = _zones_dataframe(zones_geojson)

    participations["date"] = parse_dates(participations["date"])
    participations = participations[participations["date"].notna()].copy()
    participations["zone_id"] = participations["zone_id"].astype(str).str.strip()
    participations["race"] = participations["race"].astype(str).str.strip().replace("", "Inconnu")
    participations["categorie"] = (
        participations["categorie"].astype(str).str.strip().replace("", "Inconnu")
    )
    participations["note_participation"] = pd.to_numeric(
        participations["note_participation"], errors="coerce"
    )
    participations["sexe_norm"] = participations["sexe"].map(normalize_sexe)
    participations["sexe_norm"] = participations["sexe_norm"].fillna("NA")
    participations["participation_id"] = participations["participation_id"].astype(str)
    participations["concours_id"] = participations["concours_id"].astype(str)
    participations["lieu_id"] = participations["lieu_id"].astype(str)
    if "type_concours" not in participations.columns:
        participations["type_concours"] = "Non renseigne"
    participations["type_concours"] = (
        participations["type_concours"].astype(str).str.strip().replace("", "Non renseigne")
    )

    lieux["lieu_id"] = lieux["lieu_id"].astype(str)
    lieux["lieu_nom"] = lieux["lieu_nom"].astype(str).str.strip()
    lieux["zone_id"] = lieux["zone_id"].astype(str).str.strip()
    lieux["ville"] = lieux.get("ville", pd.Series([""] * len(lieux))).astype(str).str.strip()
    lieux["adresse"] = lieux.get("adresse", pd.Series([""] * len(lieux))).astype(str).str.strip()
    lieux["latitude"] = pd.to_numeric(lieux["latitude"], errors="coerce")
    lieux["longitude"] = pd.to_numeric(lieux["longitude"], errors="coerce")
    lieux = lieux[lieux["latitude"].notna() & lieux["longitude"].notna()].copy()

    return participations, lieux, zones


@st.cache_data(show_spinner=False)
def apply_filters(
    participations: pd.DataFrame,
    date_debut: pd.Timestamp,
    date_fin: pd.Timestamp,
    zones: list[str],
    races: list[str],
    categories: list[str],
    types: list[str],
    sexe: str,
) -> pd.DataFrame:
    filtered = participations[
        participations["date"].between(pd.Timestamp(date_debut), pd.Timestamp(date_fin))
    ].copy()
    if zones is not None:
        filtered = filtered[filtered["zone_id"].isin(zones)]
    if races is not None:
        filtered = filtered[filtered["race"].isin(races)]
    if categories is not None:
        filtered = filtered[filtered["categorie"].isin(categories)]
    if types is not None:
        filtered = filtered[filtered["type_concours"].isin(types)]
    if sexe in {"F", "M"}:
        filtered = filtered[filtered["sexe_norm"] == sexe]
    return filtered


def _top_summary_by_group(
    df: pd.DataFrame, group_col: str, value_col: str, top_n: int
) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=[group_col, f"top_{value_col}"])
    summaries = (
        df.groupby(group_col)[value_col]
        .apply(lambda values: format_top_distribution(values, top_n))
        .reset_index(name=f"top_{value_col}")
    )
    return summaries


@st.cache_data(show_spinner=False)
def aggregate_zone_metrics(
    filtered: pd.DataFrame,
    zones: pd.DataFrame,
    top_n: int,
    threshold_mode: str = "auto",
    manual_threshold: float | None = None,
) -> tuple[pd.DataFrame, float]:
    if filtered.empty:
        out = zones.copy()
        out["participations"] = 0
        out["note_moyenne"] = np.nan
        out["ratio_f_m"] = np.nan
        out["ratio_f_m_display"] = "N/A"
        out["nb_f"] = 0
        out["nb_m"] = 0
        out["top_races"] = "N/A"
        out["top_categories"] = "N/A"
    else:
        grouped = (
            filtered.groupby("zone_id", as_index=False)
            .agg(
                participations=("participation_id", "nunique"),
                note_moyenne=("note_participation", "mean"),
                nb_f=("sexe_norm", lambda s: int((s == "F").sum())),
                nb_m=("sexe_norm", lambda s: int((s == "M").sum())),
            )
            .copy()
        )
        grouped["ratio_f_m"] = grouped.apply(
            lambda row: safe_ratio(row["nb_f"], row["nb_m"]), axis=1
        )
        grouped["ratio_f_m_display"] = grouped["ratio_f_m"].apply(format_ratio)

        top_races = _top_summary_by_group(filtered, "zone_id", "race", top_n).rename(
            columns={"top_race": "top_races"}
        )
        top_categories = _top_summary_by_group(
            filtered, "zone_id", "categorie", top_n
        ).rename(columns={"top_categorie": "top_categories"})

        out = zones.merge(grouped, on="zone_id", how="left")
        out = out.merge(top_races, on="zone_id", how="left")
        out = out.merge(top_categories, on="zone_id", how="left")
        out["participations"] = out["participations"].fillna(0).astype(int)
        out["nb_f"] = out["nb_f"].fillna(0).astype(int)
        out["nb_m"] = out["nb_m"].fillna(0).astype(int)
        out["ratio_f_m_display"] = out["ratio_f_m_display"].fillna("N/A")
        out["top_races"] = out["top_races"].fillna("N/A")
        out["top_categories"] = out["top_categories"].fillna("N/A")

    valid_surfaces = out["surface_km2"].dropna()
    auto_threshold = float(valid_surfaces.median()) if not valid_surfaces.empty else np.nan
    threshold = (
        float(manual_threshold)
        if threshold_mode == "manual" and manual_threshold is not None
        else auto_threshold
    )

    def classify_zone(surface: float) -> str:
        if pd.isna(surface) or pd.isna(threshold):
            return "NON CLASSEE"
        return "ZONE GRANDE" if surface >= threshold else "ZONE PETITE"

    out["zone_taille"] = out["surface_km2"].apply(classify_zone)
    out["surface_km2"] = out["surface_km2"].round(2)
    out["note_moyenne"] = out["note_moyenne"].round(2)
    out["ratio_f_m"] = out["ratio_f_m"].round(3)
    out["surface_km2_display"] = out["surface_km2"].apply(
        lambda x: "N/A" if pd.isna(x) else f"{x:,.1f}".replace(",", " ")
    )
    return out, threshold


@st.cache_data(show_spinner=False)
def aggregate_lieu_metrics(
    filtered: pd.DataFrame, lieux: pd.DataFrame, zones: pd.DataFrame, top_n: int
) -> pd.DataFrame:
    merged = filtered.merge(
        lieux[
            ["lieu_id", "lieu_nom", "latitude", "longitude", "zone_id", "ville", "adresse"]
        ],
        on=["lieu_id", "zone_id"],
        how="left",
    )

    if merged.empty:
        out = lieux.copy()
        out["participations"] = 0
        out["nb_concours"] = 0
        out["note_moyenne"] = np.nan
        out["top_races"] = "N/A"
        out["top_categories"] = "N/A"
        out["zone_name"] = out["zone_id"]
        return out

    grouped = (
        merged.groupby(
            ["lieu_id", "lieu_nom", "latitude", "longitude", "zone_id", "ville", "adresse"],
            as_index=False,
        )
        .agg(
            participations=("participation_id", "nunique"),
            nb_concours=("concours_id", "nunique"),
            note_moyenne=("note_participation", "mean"),
        )
        .copy()
    )
    top_races = _top_summary_by_group(merged, "lieu_id", "race", top_n).rename(
        columns={"top_race": "top_races"}
    )
    top_categories = _top_summary_by_group(merged, "lieu_id", "categorie", top_n).rename(
        columns={"top_categorie": "top_categories"}
    )
    grouped = grouped.merge(top_races, on="lieu_id", how="left")
    grouped = grouped.merge(top_categories, on="lieu_id", how="left")
    grouped["note_moyenne"] = grouped["note_moyenne"].round(2)
    grouped["top_races"] = grouped["top_races"].fillna("N/A")
    grouped["top_categories"] = grouped["top_categories"].fillna("N/A")

    grouped = grouped.merge(
        zones[["zone_id", "zone_name"]],
        on="zone_id",
        how="left",
    )
    grouped["zone_name"] = grouped["zone_name"].fillna(grouped["zone_id"])
    return grouped.sort_values("participations", ascending=False)


@st.cache_data(show_spinner=False)
def global_distributions(filtered: pd.DataFrame, top_n: int) -> dict[str, pd.DataFrame]:
    def top_table(col: str) -> pd.DataFrame:
        if filtered.empty:
            return pd.DataFrame(columns=["label", "count", "pct"])
        counts_all = filtered[col].value_counts()
        counts = counts_all.head(top_n)
        total = counts_all.sum()
        out = counts.rename_axis("label").reset_index(name="count")
        out["pct"] = (out["count"] / total * 100).round(1)
        return out

    if filtered.empty:
        sexe_df = pd.DataFrame({"sexe_norm": ["F", "M"], "count": [0, 0]})
    else:
        sexe_df = filtered["sexe_norm"].value_counts().rename_axis("sexe_norm").reset_index(
            name="count"
        )
        sexe_df = sexe_df[sexe_df["sexe_norm"].isin(["F", "M"])]

    return {
        "races": top_table("race"),
        "categories": top_table("categorie"),
        "sexe": sexe_df,
    }
