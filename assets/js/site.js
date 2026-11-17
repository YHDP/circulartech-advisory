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
