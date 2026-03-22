-- Galeria de fotos por produto (executar uma vez em bases MySQL já existentes)
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS product_images (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  image_url VARCHAR(2048) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  KEY idx_pi_product (product_id),
  CONSTRAINT fk_pi_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
