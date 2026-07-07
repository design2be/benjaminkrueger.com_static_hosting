# Teaser images

Place your teaser images in this folder and update `index.html` if you change filenames.

## Expected format
- **Orientation**: vertical
- **Aspect ratio**: **16:9 vertical** (portrait crop; width:height = **9:16**)
- **Suggested filenames**: `01.jpg`, `02.jpg`, `03.jpg` (or more)

## Preset images (used by the teaser collage)
The teaser collage will load image paths from:

- `assets/teaser/manifest.json`

Add your preset images anywhere in this repo (common choice: `assets/teaser/presets/`) and list them in `manifest.json`, e.g.:

- `"./assets/teaser/presets/preset-01.webp"`
- `"./assets/teaser/presets/preset-02.webp"`

## Placeholders
This repo currently includes `01.svg`, `02.svg`, `03.svg` placeholders so the teaser works without your real images.

