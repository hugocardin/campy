# Probe: multi-currency guest prices (#24 / parked #40)

Migrations:

- `20261116214353_campground_price_currency` (MCP stamp placeholder)
- `20261116214651_campground_price_currency_impl` (column, views, search RPCs)
- `20261116215716_campground_currency_review_fix` (anon GRANT, normalize_listing_currency, maxPrice-only scope)

## Design

| Concern | Choice |
| --- | --- |
| Storage | `campgrounds.currency` CHECK (`CAD` / `USD` / `MXN`), default `CAD` |
| FX | **None** — maxPrice and price sort are scoped to one currency |
| Cards / detail | Format with the park's `price_currency` / `currency` |
| RPC filter arg | `filter_currency` (return column stays `price_currency`) |
| URL | `currency=CAD\|USD\|MXN` with `maxPrice` or `sort=price\|price-desc` (CAD default) |
| Admin | Listing currency on campground create/edit |

## Live smoke

Run as **anon** (SECURITY INVOKER + security_invoker view need column grants):

```sql
BEGIN;
SET LOCAL ROLE anon;

SELECT count(*) FROM v_campgrounds;
SELECT count(*) FROM search_campgrounds(result_limit := 5);

SELECT name, min_price_per_night, price_currency
FROM search_campgrounds(sort_key := 'price', result_limit := 10);

SELECT name, min_price_per_night, price_currency
FROM search_campgrounds(
  max_price := 40,
  filter_currency := 'CAD',
  sort_key := 'price'
);

-- Non-CAD maxPrice scope → no CAD parks (catalog is CAD today)
SELECT count(*) AS usd_hits
FROM search_campgrounds(
  max_price := 100,
  filter_currency := 'USD'
);

-- Unknown currency + max_price → fail closed (0 rows)
SELECT count(*) AS bad_currency
FROM search_campgrounds(max_price := 100, filter_currency := 'EUR');

ROLLBACK;
```

Also compare anon vs authenticated `SELECT` column grants on `campgrounds.currency`.

## Still parked

- Effective nightly price via `pricing_rules` (needs dates / Phase D)
- FX conversion / display-only guest switch across currencies
