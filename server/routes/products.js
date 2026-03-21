'use strict';

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { uniqueSlug } = require('../utils/slug');

const router = express.Router();
router.use(authMiddleware);

async function attachCollections(productRows) {
  const allPc = await db.all('SELECT product_id, collection_id FROM product_collections');
  const byProduct = {};
  for (const pc of allPc) {
    if (!byProduct[pc.product_id]) byProduct[pc.product_id] = [];
    byProduct[pc.product_id].push(pc.collection_id);
  }
  const colRows = await db.all('SELECT id, name, slug FROM collections');
  const colMap = Object.fromEntries(colRows.map((c) => [c.id, c]));

  return productRows.map((p) => {
    const row = { ...p };
    if (row.price != null && typeof row.price === 'string') {
      row.price = parseFloat(row.price);
    }
    const ids = byProduct[p.id] || [];
    const collections = ids.map((cid) => colMap[cid]).filter(Boolean);
    return { ...row, collection_ids: ids, collections };
  });
}

router.get('/', async (_req, res) => {
  const rows = await db.all('SELECT * FROM products ORDER BY created_at DESC');
  res.json(await attachCollections(rows));
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const row = await db.get('SELECT * FROM products WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'Produto não encontrado' });
  const [withCols] = await attachCollections([row]);
  res.json(withCols);
});

async function setProductCollections(productId, collectionIds) {
  await db.run('DELETE FROM product_collections WHERE product_id = ?', [productId]);
  if (!Array.isArray(collectionIds) || collectionIds.length === 0) return;
  for (const raw of collectionIds) {
    const cid = Number(raw);
    if (!Number.isFinite(cid)) continue;
    const existsCol = await db.get('SELECT id FROM collections WHERE id = ?', [cid]);
    if (!existsCol) continue;
    try {
      await db.run('INSERT INTO product_collections (product_id, collection_id) VALUES (?, ?)', [
        productId,
        cid,
      ]);
    } catch {
      /* duplicate */
    }
  }
}

router.post('/', async (req, res) => {
  const { name, description, price, image_url, category, collection_ids } = req.body || {};
  if (!name || String(name).trim().length === 0) {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) {
    return res.status(400).json({ error: 'Preço inválido' });
  }

  const slug = await uniqueSlug('products', name);
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const info = await db.run(
    `INSERT INTO products (name, slug, description, price, image_url, category, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(name).trim(),
      slug,
      description != null ? String(description) : null,
      p,
      image_url != null ? String(image_url) : null,
      category != null ? String(category) : null,
      now,
      now,
    ]
  );

  const id = info.insertId;
  await setProductCollections(id, collection_ids);

  const row = await db.get('SELECT * FROM products WHERE id = ?', [id]);
  const [out] = await attachCollections([row]);
  res.status(201).json(out);
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get('SELECT * FROM products WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Produto não encontrado' });

  const { name, description, price, image_url, category, collection_ids } = req.body || {};

  let slug = existing.slug;
  if (name != null && String(name).trim()) {
    slug = await uniqueSlug('products', name, id);
  }

  const p = price !== undefined ? Number(price) : Number(existing.price);
  if (!Number.isFinite(p) || p < 0) {
    return res.status(400).json({ error: 'Preço inválido' });
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  await db.run(
    `UPDATE products SET
      name = ?,
      slug = ?,
      description = ?,
      price = ?,
      image_url = ?,
      category = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      name != null ? String(name).trim() : existing.name,
      slug,
      description !== undefined ? (description == null ? null : String(description)) : existing.description,
      p,
      image_url !== undefined ? (image_url == null ? null : String(image_url)) : existing.image_url,
      category !== undefined ? (category == null ? null : String(category)) : existing.category,
      now,
      id,
    ]
  );

  if (collection_ids !== undefined) {
    await setProductCollections(id, collection_ids);
  }

  const row = await db.get('SELECT * FROM products WHERE id = ?', [id]);
  const [out] = await attachCollections([row]);
  res.json(out);
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get('SELECT id FROM products WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Produto não encontrado' });
  await db.run('DELETE FROM products WHERE id = ?', [id]);
  res.json({ ok: true });
});

module.exports = router;
