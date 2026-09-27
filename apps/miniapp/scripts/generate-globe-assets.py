"""Build small offline globe textures and pre-simplified Canvas fallback data."""

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
GEO = ROOT / "src/assets/geo"
OUTPUT = ROOT / "src/assets/globe"
SIZES = (2048, 1024, 512)
CONTINENT_IDS = {"AS": 36, "EU": 72, "AF": 108, "NA": 144, "SA": 180, "OC": 216}


def unwrap_ring(ring):
    result = []
    previous = ring[0][0]
    result.append((previous, ring[0][1]))
    for longitude, latitude in ring[1:]:
        longitude = previous + ((longitude - previous + 180) % 360 - 180)
        result.append((longitude, latitude))
        previous = longitude
    return result


def draw_wrapped(draw, ring, width, height, fill=None, outline=None, line_width=1):
    points = unwrap_ring(ring)
    mapped = [(round((longitude + 180) * width / 360), round((90 - latitude) * height / 180))
              for longitude, latitude in points]
    for offset in (-width, 0, width):
        translated = [(x + offset, y) for x, y in mapped]
        if fill is not None:
            draw.polygon(translated, fill=fill)
        if outline is not None:
            draw.line(translated, fill=outline, width=line_width, joint="curve")


def simplify_ring(points, tolerance):
    if len(points) <= 4:
        return points
    tolerance_squared = tolerance * tolerance
    keep = bytearray(len(points))
    keep[0] = keep[-1] = 1
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        x1, y1 = points[first]
        x2, y2 = points[last]
        dx, dy = x2 - x1, y2 - y1
        length_squared = dx * dx + dy * dy
        maximum, selected = tolerance_squared, -1
        for index in range(first + 1, last):
            x, y = points[index]
            ratio = 0 if not length_squared else max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / length_squared))
            distance = (x - (x1 + ratio * dx)) ** 2 + (y - (y1 + ratio * dy)) ** 2
            if distance > maximum:
                maximum, selected = distance, index
        if selected >= 0:
            keep[selected] = 1
            stack.append((first, selected))
            stack.append((selected, last))
    result = [point for index, point in enumerate(points) if keep[index]]
    if len(result) < 4:
        return points
    result[-1] = result[0]
    return result


def write_simplified_borders(countries, suffix, tolerance):
    simplified = []
    for country in countries:
        simplified.append({**country, "rings": [simplify_ring(ring, tolerance) for ring in country["rings"]]})
    output = GEO / f"country-borders-{suffix}.json"
    output.write_text(json.dumps(simplified, separators=(",", ":")), encoding="utf-8")
    points = sum(len(ring) for country in simplified for ring in country["rings"])
    print(f"{output.name}: {points:,} points")


