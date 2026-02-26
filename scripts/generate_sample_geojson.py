from __future__ import annotations

import argparse
import json
from pathlib import Path


def build_sample_geojson() -> dict:
    # Coordinates are [longitude, latitude].
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"zone_id": "ZC-001", "zone_name": "Zone Agadir"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-9.72, 30.33],
                            [-9.45, 30.33],
                            [-9.45, 30.53],
                            [-9.72, 30.53],
                            [-9.72, 30.33],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {"zone_id": "ZC-002", "zone_name": "Zone Marrakech"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-8.12, 31.52],
                            [-7.86, 31.52],
                            [-7.86, 31.75],
                            [-8.12, 31.75],
                            [-8.12, 31.52],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {"zone_id": "ZC-003", "zone_name": "Zone Meknes"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-5.70, 33.78],
                            [-5.39, 33.78],
                            [-5.39, 34.00],
                            [-5.70, 34.00],
                            [-5.70, 33.78],
                        ]
                    ],
                },
            },
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate sample zones_concours.geojson")
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Optional output path. Default: <project_root>/data/zones_concours.geojson",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing file if it already exists.",
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    output_path = (
        Path(args.output).resolve()
        if args.output
        else (project_root / "data" / "zones_concours.geojson")
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if output_path.exists() and not args.force:
        print(
            f"File already exists: {output_path}\n"
            "Use --force to overwrite it."
        )
        return

    sample_geojson = build_sample_geojson()
    output_path.write_text(
        json.dumps(sample_geojson, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Sample GeoJSON generated: {output_path}")


if __name__ == "__main__":
    main()
