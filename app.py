from pathlib import Path

import pandas as pd
import streamlit as st

from src.io import DataLoadError, DataSchemaError, load_lieux, load_participations, load_zones
from src.metrics import (
    aggregate_lieu_metrics,
    aggregate_zone_metrics,
    apply_filters,
    global_distributions,
    normalize_inputs,
)
from src.viz import (
    chart_hist_notes,
    chart_ratio_sexe,
    chart_top_categories,
    chart_top_races,
    map_lieux,
    map_zones_choropleth,
)


st.set_page_config(page_title="Dashboard Concours", layout="wide")
st.title("Dashboard Cartographique des Concours")

DATA_DIR = Path("data")
ZONES_PATH = DATA_DIR / "zones.geojson"
PARTICIPATIONS_PATH = DATA_DIR / "participations.csv"
LIEUX_PATH = DATA_DIR / "lieux.csv"

try:
    zones_geojson = load_zones(str(ZONES_PATH))
    participations_raw = load_participations(str(PARTICIPATIONS_PATH))
    lieux_raw = load_lieux(str(LIEUX_PATH))
except (DataLoadError, DataSchemaError) as exc:
    st.error(str(exc))
    st.stop()

participations_df, lieux_df, zones_df = normalize_inputs(
    participations_raw, lieux_raw, zones_geojson
)

if participations_df.empty:
    st.error("Aucune participation exploitable apres normalisation.")
    st.stop()

date_min = participations_df["date"].min().date()
date_max = participations_df["date"].max().date()

st.sidebar.header("Filtres")
date_selection = st.sidebar.date_input(
    "Periode",
    value=(date_min, date_max),
    min_value=date_min,
    max_value=date_max,
)
if isinstance(date_selection, (tuple, list)) and len(date_selection) == 2:
    date_debut, date_fin = pd.to_datetime(date_selection[0]), pd.to_datetime(date_selection[1])
else:
    date_debut = pd.to_datetime(date_min)
    date_fin = pd.to_datetime(date_max)

zone_map = zones_df.set_index("zone_id")["zone_name"].to_dict()
zone_options = zones_df["zone_id"].tolist()
selected_zones = st.sidebar.multiselect(
    "Zones",
    options=zone_options,
    default=zone_options,
    format_func=lambda z: zone_map.get(z, z),
)

race_options = sorted(participations_df["race"].dropna().unique().tolist())
selected_races = st.sidebar.multiselect("Races", options=race_options, default=race_options)

cat_options = sorted(participations_df["categorie"].dropna().unique().tolist())
selected_categories = st.sidebar.multiselect(
    "Categories", options=cat_options, default=cat_options
)

type_options = sorted(participations_df["type_concours"].dropna().unique().tolist())
selected_types = st.sidebar.multiselect(
    "Type de concours", options=type_options, default=type_options
)

selected_sexe = st.sidebar.radio("Sexe", options=["Tous", "F", "M"], index=0)
top_n = st.sidebar.slider("Top N (race/categorie)", min_value=3, max_value=10, value=5)

threshold_mode_label = st.sidebar.radio(
    "Seuil zone grande",
    options=["Auto (mediane)", "Manuel"],
    index=0,
)
threshold_mode = "auto" if threshold_mode_label.startswith("Auto") else "manual"
manual_threshold = None
default_threshold = zones_df["surface_km2"].dropna().median()
if threshold_mode == "manual":
    manual_threshold = st.sidebar.number_input(
        "Seuil surface (km2)",
        min_value=0.0,
        value=float(default_threshold if pd.notna(default_threshold) else 0.0),
        step=10.0,
    )

metric_label = st.sidebar.selectbox(
    "Metrique choroplethe",
    options=["Note moyenne", "Participations", "Ratio F/M"],
    index=0,
)
metric_column = {
    "Note moyenne": "note_moyenne",
    "Participations": "participations",
    "Ratio F/M": "ratio_f_m",
}[metric_label]

filtered_df = apply_filters(
    participations_df,
    date_debut=date_debut,
    date_fin=date_fin,
    zones=selected_zones,
    races=selected_races,
    categories=selected_categories,
    types=selected_types,
    sexe=selected_sexe,
)

zone_metrics, threshold_used = aggregate_zone_metrics(
    filtered_df,
    zones_df,
    top_n=top_n,
    threshold_mode=threshold_mode,
    manual_threshold=manual_threshold,
)
lieu_metrics = aggregate_lieu_metrics(filtered_df, lieux_df, zones_df, top_n=top_n)
dist = global_distributions(filtered_df, top_n=top_n)

col_a, col_b, col_c = st.columns(3)
col_a.metric("Participations filtrees", f"{len(filtered_df):,}".replace(",", " "))
col_b.metric("Zones couvertes", int((zone_metrics["participations"] > 0).sum()))
col_c.metric("Lieux actifs", int((lieu_metrics["participations"] > 0).sum()))

if pd.notna(threshold_used):
    nb_grandes = int((zone_metrics["zone_taille"] == "ZONE GRANDE").sum())
    nb_petites = int((zone_metrics["zone_taille"] == "ZONE PETITE").sum())
    st.info(
        "Legende zone taille: ZONE GRANDE si surface_km2 >= "
        f"{threshold_used:,.1f} km2 | "
        f"Grandes: {nb_grandes} | Petites: {nb_petites}".replace(",", " ")
    )
else:
    st.warning(
        "Surface indisponible pour classer les zones en grande/petite. "
        "Ajoutez des geometries ou zone_surface_km2."
    )

st.subheader("Carte choroplethe par zone")
st.plotly_chart(
    map_zones_choropleth(zone_metrics, zones_geojson, metric_column, metric_label),
    use_container_width=True,
)

st.subheader("Carte des lieux de concours")
st.plotly_chart(map_lieux(lieu_metrics), use_container_width=True)

row1_col1, row1_col2 = st.columns(2)
row1_col1.plotly_chart(chart_top_races(dist["races"]), use_container_width=True)
row1_col2.plotly_chart(chart_top_categories(dist["categories"]), use_container_width=True)

row2_col1, row2_col2 = st.columns(2)
row2_col1.plotly_chart(chart_hist_notes(filtered_df), use_container_width=True)
row2_col2.plotly_chart(chart_ratio_sexe(dist["sexe"]), use_container_width=True)
