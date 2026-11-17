// Hero animation for CircularTech Advisory. Fills every .ctf-hero__art[data-anim] with a canvas.
//   data-anim="loop"  : the passport loop (lab candidate c6, provisional): a product travels the loop and each
//                       lifecycle station writes a row into the passport. Below 900px wide: drift only.
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

  var SCENES = {
    drift: { staticT: 12, layout: function () { return {}; }, draw: function (ctx, w, h, t) { drift(ctx, w, h, t, 1); } },

    loop: {
      staticT: 12.3,
      layout: function (w, h) {
        if (w < 900) return { off: true };
        var r = rng(9), cx = w * .79, cy = h * .52, R = Math.min(h * .36, w * .15), cw = R * .82;
        var P = passport(cx - cw / 2, cy - cw * .66, cw, r, [14, 10, 13, 9]);
        P.pts.forEach(function (q) { q.d = r() * .5; });
        var st = [0, 1, 2, 3].map(function (s) { return -Math.PI / 2 + 2 * Math.PI * (s + .5) / 4; });
        var flow = [];
        for (var i = 0; i < 60; i++) flow.push({ s: r(), v: .03 + r() * .02, ring: r() < .5 ? 0 : 1 });
        return { P: P, cx: cx, cy: cy, R: R, st: st, flow: flow };
      },
      draw: function (ctx, w, h, t, L) {
        drift(ctx, w, h, t, .7);
        if (L.off) return;
        var P = L.P, cx = L.cx, cy = L.cy, R = L.R, st = L.st, p = t % 14;
        var fade = p < 12.6 ? 1 : 1 - ease((p - 12.6) / 1.2), lap = Math.min(1, p / 12);
        ctx.lineWidth = 1.2; ctx.strokeStyle = "#87E1CB";
        [R, R * 1.08].forEach(function (rr) { ctx.globalAlpha = .2; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.stroke(); });
        L.flow.forEach(function (d) {
          var a = 2 * Math.PI * ((d.s + t * d.v) % 1), rr = d.ring ? R * 1.08 : R;
          ctx.globalAlpha = .55; ctx.fillStyle = d.ring ? "#66CCEC" : "#A7F6AA"; dot(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.5);
        });
        st.forEach(function (a, s) {
          var passed = lap * 4 > s + .5;
          ctx.globalAlpha = passed ? .9 : .35; ctx.fillStyle = "#87E1CB"; dot(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, passed ? 4 : 3);
        });
        ctx.globalAlpha = .35 * fade; ctx.strokeStyle = "#87E1CB"; ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(P.x0, P.y0, P.cw, P.ch, P.g * 1.2); else ctx.rect(P.x0, P.y0, P.cw, P.ch);
        ctx.stroke();
        P.pts.forEach(function (q) {
          var k, sx = q.x, sy = q.y;
          if (q.row === -1) k = 1;
          else if (q.row === 99) k = ease((p - 11.4 - q.d) / .8);
          else { k = ease((p - 12 * (q.row + .5) / 4 - q.d) / 1.1); sx = cx + Math.cos(st[q.row]) * R; sy = cy + Math.sin(st[q.row]) * R; }
          if (k <= 0) return;
          ctx.globalAlpha = (q.row === 99 ? k : .5 + .45 * k) * fade; ctx.fillStyle = q.c;
          dot(ctx, sx + (q.x - sx) * k, sy + (q.y - sy) * k, 1.6);
        });
        if (p < 12) {
          var a = -Math.PI / 2 + 2 * Math.PI * lap;
          ctx.globalAlpha = 1; ctx.fillStyle = "#D4922A"; dot(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 4.5);
        }
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
