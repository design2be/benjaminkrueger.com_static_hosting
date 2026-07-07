# Preset background images

Put your preset images in this folder and list them in `manifest.json`.

## How it works
- The homepage “background collage” loads image paths from `assets/presets/manifest.json`.
- On each page load, it assigns those images randomly to the collage tiles.
- If the presets manifest is missing/empty, it falls back to `assets/teaser/manifest.json`.

## Manifest format
`assets/presets/manifest.json`:

```json
{
  "images": [
    "./assets/presets/preset-01.webp",
    "./assets/presets/preset-02.jpg"
  ]
}
```

