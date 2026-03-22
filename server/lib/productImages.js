'use strict';

const db = require('../db');

/**
 * Anexa `images: string[]` a cada produto (URLs ordenadas).
 * Se não houver linhas em product_images, usa `image_url` como único item.
 * @param {Array<Record<string, unknown>>} productRows
 */
async function attachProductImages(productRows) {
  if (!productRows || productRows.length === 0) return productRows;
  const ids = productRows.map((p) => p.id).filter((id) => id != null);
  if (ids.length === 0) return productRows;

  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT product_id, image_url FROM product_images WHERE product_id IN (${placeholders}) ORDER BY product_id, sort_order ASC, id ASC`,
    ids
  );
  const byPid = {};
  for (const r of rows) {
    const pid = r.product_id;
    if (!byPid[pid]) byPid[pid] = [];
    byPid[pid].push(r.image_url);
  }

  return productRows.map((p) => {
    const fromTable = byPid[p.id] || [];
    const filtered = fromTable.filter(Boolean);
    const max = 5;
    const images =
      filtered.length > 0
        ? filtered.slice(0, max)
        : p.image_url
          ? [String(p.image_url)]
          : [];
    return { ...p, images };
  });
}

/**
 * Substitui todas as imagens do produto.
 * @param {number} productId
 * @param {unknown} imageUrls
 */
const MAX_PRODUCT_IMAGES = 5;

async function setProductImages(productId, imageUrls) {
  await db.run('DELETE FROM product_images WHERE product_id = ?', [productId]);
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return;
  const list = imageUrls
    .map((u) => String(u || '').trim())
    .filter(Boolean)
    .slice(0, MAX_PRODUCT_IMAGES);
  let order = 0;
  for (const url of list) {
    await db.run(
      'INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)',
      [productId, url, order++]
    );
  }
}

module.exports = {
  attachProductImages,
  setProductImages,
};
