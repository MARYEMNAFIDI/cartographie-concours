export type ZoneGeometryType = "Polygon" | "MultiPolygon";

export interface ZoneGeoJsonFeature {
  type: "Feature";
  properties: {
    zone_id: string;
    zone_name: string;
    [key: string]: unknown;
  };
  geometry: {
    type: ZoneGeometryType;
    coordinates: unknown;
  };
}

export interface ZoneGeoJson {
  type: "FeatureCollection";
  features: ZoneGeoJsonFeature[];
}

function isFeatureCollection(value: unknown): value is { type: string; features: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "FeatureCollection" &&
    Array.isArray((value as { features?: unknown[] }).features)
  );
}

export async function loadZonesGeoJson(url: string): Promise<ZoneGeoJson> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("GeoJSON introuvable.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("GeoJSON invalide: JSON non lisible.");
  }

  if (!isFeatureCollection(payload)) {
    throw new Error("GeoJSON invalide: FeatureCollection attendue.");
  }

  const normalizedFeatures: ZoneGeoJsonFeature[] = payload.features
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item, index) => {
      const geometry = (item.geometry ?? {}) as Record<string, unknown>;
      const properties = (item.properties ?? {}) as Record<string, unknown>;
      const geometryType = geometry.type;
      if (geometryType !== "Polygon" && geometryType !== "MultiPolygon") {
        return null;
      }
      return {
        type: "Feature" as const,
        properties: {
          ...properties,
          zone_id: String(
            properties.zone_id ?? properties.shapeISO ?? properties.shapeID ?? `zone-${index + 1}`,
          ),
          zone_name: String(
            properties.zone_name ??
              properties.zoneName ??
              properties.shapeName ??
              properties.nom ??
              properties.NAME_1 ??
              "Zone sans nom",
          ),
        },
        geometry: {
          type: geometryType,
          coordinates: geometry.coordinates,
        },
      };
    })
    .filter((feature): feature is ZoneGeoJsonFeature => feature !== null);

  if (normalizedFeatures.length === 0) {
    throw new Error("GeoJSON invalide: aucun polygone exploitable.");
  }

  return {
    type: "FeatureCollection",
    features: normalizedFeatures,
  };
}
