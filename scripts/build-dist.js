/**
 * Gera a pasta dist/ para deploy (FTP, zip, etc.)
 * Uso: node scripts/build-dist.js
 *
 * Windows: em vez de apagar dist/ (EBUSY se Explorer/IDE tiver ficheiros abertos),
 * monta tudo em .amina-dist-staging/ e copia por cima com fs.cpSync.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const staging = path.join(root, '.amina-dist-staging');
const apiLocalSrc = path.join(root, 'api', 'config.local.php');
const distLocalPrev = path.join(root, 'dist', 'api', 'config.local.php');

/**
 * A senha tem de viver em api/config.local.php (gitignored).
 * Se só editaste dist/ antes, antes de apagar dist copiamos para api/ para não perder.
 */
if (!fs.existsSync(apiLocalSrc) && fs.existsSync(distLocalPrev)) {
  fs.mkdirSync(path.dirname(apiLocalSrc), { recursive: true });
  fs.copyFileSync(distLocalPrev, apiLocalSrc);
  console.log(
    'Preservado: dist/api/config.local.php → api/config.local.php (próximos builds mantêm a senha).'
  );
}

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name === '.gitkeep') continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

rmrf(staging);
fs.mkdirSync(staging, { recursive: true });

const copies = [
  ['index.html', 'index.html'],
  ['css', 'css'],
  ['js', 'js'],
  ['assets', 'assets'],
  ['admin', 'admin'],
  ['api', 'api'],
];

for (const [from, to] of copies) {
  const src = path.join(root, from);
  if (!fs.existsSync(src)) continue;
  const dst = path.join(staging, to);
  const st = fs.statSync(src);
  if (st.isFile()) fs.copyFileSync(src, dst);
  else copyDir(src, dst);
}

// config.local.php: se existir em api/ (local), já foi copiado com copyDir — NÃO sobrescrever.
const apiStaging = path.join(staging, 'api');
const examplePath = path.join(apiStaging, 'config.example.php');
const localPath = path.join(apiStaging, 'config.local.php');
if (!fs.existsSync(localPath) && fs.existsSync(examplePath)) {
  fs.copyFileSync(examplePath, localPath);
}

// uploads + htaccess
const up = path.join(staging, 'uploads');
fs.mkdirSync(up, { recursive: true });
const ht = path.join(root, 'uploads', '.htaccess');
if (fs.existsSync(ht)) fs.copyFileSync(ht, path.join(up, '.htaccess'));

// sql
const sqlSrc = path.join(root, 'sql');
if (fs.existsSync(sqlSrc)) {
  const sqlDst = path.join(staging, 'sql');
  fs.mkdirSync(sqlDst, { recursive: true });
  for (const f of fs.readdirSync(sqlSrc)) {
    if (f.endsWith('.sql')) fs.copyFileSync(path.join(sqlSrc, f), path.join(sqlDst, f));
  }
}

// logo (sem .cdr)
const logoSrc = path.join(root, 'logo');
if (fs.existsSync(logoSrc)) {
  const logoDst = path.join(staging, 'logo');
  fs.mkdirSync(logoDst, { recursive: true });
  for (const f of fs.readdirSync(logoSrc)) {
    if (f.toLowerCase().endsWith('.cdr')) continue;
    fs.copyFileSync(path.join(logoSrc, f), path.join(logoDst, f));
  }
}

if (fs.existsSync(path.join(root, 'README.md'))) {
  fs.copyFileSync(path.join(root, 'README.md'), path.join(staging, 'README.md'));
}
const deployReadme = path.join(root, 'LEIA-ME-DEPLOY.txt');
if (fs.existsSync(deployReadme)) {
  fs.copyFileSync(deployReadme, path.join(staging, 'LEIA-ME-DEPLOY.txt'));
}

// Manifest (sobre staging)
const count = (function walk(dir) {
  let n = 0;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) n += walk(p);
    else n++;
  }
  return n;
})(staging);

const bytes = (function size(dir) {
  let t = 0;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) t += size(p);
    else t += fs.statSync(p).size;
  }
  return t;
})(staging);

fs.writeFileSync(
  path.join(staging, 'BUILD.txt'),
  `ÂMINA build gerado em ${new Date().toISOString()}\nArquivos: ${count}\nTamanho: ${(bytes / 1024 / 1024).toFixed(2)} MB\n\nSenha MySQL: guarde em api/config.local.php no projeto (gitignored). O build copia para dist/api/. Se só existia na dist anterior, o script copia para api/ antes de gerar.\nLeia LEIA-ME-DEPLOY.txt\n`,
  'utf8'
);

// Copiar staging → dist (evita EBUSY ao apagar dist/ no Windows)
fs.mkdirSync(dist, { recursive: true });
fs.cpSync(staging, dist, { recursive: true, force: true });
rmrf(staging);

console.log('Build OK:', dist);
console.log('Arquivos:', count, '|', (bytes / 1024 / 1024).toFixed(2), 'MB');
if (fs.existsSync(path.join(root, 'api', 'config.local.php'))) {
  console.log('Nota: api/config.local.php foi copiado para dist/api/ (credenciais no pacote).');
} else {
  console.log('Nota: crie api/config.local.php ou edite dist/api/config.local.php no servidor (senha MySQL).');
}
