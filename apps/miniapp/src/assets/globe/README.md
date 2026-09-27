The WebGL renderer uses the local `earth-*.png` textures generated from Natural Earth country boundaries: white land with a pale-blue ocean. The retained `earth-satellite-*.jpg` alternatives are not used by the miniapp renderer.
The `clouds-*.jpg` files are local, resized derivatives of NASA's Blue Marble cloud map (2048 × 1024, 2002 composite).

Source: https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/january/world.200401.3x5400x2700.jpg
Cloud source: https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg
Collection information: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/

The textures are bundled locally and work offline. The cloud map is sampled at low opacity in the existing surface shader, avoiding another sphere or a second draw pass.
