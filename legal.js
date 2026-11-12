/* Pages légales : reprend le thème et la couleur choisis sur le portfolio (exiozz_prefs_v2). */
(function () {
  var ACCENTS = {
    cobalt:   { l: ['#2B50F0', '#FFFFFF', '#2343D6'], d: ['#7F9BFF', '#0A1233', '#9DB3FF'] },
    coral:    { l: ['#D9432B', '#FFFFFF', '#C23A24'], d: ['#FF7A63', '#2A0B05', '#FF9480'] },
    emerald:  { l: ['#0B8A5A', '#FFFFFF', '#087A4F'], d: ['#3DDC97', '#04241A', '#5AE5A8'] },
    amber:    { l: ['#F2A20C', '#231700', '#9A6200'], d: ['#FFC247', '#231700', '#FFC247'] },
    rose:     { l: ['#D6226E', '#FFFFFF', '#C01E62'], d: ['#FF6FA8', '#2A0615', '#FF8DB9'] },
    graphite: { l: ['#17171A', '#FFFFFF', '#17171A'], d: ['#F2F2F3', '#111111', '#F2F2F3'] }
  };
  var prefs = { theme: 'dark', accent: 'cobalt', radius: 'soft' };
  try { var s = JSON.parse(localStorage.getItem('exiozz_prefs_v2') || 'null'); if (s) for (var k in s) prefs[k] = s[k]; } catch (e) {}
  var dark = prefs.theme === 'dark' || (prefs.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  var a = ACCENTS[prefs.accent] || ACCENTS.cobalt;
  var c = dark ? a.d : a.l, r = document.documentElement;
  r.dataset.theme = dark ? 'dark' : 'light';
  r.dataset.radius = prefs.radius;
  r.style.setProperty('--accent', c[0]);
  r.style.setProperty('--accent-ink', c[1]);
  r.style.setProperty('--accent-text', c[2]);
  r.style.colorScheme = dark ? 'dark' : 'light';
  document.addEventListener('DOMContentLoaded', function () {
    var y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();
  });
})();
