# Globe boundary data

`country-borders.json` is a reduced geometry export of Natural Earth Admin 0 countries, 1:110m scale.

- Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson
- Dataset information: https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/
- Natural Earth vector data is public domain.
- Coordinates are rounded to two decimal places and grouped by continent for the miniapp canvas renderer.
- Offline globe textures and Canvas fallback LOD files are generated locally from these boundaries by `apps/miniapp/scripts/generate-globe-assets.py`.
- `country-alpha3.json` maps the Natural Earth boundary codes to the two-letter country codes used by the miniapp seed data; unmapped regions are not selectable as a destination.
