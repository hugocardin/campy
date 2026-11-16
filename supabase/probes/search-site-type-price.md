# Probe: fine site type + price filter/sort (#24 leftovers)

Migrations:

- `20261116053654_search_site_type_price_filters`
- `20261116054943_search_site_type_price_review_fix` (#40 review: single match predicate, post-LIMIT min_price, site_types table allow-list, CAD base-price comment)

## Design

| Concern | Choice |
| --- | --- |
| Fine site types | Multi-select `require_site_types text[]` against `site_types.code` (`TENT` / `RV` / `RV_AND_TENT` / `LODGING`). Coarse `stay_kind` kept; AND when both set. App drops incompatible types when stay changes. |
| Price filter | `max_price` on a **matching** site (`price_per_night_base <= max`). Same-site AND with other site filters. |
| Price sort / cards | `campground_matching_site_min_price` → RPC column `min_price_per_night`. Sort keys `price` / `price-desc`. |
| Near RPC | Same filters + `min_price_per_night`; still distance-ordered in SQL (app re-sorts capped set). |

URL: `types=tent,rv`, `maxPrice=75`, `sort=price|price-desc`.

## Live smoke (anon-callable RPCs)

```sql
SELECT name, min_price_per_night
FROM search_campgrounds(sort_key := 'price', result_limit := 10);

SELECT name, min_price_per_night
FROM search_campgrounds(
  require_site_types := ARRAY['TENT'],
  max_price := 40,
  sort_key := 'price'
);

SELECT name, min_price_per_night
FROM search_campgrounds(
  require_site_types := ARRAY['LODGING'],
  sort_key := 'price'
);
```

Observed (catalog at apply time): price ASC starts at Gold Creek $12; TENT+max 40 returns three parks; LODGING returns Gold Creek $62 and Emerald $100.

## Still blocked without later phases

- Date / availability filter — Phase D
- Rating sort — no `reviews` table
