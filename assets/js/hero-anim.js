// Hero animation for CircularTech Advisory. Fills every .ctf-hero__art[data-anim] with a canvas.
//   data-anim="loop"  : the passport is the loop (locked lab candidate c8). Below 900px wide: drift only.
//   data-anim="drift" : soft colour fields drifting behind the copy (lab candidate c4).
// Each scene is a pure function of time, so reduced motion shows one still frame. Pauses off-screen and in a
// hidden tab. No network, no libraries.
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function ease(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
  function dot(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }

  var FIELDS = [["#A7F6AA", .20, 37, .13], ["#66CCEC", .20, 43, .9], ["#87E1CB", .14, 31, 2.1], ["#D4922A", .07, 53, 4.2]];
  function drift(ctx, w, h, t, k) {
    FIELDS.forEach(function (f, i) {
      var x = w * (.68 + .2 * Math.sin(t * 2 * Math.PI / f[2] + f[3]));
      var y = h * (.5 + .32 * Math.sin(t * 2 * Math.PI / (f[2] * 1.3) + f[3] * 1.7));
      var R = Math.max(w, h) * (.32 + .05 * i), g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, f[0]); g.addColorStop(1, "rgba(22,22,22,0)");
      ctx.globalAlpha = f[1] * k; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    ctx.globalAlpha = 1;
  }

  function passport(x0, y0, cw, r, rows) {
    var ch = cw * 1.32, g = cw / 22, pts = [], k, a, b;
    for (k = 0; k < 7; k++) pts.push({ x: x0 + g * (2 + k), y: y0 + g * 2.4, c: "#D4922A", row: -1 });
    rows.forEach(function (n, row) {
      for (var k2 = 0; k2 < n; k2++) pts.push({ x: x0 + g * (2 + k2), y: y0 + g * (5.5 + row * 2.4), c: row % 2 ? "#87E1CB" : "#A7F6AA", row: row });
    });
    for (a = 0; a < 7; a++) for (b = 0; b < 7; b++) if (r() > .38 || a % 6 === 0 || b % 6 === 0)
      pts.push({ x: x0 + cw - g * (9 - b), y: y0 + ch - g * (9 - a), c: "#66CCEC", row: 99 });
    return { pts: pts, x0: x0, y0: y0, cw: cw, ch: ch, g: g };
  }

  // Point at fraction s along a rounded rectangle, clockwise from the top-left corner.
  function rrPoint(x, y, w, h, r, s) {
    var segs = [w - 2 * r, Math.PI * r / 2, h - 2 * r, Math.PI * r / 2, w - 2 * r, Math.PI * r / 2, h - 2 * r, Math.PI * r / 2];
    var tot = segs.reduce(function (a, b) { return a + b; }, 0), d = (((s % 1) + 1) % 1) * tot, i = 0;
    while (d > segs[i] && i < 7) { d -= segs[i]; i++; }
    function arc(cx, cy, a0) { var a = a0 + d / r; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }
    switch (i) {
      case 0: return [x + r + d, y];          case 1: return arc(x + w - r, y + r, -Math.PI / 2);
      case 2: return [x + w, y + r + d];      case 3: return arc(x + w - r, y + h - r, 0);
      case 4: return [x + w - r - d, y + h];  case 5: return arc(x + r, y + h - r, Math.PI / 2);
      case 6: return [x, y + h - r - d];      default: return arc(x + r, y + r, Math.PI);
    }
  }
  var LANE_COLS = ["#A7F6AA", "#87E1CB", "#66CCEC", "#87E1CB"];
  var LANE_SPEED = [.034, .021, .013, .008];                 // inner lane fastest, outer slowest

  var SCENES = {
    drift: { staticT: 12, layout: function () { return {}; }, draw: function (ctx, w, h, t) { drift(ctx, w, h, t, 1); } },

    // Locked lab candidate c8 "The loop feeds the passport" (round 3, 2026-11-17). Material runs on four lanes
    // around the passport outline at different speeds, with comet tails; data peels off the outer lane in curves
    // into the fields and the loop closes as the passport fills; at the end the data returns to the loop.
    loop: {
      staticT: 13.6,
      layout: function (w, h) {
        if (w < 900) return { off: true };
        var r = rng(21), cw = Math.min(w * .2, h * .44);
        var P = passport(w * .78 - cw / 2, h * .52 - cw * .66, cw, r, [16, 11, 14, 9, 13]);
        P.pts.forEach(function (q) { q.d = r(); q.s0 = r(); });
        var lanes = [0, 1, 2, 3].map(function (i) {
          var dots = [];
          for (var k = 0; k < 30 + i * 6; k++) dots.push({ s: r(), a: .35 + r() * .5 });
          return { inset: -i * P.g * 1.05, col: LANE_COLS[i], v: LANE_SPEED[i], dots: dots };
        });
        return { P: P, lanes: lanes };
      },
      draw: function (ctx, w, h, t, L) {
        drift(ctx, w, h, t, .7);
        if (L.off) return;
        var P = L.P, g = P.g, p = t % 18;
        var fill = p < 3 ? 0 : p < 9 ? ease((p - 3) / 6) : p < 15 ? 1 : 1 - ease((p - 15) / 3);
        var span = .74 + .26 * fill;
        function lanePt(ln, s) { return rrPoint(P.x0 + ln.inset, P.y0 + ln.inset, P.cw - 2 * ln.inset, P.ch - 2 * ln.inset, g * 1.2 - ln.inset, s); }
        function start(i) { return .08 + t * .004 * (i % 2 ? -1 : 1); }
        L.lanes.forEach(function (ln, i) {
          var a0 = start(i), k;
          ctx.strokeStyle = ln.col; ctx.lineWidth = 1.2; ctx.globalAlpha = .14 + .14 * fill; ctx.beginPath();
          for (k = 0; k <= 140; k++) { var q = lanePt(ln, a0 + span * k / 140); if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
          ctx.stroke();
          ctx.fillStyle = ln.col;
          ln.dots.forEach(function (d) {
            var s = (d.s + t * ln.v) % 1, fadeEnd = fill > .98 ? 1 : Math.min(1, (1 - s) * 6), j;
            for (j = 1; j <= 6; j++) {                                   // comet tail
              var sj = s - j * ln.v * .09; if (sj < 0) break;
              var tq = lanePt(ln, a0 + sj * span); ctx.globalAlpha = d.a * fadeEnd * (1 - j / 7) * .5; dot(ctx, tq[0], tq[1], 1.5 * (1 - j / 9));
            }
            var q2 = lanePt(ln, a0 + s * span); ctx.globalAlpha = d.a * fadeEnd; dot(ctx, q2[0], q2[1], 1.7);
          });
          if (fill < .98) { var e = lanePt(ln, a0 + span); ctx.globalAlpha = .85 * (1 - fill); ctx.fillStyle = "#D4922A"; dot(ctx, e[0], e[1], 2.8); }
        });
        var outer = L.lanes[3];
        P.pts.forEach(function (q) {
          var isQR = q.row === 99, k;
          if (isQR) k = fill > .5 ? ease((fill - .5) * 2 - q.d * .5) : 0;
          else { var st = 3 + q.d * 5; k = p < 15 ? ease((p - st) / 1.3) : 1 - ease((p - 15 - q.d * 1.5) / 1.4); }
          if (k <= 0) return;
          if (isQR || k >= 1) { ctx.globalAlpha = .9 * Math.min(1, k); ctx.fillStyle = q.c; dot(ctx, q.x, q.y, 1.6); return; }
          var sp = lanePt(outer, start(3) + q.s0 * span), sx = sp[0], sy = sp[1];
          var cx = (sx + q.x) / 2 + (sy - q.y) * .25, cy = (sy + q.y) / 2 + (q.x - sx) * .25;   // curved flight
          function pos(kk) { var u = 1 - kk; return [u * u * sx + 2 * u * kk * cx + kk * kk * q.x, u * u * sy + 2 * u * kk * cy + kk * kk * q.y]; }
          ctx.fillStyle = q.c;
          for (var j = 1; j <= 5; j++) { var pj = pos(Math.max(0, k - j * .035)); ctx.globalAlpha = .4 * (1 - j / 6); dot(ctx, pj[0], pj[1], 1.3); }
          var pk = pos(k); ctx.globalAlpha = .55 + .4 * k; ctx.fillStyle = q.row === -1 ? "#D4922A" : q.c; dot(ctx, pk[0], pk[1], 1.8);
        });
        ctx.globalAlpha = 1;
      },
    },
  };

  function mount(host) {
    var scene = SCENES[host.getAttribute("data-anim")];
    if (!scene) return;
    var canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
    if (!ctx) return;
    host.appendChild(canvas);
    var w = 0, h = 0, L = null, raf = 0, last = null, t = 0, visible = true;
    function paint() { ctx.clearRect(0, 0, w, h); scene.draw(ctx, w, h, reduce ? scene.staticT : t, L); }
    function running() { return !reduce && visible && !document.hidden; }
    function resize() {
      var dpr = Math.min(2, window.devicePixelRatio || 1), r = host.getBoundingClientRect();
      w = r.width; h = r.height; if (!w || !h) return;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); L = scene.layout(w, h); paint();
    }
    function tick(now) { if (last !== null) t += Math.min(0.05, (now - last) / 1000); last = now; paint(); raf = requestAnimationFrame(tick); }
    function update() { cancelAnimationFrame(raf); last = null; if (running() && L) raf = requestAnimationFrame(tick); }
    if ("ResizeObserver" in window) new ResizeObserver(function () { resize(); update(); }).observe(host); else resize();
    if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; update(); }).observe(host);
    document.addEventListener("visibilitychange", update);
    resize(); update();
  }

  Array.prototype.forEach.call(document.querySelectorAll(".ctf-hero__art[data-anim]"), mount);
})();
