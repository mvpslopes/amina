'use strict';

const db = require('../db');

function slugify(text) {
  return (
    String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'item'
  );
}

const TABLES = {
  products: 'products',
  collections: 'collections',
};

async function uniqueSlug(tableKey, base, excludeId = null) {
  const table = TABLES[tableKey];
  if (!table) throw new Error('Tabela inválida para slug');
  let slug = slugify(base);
  let n = 0;
  while (true) {
    const candidate = n ? `${slug}-${n}` : slug;
    const row = await db.get(`SELECT id FROM ${table} WHERE slug = ?`, [candidate]);
    if (!row || row.id === excludeId) return candidate;
    n += 1;
  }
}

module.exports = { slugify, uniqueSlug };
