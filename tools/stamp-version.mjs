// Cache busting + offline list: run `node tools/stamp-version.mjs` after
// changing files (and bumping GAME_VERSION in js/config.js). It rewrites
// index.html (versioned "?v=" URLs for every script, the stylesheet and the
// import map) and sw.js (VERSION and the list of files to keep offline).
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname;
const v = /GAME_VERSION = '([^']+)'/.exec(fs.readFileSync(root + 'js/config.js', 'utf8'))[1];
const files = fs.readdirSync(root + 'js').filter((f) => f.endsWith('.js')).sort();
const imports = { three: './js/vendor/three.module.js?v=' + v };   // three.js is kept in this folder too
for (const f of files) imports['./js/' + f] = './js/' + f + '?v=' + v;
const map = '<script type="importmap">\n' + JSON.stringify({ imports }, null, 2).split('\n').map((l) => '    ' + l).join('\n') + '\n  </script>';
let html = fs.readFileSync(root + 'index.html', 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, map);
html = html.replace(/href="css\/style\.css(\?v=[^"]*)?"/, `href="css/style.css?v=${v}"`);
html = html.replace(/src="js\/main\.js(\?v=[^"]*)?"/, `src="js/main.js?v=${v}"`);
fs.writeFileSync(root + 'index.html', html);
const icons = fs.readdirSync(root + 'icons').filter((f) => !f.includes('social')).map((f) => './icons/' + f);
const imgs = fs.readdirSync(root + 'img').map((f) => './img/' + f);
const audio = fs.readdirSync(root + 'audio').filter((f) => !f.endsWith('.txt')).map((f) => './audio/' + f);
const offline = ['./', './index.html', './manifest.webmanifest', './css/style.css?v=' + v, './js/vendor/three.module.js?v=' + v, ...files.map((f) => './js/' + f + '?v=' + v), ...icons, ...imgs, ...audio];
let sw = fs.readFileSync(root + 'sw.js', 'utf8');
sw = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${v}';`).replace(/const FILES = \[[\s\S]*?\];/, 'const FILES = ' + JSON.stringify(offline, null, 2) + ';');
fs.writeFileSync(root + 'sw.js', sw);
console.log('stamped', v, files.length, 'modules,', offline.length, 'offline files');
