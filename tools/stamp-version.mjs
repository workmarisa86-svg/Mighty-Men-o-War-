// Cache busting: run `node tools/stamp-version.mjs` after changing files (and
// bumping GAME_VERSION in js/config.js). It rewrites index.html so every
// script, the stylesheet and the import map point at "?v=<version>" URLs, so
// browsers (and GitHub Pages' cache) always fetch the new files.
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname;
const v = /GAME_VERSION = '([^']+)'/.exec(fs.readFileSync(root + 'js/config.js', 'utf8'))[1];
const files = fs.readdirSync(root + 'js').filter((f) => f.endsWith('.js')).sort();
const imports = { three: 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js' };
for (const f of files) imports['./js/' + f] = './js/' + f + '?v=' + v;
const map = '<script type="importmap">\n' + JSON.stringify({ imports }, null, 2).split('\n').map((l) => '    ' + l).join('\n').replace(/^ {4}/, '    ') + '\n  </script>';
let html = fs.readFileSync(root + 'index.html', 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, map);
html = html.replace(/href="css\/style\.css(\?v=[^"]*)?"/, `href="css/style.css?v=${v}"`);
html = html.replace(/src="js\/main\.js(\?v=[^"]*)?"/, `src="js/main.js?v=${v}"`);
fs.writeFileSync(root + 'index.html', html);
console.log('stamped', v, files.length, 'modules');
