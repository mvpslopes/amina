'use strict';

const express = require('express');
const db = require('../db');
const { attachProductImages, setProductImages } = require('../lib/productImages');
const { authMiddleware, requireEditor } = require('../middleware/auth');
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

async function attachCollectionsAndImages(productRows) {
  return attachProductImages(await attachCollections(productRows));
}

router.get('/', async (_req, res) => {
  const rows = await db.all('SELECT * FROM products ORDER BY created_at DESC');
  res.json(await attachCollectionsAndImages(rows));
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const row = await db.get('SELECT * FROM products WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'Produto não encontrado' });
  const [out] = await attachCollectionsAndImages([row]);
  res.json(out);
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

router.post('/', requireEditor, async (req, res) => {
  const { name, description, price, image_url, category, collection_ids, images } = req.body || {};
  if (!name || String(name).trim().length === 0) {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) {
    return res.status(400).json({ error: 'Preço inválido' });
  }

  const slug = await uniqueSlug('products', name);
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  let mainImage = image_url != null && String(image_url).trim() ? String(image_url) : null;
  if (Array.isArray(images) && images.length > 0) {
    const first = images.map((s) => String(s || '').trim()).find(Boolean);
    if (first) mainImage = first;
  }

  const info = await db.run(
    `INSERT INTO products (name, slug, description, price, image_url, category, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(name).trim(),
      slug,
      description != null ? String(description) : null,
      p,
      mainImage,
      category != null ? String(category) : null,
      now,
      now,
    ]
  );

  const id = Number(info.insertId);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(500).json({ error: 'Falha ao obter ID do produto criado' });
  }
  await setProductCollections(id, collection_ids);

  try {
    if (Array.isArray(images) && images.length > 0) {
      await setProductImages(id, images);
    } else if (mainImage) {
      await setProductImages(id, [mainImage]);
    }
  } catch (e) {
    console.error('[products] POST setProductImages', e);
    return res.status(500).json({
      error:
        'Não foi possível guardar as fotos da galeria. No MySQL, execute o script sql/migration-product-images.sql (tabela product_images).',
    });
  }

  const row = await db.get('SELECT * FROM products WHERE id = ?', [id]);
  const [out] = await attachCollectionsAndImages([row]);
  res.status(201).json(out);
});

router.put('/:id', requireEditor, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get('SELECT * FROM products WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Produto não encontrado' });

  const body = req.body || {};
  const { name, description, price, image_url, category, collection_ids, images } = body;

  let slug = existing.slug;
  if (name != null && String(name).trim()) {
    slug = await uniqueSlug('products', name, id);
  }

  const p = price !== undefined ? Number(price) : Number(existing.price);
  if (!Number.isFinite(p) || p < 0) {
    return res.status(400).json({ error: 'Preço inválido' });
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  let nextImageUrl =
    image_url !== undefined ? (image_url == null ? null : String(image_url)) : existing.image_url;

  try {
    if (Object.prototype.hasOwnProperty.call(body, 'images')) {
      const arr = Array.isArray(images) ? images : [];
      await setProductImages(id, arr);
      const first = arr.map((s) => String(s || '').trim()).find(Boolean) || null;
      nextImageUrl = first;
    } else if (image_url !== undefined) {
      await setProductImages(id, image_url ? [String(image_url)] : []);
      nextImageUrl = image_url == null ? null : String(image_url);
    }
  } catch (e) {
    console.error('[products] PUT setProductImages', e);
    return res.status(500).json({
      error:
        'Não foi possível guardar as fotos da galeria. No MySQL, execute o script sql/migration-product-images.sql (tabela product_images).',
    });
  }

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
      nextImageUrl,
      category !== undefined ? (category == null ? null : String(category)) : existing.category,
      now,
      id,
    ]
  );

  if (collection_ids !== undefined) {
    await setProductCollections(id, collection_ids);
  }

  const row = await db.get('SELECT * FROM products WHERE id = ?', [id]);
  const [out] = await attachCollectionsAndImages([row]);
  res.json(out);
});

router.delete('/:id', requireEditor, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get('SELECT id FROM products WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Produto não encontrado' });
  await db.run('DELETE FROM products WHERE id = ?', [id]);
  res.json({ ok: true });
});

module.exports = router;
