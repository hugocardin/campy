# Search v2 — place suggest + unaccent / trigram (#24)

## Geocoder choice

**Photon** (Komoot, `https://photon.komoot.io`) — free OSM autocomplete, no API key.

| Requirement | How |
| --- | --- |
| Free tier | Public Photon instance (identify User-Agent; cache) |
| Autocomplete | Photon is built for as-you-type (unlike Nominatim) |
| French names | `lang=fr` for `fr-CA` |
| CA / US / MX | Filter `properties.countrycode` client-side |
| Cache | Process TTL map in `lib/geocoding/geocode-cache.ts` (24h) |

Optional env: `PHOTON_API_URL` (default `https://photon.komoot.io`). No secret required.

Swap path later: Mapbox / Geoapify / LocationIQ behind the same `GeocodedPlace` shape if Hugo prefers a keyed provider.

## Migrations (filenames = live `schema_migrations` versions)

1. `20261116041044_search_unaccent_trgm_suggest.sql` — extensions, `immutable_unaccent`, initial `campground_text_matches`, GIN indexes, `suggest_campgrounds`
2. `20261116041147_search_unaccent_text_match_rpcs.sql` — wire helper into `search_campgrounds` / `_near`
3. `20261116041259_campground_text_matches_word_similarity.sql` — typo path uses `word_similarity ≥ 0.45` (full-name `%` was too weak for `emerld` → Emerald Lake…)

## SQL checks (after apply)

```sql
SELECT extname FROM pg_extension WHERE extname IN ('unaccent', 'pg_trgm');

SELECT name FROM public.search_campgrounds(q := 'emerald');
SELECT name FROM public.suggest_campgrounds('emerld', 5);
SELECT name FROM public.suggest_campgrounds('alice', 5);

SELECT public.campground_text_matches(
  'Québec Campground', 'Québec', 'QC', 'quebec', 'quebec'
);
```
