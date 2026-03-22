'use strict';

/**
 * Camada unificada: MySQL (produção / Hostinger) ou SQLite (desenvolvimento local).
 * Defina MYSQL_HOST + MYSQL_USER + MYSQL_PASSWORD + MYSQL_DATABASE no .env para usar MySQL.
 */

const path = require('path');
const fs = require('fs');

let pool = null;
let sqliteDb = null;
let driver = 'sqlite';

function useMysql() {
  return !!(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
}

/** @type {import('mysql2/promise').Pool} */
function getPool() {
  return pool;
}

async function get(sql, params = []) {
  if (pool) {
    const [rows] = await pool.execute(sql, params);
    return rows[0] || null;
  }
  const stmt = sqliteDb.prepare(sql);
  return params.length ? stmt.get(...params) : stmt.get();
}

async function all(sql, params = []) {
  if (pool) {
    const [rows] = await pool.execute(sql, params);
    return rows;
  }
  const stmt = sqliteDb.prepare(sql);
  return params.length ? stmt.all(...params) : stmt.all();
}

async function run(sql, params = []) {
  if (pool) {
    const [result] = await pool.execute(sql, params);
    return {
      insertId: result.insertId,
      affectedRows: result.affectedRows,
    };
  }
  const stmt = sqliteDb.prepare(sql);
  const r = params.length ? stmt.run(...params) : stmt.run();
  return { insertId: r.lastInsertRowid, affectedRows: r.changes };
}

function openSqlite() {
  const Database = require('better-sqlite3');
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'amina.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function migrateSqlite() {
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('root', 'admin', 'operador')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      image_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      price REAL NOT NULL CHECK(price >= 0),
      image_url TEXT,
      category TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_collections (
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      PRIMARY KEY (product_id, collection_id)
    );

    CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
    CREATE INDEX IF NOT EXISTS idx_collections_slug ON collections(slug);
  `);
}

async function migrateMysql() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(190) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('root', 'admin', 'operador') NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INT UNSIGNED NULL,
      UNIQUE KEY uk_users_username (username),
      KEY idx_users_created_by (created_by),
      CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS collections (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(190) NOT NULL,
      description TEXT NULL,
      image_url VARCHAR(2048) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_collections_slug (slug),
      KEY idx_collections_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS products (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(190) NOT NULL,
      description TEXT NULL,
      price DECIMAL(12,2) NOT NULL,
      image_url VARCHAR(2048) NULL,
      category VARCHAR(120) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_products_slug (slug),
      KEY idx_products_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS product_collections (
      product_id INT UNSIGNED NOT NULL,
      collection_id INT UNSIGNED NOT NULL,
      PRIMARY KEY (product_id, collection_id),
      CONSTRAINT fk_pc_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
      CONSTRAINT fk_pc_collection FOREIGN KEY (collection_id) REFERENCES collections (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];

  for (const sql of stmts) {
    await pool.execute(sql);
  }
  try {
    await pool.execute(
      "ALTER TABLE users MODIFY COLUMN role ENUM('root','admin','operador') NOT NULL"
    );
  } catch {
    /* já migrado ou ambiente sem permissão */
  }
}

const ROOT_USERNAME = 'marcus.lopes';
const ROOT_PASSWORD_HASH =
  process.env.ROOT_PASSWORD_HASH ||
  '$2a$12$4/Ai0LtvaM55LBOdcrTdse93NiXmWkYjveK62pngWajI97h47SEiC';

async function seedRoot() {
  const row = await get('SELECT id FROM users WHERE username = ?', [ROOT_USERNAME]);
  if (row) return;

  await run(
    `INSERT INTO users (username, password_hash, role, created_by)
     VALUES (?, ?, 'root', NULL)`,
    [ROOT_USERNAME, ROOT_PASSWORD_HASH]
  );
}

async function init() {
  if (useMysql()) {
    driver = 'mysql';
    const mysql = require('mysql2/promise');
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
    });
    await migrateMysql();
    await seedRoot();
    console.log('[db] MySQL conectado:', process.env.MYSQL_DATABASE);
  } else {
    driver = 'sqlite';
    sqliteDb = openSqlite();
    migrateSqlite();
    await seedRoot();
    console.log('[db] SQLite local (defina MYSQL_* no .env para usar MySQL)');
  }
}

module.exports = {
  init,
  get,
  all,
  run,
  getPool,
  get driver() {
    return driver;
  },
  /** compat: rotas antigas que faziam db.prepare - não usar */
  _sqlite: () => sqliteDb,
};
