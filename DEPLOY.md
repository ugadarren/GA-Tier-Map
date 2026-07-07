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

The app is designed to be embedded **only** by trusted sites and to break out of any
other frame. The allow-list lives at the top of `app.js` (`frameGuard`):

```js
var ALLOWED = [
  "https://www.eagleadvisorypartners.com",
  "https://eagleadvisorypartners.com"
];
```

Add any domain that should be allowed to embed the map (e.g. a staging site) to this
list. Every other origin is bounced (the map takes over the tab, or blanks if a
sandboxed frame blocks the break-out).

Because a `<meta>` CSP cannot set framing rules, this JS guard is what enforces the
policy on GitHub Pages. If you later host the map on a server you control, also set a
matching HTTP response header (strongest, runs before any JS):

```
Content-Security-Policy: frame-ancestors 'self' https://www.eagleadvisorypartners.com
```

## Embedding the map on the Eagle Advisory (WordPress / Avada) site

1. Edit the page in Avada Builder, add a **Code Block** element where the map should go.
2. Paste this snippet:

   ```html
   <iframe
     src="https://ugadarren.github.io/GA-Tier-Map/"
     title="Georgia Job Tax Credit Map"
     style="width:100%; height:900px; border:0;"
     loading="lazy"
     referrerpolicy="strict-origin-when-cross-origin"></iframe>
   ```

3. Save/publish. The map loads from GitHub Pages, so future pushes to `main` update the
   embedded map automatically.

Notes:
- Keep `referrerpolicy` at `strict-origin-when-cross-origin` (or `origin`) — the
  Firefox fallback in the frame-guard reads the referrer to verify the embedder.
  Do **not** use `referrerpolicy="no-referrer"`, which would break embedding in Firefox.
- Height ~900px gives the map, search, and the detail modal room; adjust to taste.
- The page must be served over **https** (Avada/WordPress default) — the iframe origin
  must match the allow-list exactly, including `https://` and `www`.

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
