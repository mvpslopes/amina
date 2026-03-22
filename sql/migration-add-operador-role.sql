-- Adiciona perfil "operador" (somente leitura no painel) à tabela users.
-- Execute no phpMyAdmin com o banco já selecionado (uma vez).

ALTER TABLE users
  MODIFY COLUMN role ENUM('root', 'admin', 'operador') NOT NULL;
