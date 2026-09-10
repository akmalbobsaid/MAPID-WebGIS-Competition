# RUJAK data locations

`data/raw/` holds immutable supplied inputs. Processing scripts must never modify
or overwrite a raw file in place. Canonical Phase-1 inputs are expected at:

- `data/raw/transit/SurveiActivities.GeoJSON`
- `data/raw/culinary/MAKANAN DAN MINUMAN DI KOTA SURABAYA TAHUN 2025.geojson`
- `data/raw/roads/Jaringan Jalan Surabaya.geojson`

`HALTE DI KOTA SURABAYA TAHUN 2025.geojson` is not the transit source of truth,
and `Jaringan Jalan Surabaya.qmd` is not the routing-network source. Team survey
CSVs must not be automatically concatenated.

Reproducible transformations write intermediate artifacts to `data/interim/` and
reviewable final artifacts to `data/processed/`. Those directories are not
blanket-ignored: documentation, manifests, and small deterministic outputs may
be version controlled. Temporary/cache/large scratch artifacts are ignored by
targeted root `.gitignore` rules.
