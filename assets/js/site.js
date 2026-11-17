/* CircularTech Advisory: copy-email buttons and footer year. No network calls. */
(function () {
  var EMAIL = 'consulting@circulartechforum.de';
  var status = document.getElementById('copy-status');

  function announce(msg) {
    if (!status) return;
    status.textContent = '';
    setTimeout(function () { status.textContent = msg; }, 50);
  }

  function fallbackCopy() {
    var ta = document.createElement('textarea');
    ta.value = EMAIL;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function showCopied(btn) {
    var label = btn.querySelector('.ctf-btn__label');
    btn.classList.add('is-copied');
    if (label) label.textContent = 'Copied';
    announce('Email address copied to the clipboard.');
    setTimeout(function () {
      btn.classList.remove('is-copied');
      if (label) label.textContent = EMAIL;
    }, 2000);
  }

  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(EMAIL).then(function () { showCopied(btn); }, function () {
          if (fallbackCopy()) showCopied(btn); else location.href = 'mailto:' + EMAIL;
        });
      } else if (fallbackCopy()) {
        showCopied(btn);
      } else {
        location.href = 'mailto:' + EMAIL;
      }
    });
  });

  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();

/* Site navigation, after the Regen Studio nav.js: scrolled state, desktop Menu dropdown,
   Get-in-touch popover, and the phone slide-in panel. Escape and outside clicks close everything. */
(function () {
  var nav = document.getElementById('nav');
  if (!nav) return;

  function onScroll() { nav.classList.toggle('ctf-nav--scrolled', window.scrollY > 40); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var pairs = [];
  function pair(btn, panel, onOpen, onClose) {
    if (!btn || !panel) return;
    var p = { btn: btn, panel: panel, onOpen: onOpen, onClose: onClose };
    pairs.push(p);
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !panel.classList.contains('is-open');
      closeAll(p);
      set(p, open);
    });
  }
  function set(p, open) {
    p.panel.classList.toggle('is-open', open);
    p.btn.setAttribute('aria-expanded', String(open));
    if (open && p.onOpen) p.onOpen();
    if (!open && p.onClose) p.onClose();
  }
  function closeAll(except) {
    pairs.forEach(function (p) { if (p !== except && p.panel.classList.contains('is-open')) set(p, false); });
  }

  pair(nav.querySelector('.ctf-nav__menu-btn'), document.getElementById('navDropdown'));
  pair(nav.querySelector('.ctf-nav__contact-btn'), document.getElementById('navContact'));
  pair(document.getElementById('navToggle'), document.getElementById('navLinks'),
    function () { document.body.classList.add('nav-open'); },
    function () { document.body.classList.remove('nav-open'); });

  document.addEventListener('click', function (e) {
    pairs.forEach(function (p) {
      if (p.panel.classList.contains('is-open') && !p.panel.contains(e.target)) set(p, false);
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    pairs.forEach(function (p) { if (p.panel.classList.contains('is-open')) { set(p, false); p.btn.focus(); } });
  });
  nav.querySelectorAll('.ctf-nav__dropdown a, .ctf-nav__links a').forEach(function (a) {
    a.addEventListener('click', function () { closeAll(null); });
  });
})();
