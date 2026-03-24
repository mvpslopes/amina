'use strict';

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

const db = require('./db');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const productsRoutes = require('./routes/products');
const collectionsRoutes = require('./routes/collections');
const analyticsRoutes = require('./routes/analytics');
const { attachProductImages } = require('./lib/productImages');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const rootDir = path.join(__dirname, '..');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/collections', collectionsRoutes);
app.use('/api/analytics', analyticsRoutes);

async function attachCollectionsToProducts(rows) {
  const allPc = await db.all('SELECT product_id, collection_id FROM product_collections');
  const byProduct = {};
  for (const pc of allPc) {
    if (!byProduct[pc.product_id]) byProduct[pc.product_id] = [];
    byProduct[pc.product_id].push(pc.collection_id);
  }
  const colRows = await db.all('SELECT id, name, slug FROM collections');
  const colMap = Object.fromEntries(colRows.map((c) => [c.id, c]));
  return rows.map((p) => {
    const row = { ...p };
    if (row.price != null && typeof row.price === 'string') {
      row.price = parseFloat(row.price);
    }
    const ids = byProduct[p.id] || [];
    const collections = ids.map((cid) => colMap[cid]).filter(Boolean);
    return { ...row, collections };
  });
}

app.get('/api/public/products', async (_req, res, next) => {
  try {
    const rows = await db.all('SELECT * FROM products ORDER BY created_at DESC');
    const withCols = await attachCollectionsToProducts(rows);
    res.json(await attachProductImages(withCols));
  } catch (e) {
    next(e);
  }
});

app.get('/api/public/products/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const row = await db.get('SELECT * FROM products WHERE id = ?', [id]);
    if (!row) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    const [one] = await attachCollectionsToProducts([row]);
    const [out] = await attachProductImages([one]);
    res.json(out);
  } catch (e) {
    next(e);
  }
});

app.get('/api/public/collections', async (_req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT c.*,
        (SELECT COUNT(*) FROM product_collections pc WHERE pc.collection_id = c.id) AS product_count
       FROM collections c ORDER BY c.name`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

const uploadsDir = path.join(rootDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
    cb(null, safe);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype);
    cb(null, ok);
  },
});

const { authMiddleware, requireEditor } = require('./middleware/auth');
app.post('/api/upload', authMiddleware, requireEditor, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Envie um arquivo de imagem (jpeg, png, webp, gif)' });
  }
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

app.use('/uploads', express.static(uploadsDir));

app.use('/css', express.static(path.join(rootDir, 'css')));
app.use('/js', express.static(path.join(rootDir, 'js')));
app.use('/assets', express.static(path.join(rootDir, 'assets')));
app.use('/logo', express.static(path.join(rootDir, 'logo')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.get('/admin', (_req, res) => {
  res.redirect(302, '/admin/index.html');
});
app.get('/admin/', (_req, res) => {
  res.redirect(302, '/admin/index.html');
});

app.use('/admin', express.static(path.join(rootDir, 'admin')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

async function start() {
  await db.init();
  app.listen(PORT, () => {
    console.log(`ÂMINA servidor em http://localhost:${PORT}`);
    console.log(`Painel admin: http://localhost:${PORT}/admin/`);
    console.log(`Driver DB: ${db.driver}`);
  });
}

start().catch((err) => {
  console.error('Falha ao iniciar:', err);
  process.exit(1);
});
