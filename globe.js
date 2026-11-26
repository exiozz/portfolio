/*
 * Exiozz — globe 3D interactif (d3-geo + world-atlas), dessiné dans un <canvas>.
 * Globe.mount(canvas, { markers, onSelect }) → { focus(i) }
 * Chaque marqueur : { name, place, lat, lon, ... } — les champs en plus sont rendus par la page.
 */
(() => {
  const LAND_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  async function mount(canvas, { markers = [], onSelect = () => {} } = {}) {
    const ctx = canvas.getContext("2d");
    const topo = await (await fetch(LAND_URL)).json();
    const land = topojson.feature(topo, topo.objects.land);

    // Points sur les terres : on dessine les terres à plat une fois, puis on lit les pixels (rapide)
    const mw = 720, mh = 360, mask = document.createElement("canvas");
    mask.width = mw; mask.height = mh;
    const mctx = mask.getContext("2d");
    const flat = d3.geoEquirectangular().fitSize([mw, mh], { type: "Sphere" });
    mctx.fillStyle = "#000"; mctx.beginPath(); d3.geoPath(flat, mctx)(land); mctx.fill();
    const px = mctx.getImageData(0, 0, mw, mh).data;
    const dots = [];
    for (let lat = -84; lat <= 84; lat += 1.5) {
      const step = 1.5 / Math.max(.25, Math.cos(lat * Math.PI / 180));
      for (let lon = -180; lon < 180; lon += step) {
        const [x, y] = flat([lon, lat]);
        if (px[(Math.floor(y) * mw + Math.floor(x)) * 4 + 3] > 128) dots.push([lon, lat]);
      }
    }

    const proj = d3.geoOrthographic().clipAngle(90).precision(.4);
    const path = d3.geoPath(proj, ctx);
    const grat = d3.geoGraticule10();
    let size = 0, dpr = 1, rot = [-10, -38, 0], vel = [.06, 0], drag = null, hover = -1, selected = -1, anim = null;
    let colors = {};
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      colors = {
        sphere: cs.getPropertyValue("--globe-bg").trim() || "#050505",
        grid: cs.getPropertyValue("--globe-grid").trim() || "rgba(255,255,255,.14)",
        coast: cs.getPropertyValue("--globe-coast").trim() || "#ffffff",
        dot: cs.getPropertyValue("--globe-dot").trim() || "rgba(255,255,255,.55)",
        accent: cs.getPropertyValue("--accent").trim() || "#ff5a1f"
      };
    };
    readColors();
    document.addEventListener("themechange", () => setTimeout(readColors, 30));

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      size = Math.max(200, r.width); dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = size * dpr; canvas.height = size * dpr;
      proj.translate([size / 2, size / 2]).scale(size / 2 - 2);
    };
    resize();
    new ResizeObserver(resize).observe(canvas);

    const visible = (lon, lat) => d3.geoDistance([lon, lat], [-rot[0], -rot[1]]) < Math.PI / 2 - .02;
    const markerXY = () => markers.map(m => visible(m.lon, m.lat) ? proj([m.lon, m.lat]) : null);

    const draw = t => {
      proj.rotate(rot);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath(); path({ type: "Sphere" }); ctx.fillStyle = colors.sphere; ctx.fill();
      ctx.beginPath(); path(grat); ctx.strokeStyle = colors.grid; ctx.lineWidth = .6; ctx.stroke();
      ctx.fillStyle = colors.dot;
      const s = Math.max(1, size / 520);
      for (const [lon, lat] of dots) {
        if (!visible(lon, lat)) continue;
        const [x, y] = proj([lon, lat]);
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
      ctx.beginPath(); path(land); ctx.strokeStyle = colors.coast; ctx.lineWidth = .9; ctx.stroke();
      ctx.beginPath(); path({ type: "Sphere" }); ctx.strokeStyle = colors.grid; ctx.lineWidth = 1; ctx.stroke();
      markerXY().forEach((p, i) => {
        if (!p) return;
        const pulse = reduce ? 0 : (t / 1400 + i * .3) % 1;
        ctx.beginPath(); ctx.arc(p[0], p[1], 6 + pulse * 16, 0, Math.PI * 2);
        ctx.strokeStyle = colors.accent; ctx.globalAlpha = 1 - pulse; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
        const big = i === hover || i === selected, n = markers[i].count;
        ctx.beginPath(); ctx.arc(p[0], p[1], n > 1 ? (big ? 12 : 10) : (big ? 8 : 6), 0, Math.PI * 2);
        ctx.fillStyle = colors.accent; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = colors.sphere; ctx.stroke();
        if (n > 1) { ctx.fillStyle = "#fff"; ctx.font = "600 10px Geist, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(n, p[0], p[1] + .5); }
      });
    };

    const loop = t => {
      if (anim) {
        const k = Math.min(1, (t - anim.t0) / 1100), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        rot = anim.i(e); if (k >= 1) anim = null;
      } else if (!drag) {
        vel[0] *= .97; vel[1] *= .97;
        const idle = reduce || selected >= 0 ? 0 : .045;
        rot[0] += vel[0] + idle; rot[1] = Math.max(-80, Math.min(80, rot[1] + vel[1]));
      }
      draw(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const pick = p => {
      let best = -1, bd = 16;
      markerXY().forEach((m, i) => { if (m) { const d = Math.hypot(m[0] - p[0], m[1] - p[1]); if (d < bd) { bd = d; best = i; } } });
      return best;
    };
    canvas.addEventListener("pointerdown", e => {
      anim = null; drag = { p: local(e), r: rot.slice(), moved: 0, last: local(e) };
      canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("pointermove", e => {
      const p = local(e);
      if (drag) {
        const k = 90 / (size / 2);
        rot = [drag.r[0] + (p[0] - drag.p[0]) * k, Math.max(-80, Math.min(80, drag.r[1] - (p[1] - drag.p[1]) * k)), 0];
        vel = [(p[0] - drag.last[0]) * k * .5, -(p[1] - drag.last[1]) * k * .5];
        drag.moved += Math.hypot(p[0] - drag.last[0], p[1] - drag.last[1]); drag.last = p;
      } else {
        hover = pick(p); canvas.style.cursor = hover >= 0 ? "pointer" : "grab";
      }
    });
    const up = e => {
      if (!drag) return;
      const click = drag.moved < 5; drag = null; canvas.style.cursor = "grab";
      if (click) { const i = pick(local(e)); if (i >= 0) select(i); }
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", () => { drag = null; });

    const focus = i => {
      const m = markers[i];
      const target = [-m.lon, -m.lat * .8, 0];
      while (target[0] - rot[0] > 180) target[0] -= 360;
      while (target[0] - rot[0] < -180) target[0] += 360;
      anim = { t0: performance.now(), i: d3.interpolate(rot.slice(), target) };
      vel = [0, 0];
    };
    const select = i => { selected = i; focus(i); onSelect(i); };
    const setMarkers = (list, cb) => { markers = list; selected = -1; hover = -1; if (cb) onSelect = cb; };
    canvas.style.cursor = "grab";
    return { focus, select, setMarkers, clear: () => { selected = -1; } };
  }

  window.Globe = { mount };
})();
