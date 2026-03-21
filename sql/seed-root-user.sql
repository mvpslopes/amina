-- Execute no phpMyAdmin se ainda não existir o usuário root (login do painel).
-- Se já existir, o MySQL ignora silenciosamente (INSERT IGNORE).

INSERT IGNORE INTO users (username, password_hash, role, created_by)
VALUES (
  'marcus.lopes',
  '$2a$12$4/Ai0LtvaM55LBOdcrTdse93NiXmWkYjveK62pngWajI97h47SEiC',
  'root',
  NULL
);
