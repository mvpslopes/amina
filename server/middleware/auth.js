'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'amina-dev-secret-change-in-production';

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Token não informado' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function requireRoot(req, res, next) {
  if (!req.user || req.user.role !== 'root') {
    return res.status(403).json({ error: 'Apenas Root pode realizar esta ação' });
  }
  next();
}

/** Root ou Administrador — pode criar/editar/apagar produtos, coleções e upload. */
function requireEditor(req, res, next) {
  const r = req.user && req.user.role;
  if (r === 'root' || r === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Sem permissão para alterar dados (perfil somente leitura).' });
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = {
  authMiddleware,
  requireRoot,
  requireEditor,
  signToken,
  JWT_SECRET,
};