def write_country_code_map(countries):
    seed_path = ROOT.parents[1] / "apps/api/prisma/countries.seed.ts"
    source = seed_path.read_text(encoding="utf-8")
    seed_json = "[" + source.split("export const countries = [", 1)[1].rsplit("];", 1)[0] + "]"
    destinations = json.loads(seed_json)

    def contains(ring, longitude, latitude):
        points = unwrap_ring(ring)
        middle = sum(point[0] for point in points) / len(points)
        longitude += round((middle - longitude) / 360) * 360
        inside = False
        previous = points[-1]
        for current in points:
            if ((current[1] > latitude) != (previous[1] > latitude)
                    and longitude < (previous[0] - current[0]) * (latitude - current[1])
                    / (previous[1] - current[1]) + current[0]):
                inside = not inside
            previous = current
        return inside

    def distance(first, second):
        lat1 = first[1] * math.pi / 180
        lat2 = second[1] * math.pi / 180
        delta_lon = ((first[0] - second[0] + 540) % 360 - 180) * math.pi / 180
        return math.acos(max(-1, min(1, math.sin(lat1) * math.sin(lat2)
            + math.cos(lat1) * math.cos(lat2) * math.cos(delta_lon))))

    def polygon_center(ring):
        points = unwrap_ring(ring)
        twice_area = 0
        longitude_sum = latitude_sum = 0
        for index, point in enumerate(points):
            following = points[(index + 1) % len(points)]
            cross = point[0] * following[1] - following[0] * point[1]
            twice_area += cross
            longitude_sum += (point[0] + following[0]) * cross
            latitude_sum += (point[1] + following[1]) * cross
        if abs(twice_area) < 1e-6:
            return (sum(point[0] for point in points) / len(points),
                    sum(point[1] for point in points) / len(points))
        return (longitude_sum / (3 * twice_area), latitude_sum / (3 * twice_area))

    result = {}
    for country in countries:
        rings = country["rings"]
        center = polygon_center(max(rings, key=lambda ring: len(ring)))
        candidates = [item for item in destinations if item["continentCode"] == country["continentCode"]
                      and any(contains(ring, item["longitude"], item["latitude"]) for ring in rings)]
        if not candidates:
            candidates = [item for item in destinations if item["continentCode"] == country["continentCode"]]
        if candidates:
            result[country["code"]] = min(candidates,
                key=lambda item: distance(center, (item["longitude"], item["latitude"])))['code']
    output = GEO / "country-alpha3.json"
    result.update({"CYN": "CY", "CYP": "CY", "FLK": "GB", "GRL": "DK", "KOS": "",
                   "NCL": "FR", "PRI": "US", "SAH": "MA", "TWN": "TW"})
    country_codes = {item["code"] for item in destinations}
    result = {code: destination for code, destination in result.items()
              if destination and destination in country_codes}
    output.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    country_ids = {item["code"]: index + 1 for index, item in enumerate(sorted(destinations, key=lambda item: item["code"]))}
    (GEO / "country-ids.json").write_text(json.dumps(country_ids, separators=(",", ":")), encoding="utf-8")
    unmatched = sorted({country["code"] for country in countries} - result.keys())
    print(f"{output.name}: {len(result)} mapped; unmatched={unmatched}")
    return result, country_ids


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    countries = json.loads((GEO / "country-borders.json").read_text(encoding="utf-8"))
    country_map, country_ids = write_country_code_map(countries)
    width, height = SIZES[0], SIZES[0] // 2
    earth = Image.new("RGB", (width, height))
    pixels = earth.load()
    for y in range(height):
        latitude = abs(90 - y * 180 / height) / 90
        for x in range(width):
            pixels[x, y] = (int(51 + 12 * latitude), int(121 + 15 * latitude), int(235 + 12 * latitude))

    land_draw = ImageDraw.Draw(earth)
    mask = Image.new("RGB", (width, height), (0, 0, 0))
    mask_draw = ImageDraw.Draw(mask)
    for country in countries:
        continent_id = CONTINENT_IDS.get(country["continentCode"], 0)
        country_id = country_ids.get(country_map.get(country["code"], ""), 0)
        for ring in country["rings"]:
            draw_wrapped(land_draw, ring, width, height, fill=(247, 250, 255))
            draw_wrapped(mask_draw, ring, width, height, fill=(continent_id, country_id, 0))

    border_draw = ImageDraw.Draw(earth)
    for country in countries:
        for ring in country["rings"]:
            draw_wrapped(border_draw, ring, width, height, outline=(128, 190, 239), line_width=2)

    for size in SIZES:
        dimensions = (size, size // 2)
        resized_earth = earth if size == width else earth.resize(dimensions, Image.Resampling.LANCZOS)
        resized_mask = mask if size == width else mask.resize(dimensions, Image.Resampling.NEAREST)
        resized_earth.save(OUTPUT / f"earth-{size}.png", optimize=True)
        resized_mask.save(OUTPUT / f"continent-mask-{size}.png", optimize=True)

    write_simplified_borders(countries, "low", 0.42)
    write_simplified_borders(countries, "medium", 0.14)


if __name__ == "__main__":
    main()
