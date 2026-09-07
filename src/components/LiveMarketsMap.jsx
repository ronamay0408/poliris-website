import { useMemo } from 'react';
import { geoNaturalEarth1, geoPath, geoCentroid, geoArea } from 'd3-geo';
import { feature } from 'topojson-client';
import worldTopo from 'world-atlas/countries-110m.json';

// Redesign, replacing RealMarketMapV2 (the interactive tour/pin/theme-toggle
// map — a standalone copy of that old design was saved for reference before
// this swap). This one is a static three-tier choropleth, light-only, no
// interaction at all: matches a reference screenshot ("Where ChatGPT Ads
// are live" — headline, subtitle, colored country fills, a bottom-left
// legend). The headline/subtitle live in VisibilityPage.jsx's own section
// heading now (visibility.realMarket in the locale files), not here — this
// component just owns the map itself. Content below (tiers, country lists)
// is placeholder — swap it for real rollout data before shipping.
const TIERS = [
  { key: 'live', label: 'Already live' },
  { key: 'soon', label: 'Launching soon' },
  { key: 'none', label: 'Not announced' },
];

// ISO country names as they appear in world-atlas's own `properties.name`
// (Natural Earth's admin names — already verified against this exact
// dataset earlier for the old map, e.g. "United States of America", not
// "USA" or "United States").
const LIVE_COUNTRIES = ['United States of America', 'Canada', 'Mexico', 'Brazil', 'United Kingdom', 'Japan', 'Australia', 'New Zealand'];
const SOON_COUNTRIES = ['France', 'Germany', 'Spain', 'Portugal', 'Italy', 'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Ireland', 'Denmark', 'Norway', 'Sweden', 'Finland', 'Iceland', 'Poland', 'Czechia', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Greece', 'Croatia', 'Slovenia', 'Estonia', 'Latvia', 'Lithuania', 'Luxembourg'];

// Glossy ball-on-a-needle pin, red — a radial-gradient sphere (bright
// highlight near the light source, deep at the rim) on a small
// brushed-metal post, same construction as the old interactive map's pins,
// just recolored and with no label/chip attached.
const PIN_BALL_HI = '#e3a19a';
const PIN_BALL_MID = '#a3362b';
const PIN_BALL_LO = '#4d1712';
const PIN_NEEDLE_A = '#8b8f9c';
const PIN_NEEDLE_B = '#e4e7ee';
const PIN_NEEDLE_C = '#7c8391';
// Scales the pin down from its natural ~34x52 size — full-size read as
// oversized against a country as small as the UK or Japan on this map.
const PIN_SCALE = 0.5;

function Pin({ id, x, y }) {
  const ballId = `lmm-ball-${id}`;
  const needleId = `lmm-needle-${id}`;
  return (
    <g className="lmm-pin" transform={`translate(${x} ${y}) scale(${PIN_SCALE}) translate(-17 -49.5)`}>
      <ellipse cx="17" cy="49.5" rx="6" ry="2.2" fill="rgba(20,10,10,0.32)" />
      <path d="M17.9 27 L17.9 48.6 L16.6 49.8 L16.1 27 Z" fill={`url(#${needleId})`} />
      <circle cx="17" cy="17" r="11.4" fill={`url(#${ballId})`} />
      <ellipse cx="12.8" cy="12.2" rx="4.1" ry="3" fill="rgba(255,255,255,0.72)" transform="rotate(-24 12.8 12.2)" />
      <path d="M17 28.4a11.4 11.4 0 0 0 9.9-5.8 11.4 11.4 0 0 1-19.8 0 11.4 11.4 0 0 0 9.9 5.8Z" fill="rgba(255,255,255,0.16)" />
      <defs>
        <radialGradient id={ballId} cx="0.34" cy="0.28" r="0.82">
          <stop offset="0" stopColor={PIN_BALL_HI} />
          <stop offset="0.42" stopColor={PIN_BALL_MID} />
          <stop offset="1" stopColor={PIN_BALL_LO} />
        </radialGradient>
        <linearGradient id={needleId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={PIN_NEEDLE_A} />
          <stop offset="0.5" stopColor={PIN_NEEDLE_B} />
          <stop offset="1" stopColor={PIN_NEEDLE_C} />
        </linearGradient>
      </defs>
    </g>
  );
}

const WIDTH = 1000;
// The country union's own rendered aspect ratio (measured, not guessed) is
// ~1.93:1 — a box any wider/shorter than that leaves margin on whichever
// axis is the non-binding one. 520 puts the box ratio (~1.94) right next
// to it, so the map uses close to the full frame on every side.
const HEIGHT = 520;
const PAD = 6;

export default function LiveMarketsMap() {
  // No resize-driven recompute needed — unlike the old map, nothing here is
  // an HTML overlay that has to land on exact pixel coordinates (no pins,
  // no chips), so a plain viewBox lets CSS scale the whole thing for free.
  const { countries, pins } = useMemo(() => {
    const featureCollection = feature(worldTopo, worldTopo.objects.countries);
    // Fit to the actual union of country shapes, not the abstract full
    // globe ({type:'Sphere'}) — the sphere's own bounds include empty
    // polar ocean well past any real landmass, which was leaving the map
    // looking small and padded inside its own card.
    const projection = geoNaturalEarth1().fitExtent([[PAD, PAD], [WIDTH - PAD, HEIGHT - PAD]], featureCollection);
    const pathGen = geoPath(projection);
    const countries = featureCollection.features.map((f) => {
      const name = f.properties.name;
      let tier = 'none';
      if (LIVE_COUNTRIES.includes(name)) tier = 'live';
      else if (SOON_COUNTRIES.includes(name)) tier = 'soon';
      return { id: f.id, d: pathGen(f), tier };
    }).filter((c) => c.d);

    // One plain pin per "already live" market, no label — just marking the
    // location. Anchored on the largest ring of the country's own geometry
    // (not the raw multipolygon centroid), same reasoning as the old map:
    // a country with scattered overseas territory (the US's own polygon
    // includes Alaska) can have a centroid that lands nowhere near its
    // actual landmass, or even in open ocean.
    const pins = featureCollection.features
      .filter((f) => LIVE_COUNTRIES.includes(f.properties.name))
      .map((f) => {
        let geom = f.geometry;
        if (geom.type === 'MultiPolygon') {
          let best = null;
          let bestArea = -1;
          geom.coordinates.forEach((coords) => {
            const a = geoArea({ type: 'Polygon', coordinates: coords });
            if (a > bestArea) { bestArea = a; best = coords; }
          });
          geom = { type: 'Polygon', coordinates: best };
        }
        const [x, y] = projection(geoCentroid({ type: 'Feature', geometry: geom }));
        return { id: f.id, x, y };
      });

    return { countries, pins };
  }, []);

  return (
    <div className="lmm">
      <div className="lmm-card">
        <svg className="lmm-svg" width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="World map showing market rollout status by country">
          {countries.map((c) => (
            <path key={c.id} className={`lmm-country lmm-country--${c.tier}`} d={c.d} />
          ))}
          {pins.map((p) => (
            <Pin key={p.id} id={p.id} x={p.x} y={p.y} />
          ))}
        </svg>
        <div className="lmm-legend">
          {TIERS.map((t) => (
            <span key={t.key} className="lmm-legend-item">
              <i className={`lmm-swatch lmm-swatch--${t.key}`} />
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
