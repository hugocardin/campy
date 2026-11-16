# Probe: multi-currency guest prices (#24 / parked #40)

Migrations:

- `20261116214353_campground_price_currency` (MCP stamp placeholder)
- `20261116214651_campground_price_currency_impl` (column, views, search RPCs)
- `20261116215716_campground_currency_review_fix` (anon GRANT, normalize_listing_currency, maxPrice-only scope)
- `20261116220256_campground_currency_price_sort_group` (MCP stamp placeholder)
- `20261116220335_campground_currency_price_sort_group_impl` (CHECK via normalize; price-sort groups preferred currency first)

## Design

| Concern | Choice |
| --- | --- |
| Storage | `campgrounds.currency` CHECK via `normalize_listing_currency` (CAD / USD / MXN), default `CAD` |
| FX | **None** — maxPrice scopes to one currency; price sort groups preferred (or CAD) first, then sorts within each currency |
| Cards / detail | Format with the park's `price_currency` / `currency` |
| RPC filter arg | `filter_currency` (return column stays `price_currency`) |
| URL | `currency=` with `maxPrice` or `sort=price\|price-desc` (CAD default) |
| Admin | Listing currency on campground create/edit |

## Live smoke

Run as **anon** (SECURITY INVOKER + security_invoker view need column grants):

```sql
BEGIN;
SET LOCAL ROLE anon;

SELECT count(*) FROM v_campgrounds;
SELECT count(*) FROM search_campgrounds(result_limit := 5);

-- normalize_listing_currency pin (must match GUEST_PRICE_CURRENCIES)
SELECT public.normalize_listing_currency('cad') AS cad,
       public.normalize_listing_currency('USD') AS usd,
       public.normalize_listing_currency('mxn') AS mxn,
       public.normalize_listing_currency('EUR') AS eur_null;

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

## Currency lock (sites / amount-bookings)

Migration: `20261116222604_campground_currency_lock` — trigger
`trg_protect_campground_currency_change` + `updateCampgroundAction` pre-check.
Admin edit disables the control when locked.

```sql
BEGIN;
-- Expect check_violation (campground_currency_locked:sites) on a park with sites
UPDATE public.campgrounds
SET currency = CASE WHEN currency = 'CAD' THEN 'USD' ELSE 'CAD' END
WHERE id = (SELECT campground_id FROM public.sites LIMIT 1);
ROLLBACK;
```

## Still parked

- Effective nightly price via `pricing_rules` (needs dates / Phase D)
- FX conversion / display-only guest switch across currencies
