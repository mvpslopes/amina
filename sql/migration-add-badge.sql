-- Migração: adiciona coluna badge em products
-- Execute se o banco já foi criado sem essa coluna
ALTER TABLE products ADD COLUMN IF NOT EXISTS badge VARCHAR(50) NULL AFTER category;
