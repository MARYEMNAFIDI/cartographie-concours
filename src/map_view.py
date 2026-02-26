from __future__ import annotations

from typing import Iterable

import folium


def _iterate_lon_lat_pairs(coordinates) -> Iterable[tuple[float, float]]:
    """
    Yield (lon, lat) pairs from nested GeoJSON coordinates.
    Supports Polygon and MultiPolygon nesting levels.
    """
    if not isinstance(coordinates, list) or not coordinates:
        return

    # Base case: a coordinate pair [lon, lat] (optional altitude ignored).
    if len(coordinates) >= 2 and all(
        isinstance(value, (int, float)) for value in coordinates[:2]
    ):
        lon, lat = coordinates[:2]
        yield float(lon), float(lat)
        return

    for item in coordinates:
        yield from _iterate_lon_lat_pairs(item)


def _compute_bounds(geojson_data: dict):
    min_lat = min_lon = float("inf")
    max_lat = max_lon = float("-inf")

    for feature in geojson_data.get("features", []):
        geometry = feature.get("geometry", {})
        coordinates = geometry.get("coordinates", [])
        for lon, lat in _iterate_lon_lat_pairs(coordinates):
            min_lat = min(min_lat, lat)
            max_lat = max(max_lat, lat)
            min_lon = min(min_lon, lon)
            max_lon = max(max_lon, lon)

    if min_lat == float("inf"):
        return None
    return [[min_lat, min_lon], [max_lat, max_lon]]


def _add_legend(zones_map: folium.Map) -> None:
    legend_html = """
    <div style="
        position: fixed;
        bottom: 24px;
        left: 24px;
        z-index: 9999;
        background: white;
        border: 1px solid #9ca3af;
        border-radius: 8px;
        padding: 10px 12px;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    ">
      <div style="font-weight: 600; margin-bottom: 6px;">Zones de concours</div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="
          display: inline-block;
          width: 14px;
          height: 14px;
          background: #4f46e5;
          opacity: 0.45;
          border: 2px solid #1e3a8a;
        "></span>
        <span>Zone</span>
      </div>
    </div>
    """
    zones_map.get_root().html.add_child(folium.Element(legend_html))


def build_zones_map(geojson_data: dict) -> folium.Map:
    zones_map = folium.Map(location=[31.8, -7.0], zoom_start=6, tiles="OpenStreetMap")

    geojson_layer = folium.GeoJson(
        data=geojson_data,
        name="Zones de concours",
        style_function=lambda _: {
            "fillColor": "#4f46e5",
            "color": "#1e3a8a",
            "weight": 2,
            "fillOpacity": 0.35,
        },
        highlight_function=lambda _: {
            "fillColor": "#2563eb",
            "color": "#1e40af",
            "weight": 3,
            "fillOpacity": 0.5,
        },
        tooltip=folium.GeoJsonTooltip(
            fields=["zone_name"],
            aliases=["Zone"],
            sticky=True,
            labels=True,
        ),
        popup=folium.GeoJsonPopup(
            fields=["zone_name", "zone_id"],
            aliases=["Zone", "ID"],
            labels=True,
            localize=True,
        ),
    )
    geojson_layer.add_to(zones_map)

    bounds = _compute_bounds(geojson_data)
    if bounds is not None:
        zones_map.fit_bounds(bounds)

    _add_legend(zones_map)
    folium.LayerControl(collapsed=True).add_to(zones_map)
    return zones_map


def _extract_point_features(geojson_data: dict) -> list[dict]:
    points: list[dict] = []
    for feature in geojson_data.get("features", []):
        geometry = feature.get("geometry", {})
        properties = feature.get("properties", {})
        if geometry.get("type") != "Point":
            continue
        coords = geometry.get("coordinates", [])
        if not isinstance(coords, list) or len(coords) < 2:
            continue
        lon, lat = coords[:2]
        if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
            continue
        points.append(
            {
                "lat": float(lat),
                "lon": float(lon),
                "properties": properties if isinstance(properties, dict) else {},
            }
        )
    return points


def build_lieux_map_horse_markers(geojson_data: dict) -> folium.Map:
    points = _extract_point_features(geojson_data)
    if points:
        center_lat = sum(point["lat"] for point in points) / len(points)
        center_lon = sum(point["lon"] for point in points) / len(points)
    else:
        center_lat, center_lon = 31.8, -7.0

    lieux_map = folium.Map(location=[center_lat, center_lon], zoom_start=6, tiles="OpenStreetMap")

    for point in points:
        properties = point["properties"]
        lieu = properties.get("LIEU", "Lieu inconnu")
        nb_evenements = properties.get("nb_evenements", "N/A")
        nb_journees = properties.get("nb_journees", "N/A")
        popup_html = (
            f"<b>{lieu}</b><br/>"
            f"Evenements: {nb_evenements}<br/>"
            f"Journees: {nb_journees}"
        )
        folium.Marker(
            location=[point["lat"], point["lon"]],
            icon=folium.Icon(color="blue", icon="horse", prefix="fa"),
            tooltip=str(lieu),
            popup=folium.Popup(popup_html, max_width=300),
        ).add_to(lieux_map)

    if points:
        lats = [point["lat"] for point in points]
        lons = [point["lon"] for point in points]
        lieux_map.fit_bounds([[min(lats), min(lons)], [max(lats), max(lons)]])

    legend_html = """
    <div style="
        position: fixed;
        bottom: 24px;
        left: 24px;
        z-index: 9999;
        background: white;
        border: 1px solid #9ca3af;
        border-radius: 8px;
        padding: 10px 12px;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    ">
      <div style="font-weight: 600; margin-bottom: 6px;">Lieux des concours</div>
      <div>Symbole cheval = lieu de concours</div>
    </div>
    """
    lieux_map.get_root().html.add_child(folium.Element(legend_html))
    return lieux_map
