'use strict';

const express = require('express');
const db = require('../db');
const { authMiddleware, requireEditor } = require('../middleware/auth');
const { uniqueSlug } = require('../utils/slug');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (_req, res) => {
  const rows = await db.all(
    `SELECT c.*,
      (SELECT COUNT(*) FROM product_collections pc WHERE pc.collection_id = c.id) AS product_count
     FROM collections c
     ORDER BY c.name`
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const row = await db.get('SELECT * FROM collections WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'Coleção não encontrada' });
  const products = await db.all(
    `SELECT p.id, p.name, p.slug, p.price, p.image_url
     FROM products p
     INNER JOIN product_collections pc ON pc.product_id = p.id
     WHERE pc.collection_id = ?
     ORDER BY p.name`,
    [id]
  );
  res.json({ ...row, products });
});

router.post('/', requireEditor, async (req, res) => {
  const { name, description, image_url } = req.body || {};
  if (!name || String(name).trim().length === 0) {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }
  const slug = await uniqueSlug('collections', name);
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const info = await db.run(
    `INSERT INTO collections (name, slug, description, image_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      String(name).trim(),
      slug,
      description != null ? String(description) : null,
      image_url != null ? String(image_url) : null,
      now,
      now,
    ]
  );

  const row = await db.get('SELECT * FROM collections WHERE id = ?', [info.insertId]);
  res.status(201).json(row);
});

router.put('/:id', requireEditor, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get('SELECT * FROM collections WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Coleção não encontrada' });

  const { name, description, image_url } = req.body || {};
  const newName = name !== undefined ? String(name).trim() : existing.name;
  if (!newName) {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }
  let slug = existing.slug;
  if (name !== undefined && newName !== existing.name) {
    slug = await uniqueSlug('collections', newName, id);
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  await db.run(
    `UPDATE collections SET
      name = ?,
      slug = ?,
      description = ?,
      image_url = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      newName,
      slug,
      description !== undefined ? (description == null ? null : String(description)) : existing.description,
      image_url !== undefined ? (image_url == null ? null : String(image_url)) : existing.image_url,
      now,
      id,
    ]
  );

  const row = await db.get('SELECT * FROM collections WHERE id = ?', [id]);
  res.json(row);
});

router.delete('/:id', requireEditor, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get('SELECT id FROM collections WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Coleção não encontrada' });
  await db.run('DELETE FROM collections WHERE id = ?', [id]);
  res.json({ ok: true });
});

module.exports = router;
