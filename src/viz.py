from __future__ import annotations

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go


def _empty_figure(message: str) -> go.Figure:
    fig = go.Figure()
    fig.add_annotation(
        text=message,
        xref="paper",
        yref="paper",
        x=0.5,
        y=0.5,
        showarrow=False,
        font={"size": 16},
    )
    fig.update_xaxes(visible=False)
    fig.update_yaxes(visible=False)
    fig.update_layout(template="plotly_white", margin=dict(l=10, r=10, t=40, b=10))
    return fig


def map_zones_choropleth(
    zone_metrics: pd.DataFrame,
    zones_geojson: dict,
    metric_column: str,
    metric_label: str,
) -> go.Figure:
    if zone_metrics.empty:
        return _empty_figure("Aucune donnee zone disponible.")

    fig = px.choropleth(
        zone_metrics,
        geojson=zones_geojson,
        locations="zone_id",
        featureidkey="properties.zone_id",
        color=metric_column,
        hover_name="zone_name",
        hover_data={
            "zone_taille": True,
            "surface_km2_display": True,
            "participations": True,
            "note_moyenne": ":.2f",
            "ratio_f_m_display": True,
            "top_races": True,
            "top_categories": True,
            "zone_id": False,
            "surface_km2": False,
        },
        color_continuous_scale="YlOrRd",
        labels={
            "zone_taille": "Taille zone",
            "surface_km2_display": "Surface km2",
            "participations": "Participations",
            "note_moyenne": "Note moyenne",
            "ratio_f_m_display": "Ratio F/M",
            "top_races": "Top races",
            "top_categories": "Top categories",
        },
    )
    fig.update_traces(marker_line_width=0.8, marker_line_color="white")
    fig.update_geos(fitbounds="locations", visible=False, projection_type="mercator")
    fig.update_layout(
        template="plotly_white",
        margin=dict(l=10, r=10, t=40, b=10),
        coloraxis_colorbar_title=metric_label,
    )
    return fig


def map_lieux(lieux_metrics: pd.DataFrame) -> go.Figure:
    if lieux_metrics.empty or lieux_metrics["participations"].sum() == 0:
        return _empty_figure("Aucun lieu actif pour les filtres selectionnes.")

    fig = px.scatter_geo(
        lieux_metrics,
        lat="latitude",
        lon="longitude",
        size="participations",
        color="note_moyenne",
        hover_name="lieu_nom",
        hover_data={
            "zone_name": True,
            "ville": True,
            "adresse": True,
            "nb_concours": True,
            "participations": True,
            "note_moyenne": ":.2f",
            "top_races": True,
            "top_categories": True,
            "latitude": False,
            "longitude": False,
            "lieu_id": False,
            "zone_id": False,
        },
        color_continuous_scale="Viridis",
        size_max=28,
        projection="mercator",
        labels={
            "zone_name": "Zone",
            "ville": "Ville",
            "adresse": "Adresse",
            "nb_concours": "Nb concours",
            "participations": "Participations",
            "note_moyenne": "Note moyenne",
            "top_races": "Top races",
            "top_categories": "Top categories",
        },
    )
    fig.update_traces(marker=dict(line=dict(width=0.5, color="white"), opacity=0.9))
    fig.update_geos(fitbounds="locations", visible=False, projection_type="mercator")
    fig.update_layout(
        template="plotly_white",
        margin=dict(l=10, r=10, t=40, b=10),
        coloraxis_colorbar_title="Note moyenne",
    )
    return fig


def chart_top_races(df: pd.DataFrame) -> go.Figure:
    if df.empty:
        return _empty_figure("Aucune race a afficher.")
    out = df.copy()
    out["label_pct"] = out["pct"].map(lambda v: f"{v:.1f}%")
    fig = px.bar(out, x="label", y="count", text="label_pct", title="Top races")
    fig.update_layout(template="plotly_white", margin=dict(l=10, r=10, t=50, b=10))
    return fig


def chart_top_categories(df: pd.DataFrame) -> go.Figure:
    if df.empty:
        return _empty_figure("Aucune categorie a afficher.")
    out = df.copy()
    out["label_pct"] = out["pct"].map(lambda v: f"{v:.1f}%")
    fig = px.bar(out, x="label", y="count", text="label_pct", title="Top categories")
    fig.update_layout(template="plotly_white", margin=dict(l=10, r=10, t=50, b=10))
    return fig


def chart_hist_notes(filtered: pd.DataFrame) -> go.Figure:
    if filtered.empty or filtered["note_participation"].dropna().empty:
        return _empty_figure("Aucune note a afficher.")
    fig = px.histogram(
        filtered,
        x="note_participation",
        nbins=20,
        title="Distribution des notes",
    )
    fig.update_layout(template="plotly_white", margin=dict(l=10, r=10, t=50, b=10))
    return fig


def chart_ratio_sexe(sexe_df: pd.DataFrame) -> go.Figure:
    if sexe_df.empty:
        return _empty_figure("Aucun ratio F/M a afficher.")
    fig = px.bar(
        sexe_df,
        x="sexe_norm",
        y="count",
        title="Repartition F / M",
        labels={"sexe_norm": "Sexe", "count": "Participations"},
        color="sexe_norm",
        color_discrete_map={"F": "#ec4899", "M": "#3b82f6"},
    )
    fig.update_layout(showlegend=False, template="plotly_white", margin=dict(l=10, r=10, t=50, b=10))
    return fig
