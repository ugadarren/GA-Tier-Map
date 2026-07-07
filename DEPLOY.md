# Deployment & Security Notes

Georgia JTC & ITC Map — a static site (HTML/CSS/JS, no backend, no build step).
Deploy by serving the repository files over HTTPS.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page markup + Content-Security-Policy meta tag |
| `app.js` | All application logic (map, search, modal, eligibility) + frame-guard |
| `style.css` | Styling |
| `tiers.json` | County → JTC tier by year (2022–2026) |
| `naics.json` | Business Enterprise NAICS industry list |
| `CountyBoundaries.geojson` | Georgia county polygons |

## Required server headers (set these on your own site)

The app ships a Content-Security-Policy via a `<meta>` tag, but a meta tag **cannot**
set framing protection. To stop anyone embedding the map in an `<iframe>` on their
site, set these HTTP response headers on your web server for all pages:

```
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
```

With these headers the browser refuses to render the page in any frame before any
JavaScript runs — the strongest guarantee. The frame-guard in `app.js` is a
client-side fallback that also works on static hosts (e.g. GitHub Pages) that can't
set headers; keep both.

### How to set the headers

- **Apache** (`.htaccess`):
  ```
  Header always set X-Frame-Options "DENY"
  Header always set Content-Security-Policy "frame-ancestors 'none'"
  ```
- **Nginx**:
  ```
  add_header X-Frame-Options "DENY" always;
  add_header Content-Security-Policy "frame-ancestors 'none'" always;
  ```
- **Cloudflare / Netlify / Vercel / etc.**: add the same two headers via the host's
  headers config (e.g. Netlify `_headers`, Vercel `vercel.json` `headers`).

> GitHub Pages does not support custom response headers, so on GitHub Pages only the
> `app.js` frame-guard applies. Moving to a host that allows headers is recommended
> for production.

## Security measures already in the code

- **Content-Security-Policy** (`<meta>`): scripts/styles limited to self + `unpkg.com`;
  network calls limited to self, `nominatim.openstreetmap.org`, and
  `services2.arcgis.com`; `default-src 'none'`.
- **Subresource Integrity**: Leaflet is pinned to `1.9.4` with `integrity` hashes, so a
  tampered CDN response is rejected.
- **No inline scripts**: all JS is in `app.js`; `script-src` does not allow
  `'unsafe-inline'`.
- **Output escaping**: external data (ArcGIS designation names, county names) is
  HTML-escaped before insertion into the DOM.
- **Frame-guard**: `app.js` breaks out of frames, or blanks the page if a sandboxed
  frame blocks the break-out.

## External dependencies (privacy note)

Address searches are geocoded in the browser via the OpenStreetMap **Nominatim** API,
and special-designation lookups query the **Georgia DCA ArcGIS** services. This means a
searched address is sent to Nominatim and its coordinates to ArcGIS. Both are called
over HTTPS. If addresses could be sensitive, disclose this in a privacy notice.

Nominatim's usage policy expects light traffic; if the tool sees heavy use, switch to a
keyed or self-hosted geocoder.

## Local preview

```
python3 -m http.server 8752
# then open http://localhost:8752/index.html
```
