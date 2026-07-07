// Anti-embedding: allow this app to be framed ONLY by trusted sites (ALLOWED below);
// break out of every other frame (clickjacking / content-theft protection).
// NOTE: the strongest protection is an HTTP header from the server hosting THIS app:
//   Content-Security-Policy: frame-ancestors 'self' https://www.eagleadvisorypartners.com
// GitHub Pages can't set headers, so this script enforces the same policy client-side.
(function frameGuard() {
  if (window.top === window.self) return; // not framed — normal load

  // Origins permitted to embed this map in an iframe.
  var ALLOWED = [
    "https://www.eagleadvisorypartners.com",
    "https://eagleadvisorypartners.com"
  ];

  // Trust the frame only if EVERY ancestor origin is allow-listed.
  var trusted = false;
  var origins = window.location.ancestorOrigins; // Chrome / Safari / Edge
  if (origins && origins.length) {
    trusted = true;
    for (var i = 0; i < origins.length; i++) {
      if (ALLOWED.indexOf(origins[i]) === -1) { trusted = false; break; }
    }
  } else if (document.referrer) {                // Firefox fallback (immediate parent)
    try { trusted = ALLOWED.indexOf(new URL(document.referrer).origin) !== -1; } catch (e) {}
  }
  if (trusted) return;

  // Untrusted embedder: break out, or blank the page if a sandbox blocks the break-out.
  try {
    window.top.location = window.self.location.href;
  } catch (e) {
    var msg = document.createElement("div");
    msg.style.cssText = "font-family:sans-serif;padding:2rem;text-align:center;color:#023a51";
    msg.textContent = "This application cannot be embedded in another site.";
    if (document.documentElement) document.documentElement.replaceChildren(msg);
  }
})();

    // Fit the initial view to Georgia's extent. We reserve pixel space for the
    // floating card columns (left search card, right info/legend cards) so the state
    // is centered in the clear area between them and never sits under a card.
    // zoomSnap: 0 lets it fit with a fractional zoom instead of snapping.
    const GEORGIA_BOUNDS = [[30.34, -85.61], [35.01, -80.83]];
    const map = L.map('map', { zoomControl: false, zoomSnap: 0 });

    function fitGeorgia() {
      const wide = map.getSize().x >= 768;
      const opts = wide
        ? { paddingTopLeft: [300, 28], paddingBottomRight: [300, 28] }
        : { paddingTopLeft: [16, 116], paddingBottomRight: [16, 16] }; // mobile: only top card
      map.fitBounds(GEORGIA_BOUNDS, opts);
    }
    fitGeorgia();
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const tierColors = {
      "Tier 1 Lower 40": "#004080",
      "Tier 1": "#00274d",
      "Tier 2": "#6c757d",
      "Tier 3": "#f4c542",
      "Tier 4": "#d9534f"
    };

    // County fill colors (match style.css) — used for the modal accent, badge, and shape
    const tierFill = {
      "Tier 1 Lower 40": "#3b7f4d",
      "Tier 1": "#6fbf73",
      "Tier 2": "#4a6fa5",
      "Tier 3": "#5a8fc2",
      "Tier 4": "#7fb3e6"
    };

    const classMap = {
      "Tier 1 Lower 40": "tier1-lower40",
      "Tier 1": "tier1",
      "Tier 2": "tier2",
      "Tier 3": "tier3",
      "Tier 4": "tier4"
    };

    const creditMap = {
      "Tier 1 Lower 40": "$4,000 per job",
      "Tier 1": "$3,500 per job",
      "Tier 2": "$2,500 per job",
      "Tier 3": "$1,250 per job",
      "Tier 4": "$750 per job"
    };

    const jobThresholdMap = {
      "Tier 1 Lower 40": "2 jobs",
      "Tier 1": "2 jobs",
      "Tier 2": "10 jobs",
      "Tier 3": "15 jobs",
      "Tier 4": "25 jobs"
    };

    const investmentCreditMap = {
      "Tier 1 Lower 40": "5% of investment cost",
      "Tier 1": "5% of investment cost",
      "Tier 2": "3% of investment cost",
      "Tier 3": "1% of investment cost",
      "Tier 4": "1% of investment cost"
    };

    // Pick readable badge text (dark navy on light fills, white on dark fills)
    function textOn(hex) {
      const c = hex.replace('#', '');
      const r = parseInt(c.substr(0, 2), 16);
      const g = parseInt(c.substr(2, 2), 16);
      const b = parseInt(c.substr(4, 2), 16);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      return lum > 150 ? '#023a51' : '#ffffff';
    }

    let tierData = {};
    let currentYear = "2026";
    let geoLayer;
    let geoData = null;                 // cached CountyBoundaries.geojson
    let geoDataPromise = null;
    const countyFeatureByKey = {};      // normalized county name -> geojson feature

    function countyKeyOf(feature) {
      const raw = feature.properties.NAME || feature.properties.Name || feature.properties.COUNTY || "";
      return raw.replace(" County", "").trim().toLowerCase();
    }

    function countyDisplayName(feature) {
      const raw = feature.properties.NAME || feature.properties.Name || feature.properties.COUNTY || "";
      return raw.replace(" County", "").trim();
    }

    // Fetch the county boundaries once, cache them, and index by county name.
    function ensureGeoData() {
      if (!geoDataPromise) {
        geoDataPromise = fetch('CountyBoundaries.geojson')
          .then(r => r.json())
          .then(data => {
            geoData = data;
            data.features.forEach(f => { countyFeatureByKey[countyKeyOf(f)] = f; });
            // Precompute the state locator off the critical path so modals open instantly.
            setTimeout(() => { if (!countyContext) buildCountyContext(data.features); }, 0);
            return data;
          });
      }
      return geoDataPromise;
    }

    function loadTierData() {
      fetch('tiers.json')
        .then(response => response.json())
        .then(data => {
          tierData = data;
          renderMap(currentYear);
        });
    }

    function renderMap(year) {
      currentYear = year;
      const tierMap = tierData[year];

      // Fade out existing counties
      if (geoLayer) {
        geoLayer.eachLayer(layer => {
          const path = layer._path;
          if (path) {
            path.classList.remove("county-visible");
            path.classList.add("county-fade");
          }
        });
      }

      setTimeout(() => {
        if (geoLayer) {
          map.removeLayer(geoLayer);
        }

        ensureGeoData().then(data => {
          geoLayer = L.geoJSON(data, {
            style: feature => {
              const label = tierData[year][countyKeyOf(feature)];
              return {
                className: `${classMap[label] || "tier-unknown"} county-fade`,
                weight: 1.5,
                color: "#333333",
                opacity: 1,
                fillOpacity: 0.9
              };
            },
            onEachFeature: (feature, layer) => {
              const county = countyDisplayName(feature);
              const key = countyKeyOf(feature);
              const label = tierMap[key] || "Tier Unknown";

              layer.on('mouseover', function () {
                this.setStyle({ weight: 2.5, color: "#007bff", fillOpacity: 0.9 });
                this.bringToFront();
                document.getElementById("countyName").textContent = `${county} County`;
                document.getElementById("countyTier").textContent = label;
                document.getElementById("countyCredit").textContent = creditMap[label] || "N/A";
                document.getElementById("countyJobs").textContent = jobThresholdMap[label] || "—";
                document.getElementById("investmentCredit").textContent = investmentCreditMap[label] || "—";
              });

              layer.on('mouseout', function () {
                geoLayer.resetStyle(this);
              });

              layer.on('click', function () {
                openCountyModal(key);
              });

              // Fade in new county
              setTimeout(() => {
                const path = layer._path;
                if (path) {
                  path.classList.remove("county-fade");
                  path.classList.add("county-visible");
                }
              }, 50);
            }
          }).addTo(map);
        });
      }, 300);
    }

    // --- County locator: the whole state greyed, the target county highlighted ---
    // Project every county once (cached); rebuild the small SVG per modal open.
    let countyContext = null;

    function forEachCountyRing(geom, cb) {
      const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
      polys.forEach(poly => poly.forEach(cb));
    }

    function buildCountyContext(features) {
      let latMin = Infinity, latMax = -Infinity;
      features.forEach(f => forEachCountyRing(f.geometry, ring => ring.forEach(pt => {
        if (pt[1] < latMin) latMin = pt[1];
        if (pt[1] > latMax) latMax = pt[1];
      })));
      const k = Math.cos(((latMin + latMax) / 2) * Math.PI / 180) || 1; // lng aspect correction

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      features.forEach(f => forEachCountyRing(f.geometry, ring => ring.forEach(pt => {
        const x = pt[0] * k, y = pt[1];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      })));

      const w = (maxX - minX) || 1, h = (maxY - minY) || 1;
      const pad = 6, vbW = 300, vbH = Math.round(vbW * h / w);
      const scale = Math.min((vbW - 2 * pad) / w, (vbH - 2 * pad) / h);
      const offX = (vbW - w * scale) / 2, offY = (vbH - h * scale) / 2;
      const px = x => offX + (x - minX) * scale;
      const py = y => offY + (maxY - y) * scale; // flip vertical

      const paths = {}, bboxes = {};
      features.forEach(f => {
        let d = '', last = '';
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        forEachCountyRing(f.geometry, ring => {
          ring.forEach((pt, i) => {
            const X = Math.round(px(pt[0] * k)), Y = Math.round(py(pt[1]));
            if (X < bx0) bx0 = X; if (X > bx1) bx1 = X;
            if (Y < by0) by0 = Y; if (Y > by1) by1 = Y;
            const cmd = (i === 0 ? 'M' : 'L') + X + ',' + Y;
            if (cmd !== last) { d += cmd; last = cmd; } // drop sub-pixel duplicate points
          });
          d += 'Z'; last = 'Z';
        });
        const key = countyKeyOf(f);
        paths[key] = d;
        bboxes[key] = { x: bx0, y: by0, w: (bx1 - bx0) || 1, h: (by1 - by0) || 1 };
      });
      countyContext = { paths, bboxes, vbW, vbH };
    }

    // Frame the target county at ~80% of the box, with greyed neighbors filling the rest.
    const LOCATOR_BOX_ASPECT = 190 / 220; // width / height of the image box
    const LOCATOR_TARGET_FRAC = 0.8;      // target county ≈ 80% of the box

    function countyContextSVG(targetKey, color) {
      if (!countyContext) return '';
      const { paths, bboxes, vbW, vbH } = countyContext;
      let others = '';
      for (const key in paths) {
        if (key !== targetKey) others += `<path d="${paths[key]}"/>`;
      }
      const target = paths[targetKey]
        ? `<path d="${paths[targetKey]}" fill="${color}" stroke="#023a51" stroke-width="1.6" stroke-linejoin="round"/>`
        : '';

      let viewBox = `0 0 ${vbW} ${vbH}`;
      const tb = bboxes[targetKey];
      if (tb) {
        // Frame so the target is ~80% in its binding dimension; keep the box aspect ratio.
        const fw = Math.max(tb.w / LOCATOR_TARGET_FRAC, (tb.h / LOCATOR_TARGET_FRAC) * LOCATOR_BOX_ASPECT);
        const fh = fw / LOCATOR_BOX_ASPECT;
        const cx = tb.x + tb.w / 2, cy = tb.y + tb.h / 2;
        viewBox = `${(cx - fw / 2).toFixed(1)} ${(cy - fh / 2).toFixed(1)} ${fw.toFixed(1)} ${fh.toFixed(1)}`;
      }

      return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" role="img" preserveAspectRatio="xMidYMid slice">
        <g fill="#dfe3e8" stroke="#ffffff" stroke-width="0.5" fill-rule="evenodd">${others}</g>
        ${target}
      </svg>`;
    }

    // --- Point-in-polygon (ray casting; even-odd rule handles holes) -------
    function pointInPolygon(x, y, rings) {
      let inside = false;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const xi = ring[i][0], yi = ring[i][1];
          const xj = ring[j][0], yj = ring[j][1];
          const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
      }
      return inside;
    }

    function featureContains(feature, lng, lat) {
      const geom = feature.geometry;
      if (geom.type === 'Polygon') return pointInPolygon(lng, lat, geom.coordinates);
      if (geom.type === 'MultiPolygon') return geom.coordinates.some(poly => pointInPolygon(lng, lat, poly));
      return false;
    }

    function findCountyAt(lng, lat) {
      if (!geoData) return null;
      return geoData.features.find(f => featureContains(f, lng, lat)) || null;
    }

    // --- GA DCA special-designation lookups (live ArcGIS point queries) ----
    const DCA_BASE = "https://services2.arcgis.com/Gqyymy5JISeLzyNM/arcgis/rest/services";

    // Opportunity Zone polygons are parcel-precise, so a geocoded rooftop/street point
    // can land a few meters outside the true parcel edge. A small buffer absorbs that
    // imprecision so an address on the boundary is still detected (matches DCA's map),
    // while staying too small to reach across a street into an adjacent block.
    const DESIGNATION_BUFFER_M = 25;

    function dcaPointQuery(service, lng, lat, outFields) {
      const geom = encodeURIComponent(JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }));
      const url = `${DCA_BASE}/${service}/FeatureServer/0/query?f=json&geometry=${geom}` +
        `&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects` +
        `&distance=${DESIGNATION_BUFFER_M}&units=esriSRUnit_Meter` +
        `&outFields=${encodeURIComponent(outFields || "*")}&returnGeometry=false`;
      return fetch(url).then(r => r.json()).then(d => (d.features || []));
    }

    async function checkDesignations(lng, lat) {
      const [ldct, mz, oz] = await Promise.all([
        dcaPointQuery("JTC_LDCT_2026", lng, lat, "tractName"),
        dcaPointQuery("JTC_MZ_Tracts_2026", lng, lat, "tractName"),
        dcaPointQuery("GA_OZDec2017", lng, lat, "Name,County")
      ]);
      const tractFeat = ldct[0] || mz[0];
      return {
        oz: oz.length > 0,
        ozName: (oz[0] && oz[0].attributes && oz[0].attributes.Name) || null,
        mz: mz.length > 0,
        ldct: ldct.length > 0,
        tractName: (tractFeat && tractFeat.attributes && tractFeat.attributes.tractName) || null
      };
    }

    function renderDesignations(result) {
      const rows = [
        { label: "Opportunity Zone", on: result.oz, extra: result.ozName },
        { label: "Military Zone", on: result.mz },
        { label: "Less Developed Census Tract", on: result.ldct }
      ];
      return rows.map(r => `
        <div class="desig-row ${r.on ? "on" : "off"}">
          <span class="desig-icon">${r.on ? "✓" : "—"}</span>
          <span class="desig-label">${escapeHtml(r.label)}${r.on && r.extra ? ` <em>(${escapeHtml(r.extra)})</em>` : ""}</span>
          <span class="desig-val">${r.on ? "Yes" : "No"}</span>
        </div>`).join("");
    }

    // --- Industry (Business Enterprise) eligibility ------------------------
    let naicsData = null;
    function loadNaics() {
      fetch('naics.json').then(r => r.json()).then(d => { naicsData = d; }).catch(() => {});
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // Per-job credit by tier — used to pick the "most credit" governing basis.
    const tierCreditNum = {
      "Tier 1 Lower 40": 4000, "Tier 1": 3500, "Tier 2": 2500, "Tier 3": 1250, "Tier 4": 750
    };
    // LDCT / Military Zone / Opportunity Zone all confer the Tier-1-level Job Tax Credit.
    const DESIGNATION_CREDIT = 3500;
    const DESIGNATION_CREDIT_TEXT = "$3,500 per job";
    const DESIGNATION_JOBS_TEXT = "2 jobs";

    // Determine which basis governs (highest credit; ties favor the broader industry rule):
    // whether all industries qualify vs. "Business Enterprise", and the credit/job minimum.
    function computeEligibility(tier, desig) {
      const candidates = [{
        type: "county",
        credit: tierCreditNum[tier] != null ? tierCreditNum[tier] : -1,
        all: tier === "Tier 1 Lower 40",
        label: tier,
        creditText: creditMap[tier] || "N/A",
        jobsText: jobThresholdMap[tier] || "—"
      }];
      const desigCand = (label, type, all) => ({
        type, credit: DESIGNATION_CREDIT, all, label,
        creditText: DESIGNATION_CREDIT_TEXT, jobsText: DESIGNATION_JOBS_TEXT
      });
      if (desig.oz) candidates.push(desigCand("Opportunity Zone", "designation", true));
      if (desig.mz) candidates.push(desigCand("Military Zone", "designation", true));
      if (desig.ldct) candidates.push(desigCand("Less Developed Census Tract", "censusTract", false));

      const typeRank = { county: 0, designation: 1, censusTract: 2 };
      candidates.sort((a, b) =>
        (b.credit - a.credit) || (b.all - a.all) || (typeRank[a.type] - typeRank[b.type]));
      const gov = candidates[0];
      return {
        allIndustries: gov.all,
        basisType: gov.type,
        basisLabel: gov.label,
        creditText: gov.creditText,
        jobsText: gov.jobsText,
        excludeCountyTierOnly: gov.type === "censusTract"
      };
    }

    // Apply the governing basis's Job Tax Credit + job minimum to the modal, noting the
    // basis when a special designation (not the plain county tier) drives the higher figure.
    function applyGoverningCredit(elig) {
      document.getElementById("modalCredit").textContent = elig.creditText;
      document.getElementById("modalJobs").textContent = elig.jobsText;
      const basis = document.getElementById("modalCreditBasis");
      if (elig.basisType === "county") {
        basis.style.display = "none";
        basis.textContent = "";
      } else {
        basis.style.display = "";
        basis.textContent = "Based on " + elig.basisLabel + " designation";
      }
    }

    function renderNaicsAccordion(excludeCountyTierOnly) {
      if (!naicsData || !naicsData.sectors) return "";
      return naicsData.sectors.map(sec => {
        const items = sec.industries.filter(it => !(excludeCountyTierOnly && it.countyTierOnly));
        if (!items.length) return "";
        const rows = items.map(it =>
          `<div class="elig-item"><span class="elig-code">${escapeHtml(it.code)}</span>` +
          `<span class="elig-desc">${escapeHtml(it.desc)}</span></div>`).join("");
        return `<div class="elig-sector">
          <button class="elig-sector-head" type="button" aria-expanded="false">
            <span class="elig-caret">▸</span>
            <span class="elig-sector-name">${escapeHtml(sec.sector)}</span>
            <span class="elig-count">${items.length}</span>
          </button>
          <div class="elig-sector-body" hidden>${rows}</div>
        </div>`;
      }).join("");
    }

    function renderEligibility(elig, countyName) {
      const section = document.getElementById("modalEligibility");
      const summary = document.getElementById("eligSummary");
      const toggle = document.getElementById("eligToggle");
      const list = document.getElementById("eligList");

      section.style.display = "";
      list.innerHTML = "";
      closeIndustries(); // reset the slide-out panel for the newly shown county

      const safeCounty = escapeHtml(countyName);
      const safeBasis = escapeHtml(elig.basisLabel);
      if (elig.allIndustries) {
        const why = elig.basisType === "county"
          ? `${safeCounty} County is a ${safeBasis} county`
          : `this address is in ${elig.basisLabel === "Opportunity Zone" ? "an" : "a"} ${safeBasis}`;
        summary.innerHTML =
          `<span class="elig-yes">✓ All industries qualify</span> for the GA Job Tax Credit here — ${why}.`;
        toggle.style.display = "none";
      } else {
        const basisText = elig.basisType === "censusTract"
          ? "this Less Developed Census Tract"
          : `${safeCounty} County (${safeBasis})`;
        summary.innerHTML =
          `To qualify in ${basisText}, a business must be a Georgia <strong>&ldquo;Business Enterprise.&rdquo;</strong>`;
        toggle.style.display = "";
        list.innerHTML = renderNaicsAccordion(elig.excludeCountyTierOnly);
      }
    }

    // --- Shared county detail modal ----------------------------------------
    let designationRequestId = 0;

    function openCountyModal(key, point) {
      const feature = countyFeatureByKey[key];
      const label = (tierData[currentYear] && tierData[currentYear][key]) || "Tier Unknown";
      const accentColor = tierFill[label] || "#6c757d";
      const displayName = feature ? countyDisplayName(feature)
        : key.replace(/\b\w/g, c => c.toUpperCase());

      if (geoData && !countyContext) buildCountyContext(geoData.features);
      document.getElementById("modalShape").innerHTML = countyContextSVG(key, accentColor);
      document.getElementById("modalCountyName").textContent = `${displayName} County`;
      document.getElementById("modalYear").textContent = currentYear;
      document.getElementById("modalAccent").style.background = accentColor;

      const badge = document.getElementById("modalTierBadge");
      badge.textContent = label;
      badge.style.background = accentColor;
      badge.style.color = textOn(accentColor);

      document.getElementById("modalCredit").textContent = creditMap[label] || "N/A";
      document.getElementById("modalJobs").textContent = jobThresholdMap[label] || "—";
      document.getElementById("modalInvestment").textContent = investmentCreditMap[label] || "—";
      document.getElementById("modalCreditBasis").style.display = "none";

      // Searched address (shown only when opened from an address search).
      const addressEl = document.getElementById("modalAddress");
      if (point && point.address) {
        addressEl.textContent = point.address;
        addressEl.style.display = "";
      } else {
        addressEl.style.display = "none";
      }

      // Special designations are address/point-specific — only shown for searches.
      const desigSection = document.getElementById("modalDesignations");
      const desigList = document.getElementById("modalDesigList");
      const tractEl = document.getElementById("modalTract");
      const reqId = ++designationRequestId;

      const eligSection = document.getElementById("modalEligibility");
      if (point) {
        desigSection.style.display = "";
        eligSection.style.display = "none"; // revealed once designations resolve
        tractEl.textContent = "";
        desigList.innerHTML = '<div class="desig-loading">Checking designations…</div>';
        checkDesignations(point.lng, point.lat)
          .then(result => {
            if (reqId !== designationRequestId) return; // a newer search superseded this one
            tractEl.textContent = result.tractName ? `Census ${result.tractName}` : "";
            desigList.innerHTML = renderDesignations(result);
            const elig = computeEligibility(label, result);
            applyGoverningCredit(elig);
            renderEligibility(elig, displayName);
          })
          .catch(() => {
            if (reqId !== designationRequestId) return;
            tractEl.textContent = "";
            desigList.innerHTML = '<div class="desig-error">Couldn’t load designation data. Please try again.</div>';
            eligSection.style.display = "none";
          });
      } else {
        // County click: no address, so show industry eligibility from the county tier
        // alone, disregarding any special designations.
        desigSection.style.display = "none";
        renderEligibility(computeEligibility(label, { oz: false, mz: false, ldct: false }), displayName);
      }

      const overlay = document.getElementById("countyModal");
      overlay.classList.add("show");
      overlay.setAttribute("aria-hidden", "false");
    }

    // --- Address search ----------------------------------------------------
    function setSearchStatus(msg, isError) {
      const el = document.getElementById("searchStatus");
      el.textContent = msg || "";
      el.style.color = isError ? "#d9534f" : "#6c757d";
    }

    // Geocode via Nominatim, biased to Georgia. Tries the full address first, then
    // retries WITHOUT the city: a mailing city (e.g. "Norcross") often differs from the
    // OSM place name for an address, which otherwise causes a false "address not found".
    // The ZIP/street keeps the fallback precise, so the city is only dropped as a backup.
    async function geocodeGeorgiaAddress(street, city, zip) {
      const queries = [];
      queries.push([street, city, "Georgia", zip].filter(Boolean).join(", ") + ", USA");
      if (city && (street || zip)) {
        queries.push([street, "Georgia", zip].filter(Boolean).join(", ") + ", USA");
      }
      for (const q of queries) {
        const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" +
          encodeURIComponent(q);
        const res = await fetch(url, { headers: { "Accept": "application/json" } });
        const data = await res.json();
        if (data && data.length) {
          return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
      }
      return null;
    }

    async function handleAddressSearch() {
      const street = document.getElementById("searchStreet").value.trim();
      const city = document.getElementById("searchCity").value.trim();
      const zip = document.getElementById("searchZip").value.trim();

      if (!street && !city && !zip) {
        setSearchStatus("Enter a street, city, or ZIP to search.", true);
        return;
      }

      setSearchStatus("Searching…", false);

      try {
        await ensureGeoData();
        const loc = await geocodeGeorgiaAddress(street, city, zip);

        if (!loc) {
          setSearchStatus("Address not found. Check the street and ZIP and try again.", true);
          return;
        }

        const feature = findCountyAt(loc.lng, loc.lat);
        if (!feature) {
          setSearchStatus("That location isn’t within a Georgia county.", true);
          return;
        }

        setSearchStatus("", false);
        const address = [street, city, zip].filter(Boolean).join(", ");
        openCountyModal(countyKeyOf(feature), { lng: loc.lng, lat: loc.lat, address });
      } catch (err) {
        setSearchStatus("Search failed — please try again.", true);
      }
    }

    // --- Legend ------------------------------------------------------------
    const legend = L.control({ position: "bottomright" });
    legend.onAdd = function () {
      const div = L.DomUtil.create("div", "legend");
      div.innerHTML = `
        <strong>Tier Legend</strong><br>
        <span class="dot" style="background:#3b7f4d;"></span> Tier 1 Lower 40<br>
        <span class="dot" style="background:#6fbf73;"></span> Tier 1<br>
        <span class="dot" style="background:#4a6fa5;"></span> Tier 2<br>
        <span class="dot" style="background:#5a8fc2;"></span> Tier 3<br>
        <span class="dot" style="background:#7fb3e6;"></span> Tier 4
      `;
      return div;
    };
    legend.addTo(map);

    // --- Wire up controls --------------------------------------------------
    document.getElementById('yearSelect').addEventListener('change', function () {
      renderMap(this.value);
    });

    document.getElementById('searchBtn').addEventListener('click', handleAddressSearch);
    ["searchStreet", "searchCity", "searchZip"].forEach(id => {
      document.getElementById(id).addEventListener('keydown', function (e) {
        if (e.key === "Enter") handleAddressSearch();
      });
    });

    // County detail modal open/close behavior
    const countyModal = document.getElementById('countyModal');
    function closeCountyModal() {
      closeIndustries();
      countyModal.classList.remove('show');
      countyModal.setAttribute('aria-hidden', 'true');
    }
    document.getElementById('modalClose').addEventListener('click', closeCountyModal);
    countyModal.addEventListener('click', function (e) {
      if (e.target === countyModal) closeCountyModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      // Escape closes the industries panel first (if open), otherwise the modal.
      if (industriesPanel.classList.contains('open')) closeIndustries();
      else closeCountyModal();
    });

    // Industry eligibility: the toggle slides out a side panel; per-sector rows expand.
    const eligToggle = document.getElementById('eligToggle');
    const eligList = document.getElementById('eligList');
    const industriesPanel = document.getElementById('industriesPanel');

    const modalShell = document.querySelector('.modal-shell');

    // Size the panel to fit beside the modal (up to 450px) and shift the modal left so
    // the modal + panel pair stays centered and fully on-screen at any embed width.
    function layoutIndustriesPanel() {
      if (!modalShell) return;
      const vw = window.innerWidth;
      if (vw <= 820) { // small screens use the CSS right-edge sheet
        industriesPanel.style.width = '';
        modalShell.style.transform = '';
        return;
      }
      const modalW = modalShell.offsetWidth;
      const pw = Math.max(300, Math.min(450, vw - modalW - 40));
      industriesPanel.style.width = pw + 'px';
      let shift = (pw - 4) / 2;
      const modalLeft = (vw - modalW) / 2 - shift;
      if (modalLeft < 16) shift = (vw - modalW) / 2 - 16;
      modalShell.style.transform = 'translateX(-' + Math.round(Math.max(0, shift)) + 'px)';
    }

    function openIndustries() {
      industriesPanel.classList.add('open');
      layoutIndustriesPanel();
      industriesPanel.setAttribute('aria-hidden', 'false');
      eligToggle.setAttribute('aria-expanded', 'true');
    }
    function closeIndustries() {
      industriesPanel.classList.remove('open');
      if (modalShell) modalShell.style.transform = '';
      industriesPanel.style.width = '';
      industriesPanel.setAttribute('aria-hidden', 'true');
      eligToggle.setAttribute('aria-expanded', 'false');
    }

    eligToggle.addEventListener('click', function () {
      if (industriesPanel.classList.contains('open')) closeIndustries();
      else openIndustries();
    });
    document.getElementById('industriesClose').addEventListener('click', closeIndustries);

    eligList.addEventListener('click', function (e) {
      const head = e.target.closest('.elig-sector-head');
      if (!head) return;
      const body = head.nextElementSibling;
      const open = body.hidden;
      body.hidden = !open;
      head.setAttribute('aria-expanded', String(open));
      head.classList.toggle('open', open);
    });

    loadTierData();
    loadNaics();
