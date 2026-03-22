'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authMiddleware, requireRoot } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);
router.use(requireRoot);

router.get('/', async (_req, res) => {
  const rows = await db.all(
    `SELECT u.id, u.username, u.role, u.created_at,
            c.username AS created_by_username
     FROM users u
     LEFT JOIN users c ON c.id = u.created_by
     ORDER BY u.id`
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }
  const raw = String(role || 'admin').toLowerCase();
  if (raw === 'root') {
    return res.status(400).json({ error: 'Não é permitido criar usuário root por aqui.' });
  }
  const r = raw === 'admin' || raw === 'operador' ? raw : null;
  if (!r) {
    return res.status(400).json({ error: 'Perfil inválido. Use "admin" ou "operador".' });
  }

  const uname = String(username).trim();
  if (uname.length < 2) {
    return res.status(400).json({ error: 'Nome de usuário muito curto' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres' });
  }

  const exists = await db.get('SELECT id FROM users WHERE username = ?', [uname]);
  if (exists) {
    return res.status(409).json({ error: 'Usuário já existe' });
  }

  const hash = bcrypt.hashSync(password, 12);
  const info = await db.run(
    `INSERT INTO users (username, password_hash, role, created_by)
     VALUES (?, ?, ?, ?)`,
    [uname, hash, r, req.user.id]
  );

  res.status(201).json({
    id: info.insertId,
    username: uname,
    role: r,
  });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const target = await db.get('SELECT id, role FROM users WHERE id = ?', [id]);
  if (!target) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  if (target.role === 'root') {
    return res.status(403).json({ error: 'Não é permitido excluir usuário root' });
  }
  if (target.id === req.user.id) {
    return res.status(403).json({ error: 'Não é permitido excluir a si mesmo' });
  }

  await db.run('DELETE FROM users WHERE id = ?', [id]);
  res.json({ ok: true });
});

module.exports = router;
