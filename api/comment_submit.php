<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(405, ['ok' => false, 'error' => 'Método não permitido']);
}

$author = trim((string) ($_POST['author_name'] ?? ''));
$rating = (int) ($_POST['rating'] ?? 0);
$body = trim((string) ($_POST['body'] ?? ''));

if ($author === '' || strlen($author) > 120) {
    json_out(400, ['ok' => false, 'error' => 'Nome inválido (máx. 120 caracteres)']);
}
if ($rating < 1 || $rating > 5) {
    json_out(400, ['ok' => false, 'error' => 'Avaliação deve ser de 1 a 5 estrelas']);
}
if ($body === '' || strlen($body) > 5000) {
    json_out(400, ['ok' => false, 'error' => 'Comentário obrigatório (máx. 5000 caracteres)']);
}

// Configuração de upload
$uploadDir = __DIR__ . '/../uploads/avatars';
$maxBytes = 2 * 1024 * 1024; // 2MB
$photoPath = null;

if (!empty($_FILES['photo']) && is_uploaded_file($_FILES['photo']['tmp_name'])) {
    $f = $_FILES['photo'];
    if ($f['error'] !== UPLOAD_ERR_OK) {
        json_out(400, ['ok' => false, 'error' => 'Erro no envio da foto']);
    }
    if ($f['size'] > $maxBytes) {
        json_out(400, ['ok' => false, 'error' => 'Foto muito grande (máx. 2 MB)']);
    }
    $info = @getimagesize($f['tmp_name']);
    $allowedTypes = [IMAGETYPE_JPEG, IMAGETYPE_PNG];
    if (defined('IMAGETYPE_WEBP')) {
        $allowedTypes[] = IMAGETYPE_WEBP;
    }
    if (!$info || !in_array($info[2], $allowedTypes, true)) {
        json_out(400, ['ok' => false, 'error' => 'Use JPG, PNG ou WebP']);
    }
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    $ext = match ($info[2]) {
        IMAGETYPE_JPEG => 'jpg',
        IMAGETYPE_PNG => 'png',
        IMAGETYPE_WEBP => 'webp',
        default => 'jpg',
    };
    $name = bin2hex(random_bytes(16)) . '.' . $ext;
    $dest = $uploadDir . '/' . $name;
    if (!move_uploaded_file($f['tmp_name'], $dest)) {
        json_out(500, ['ok' => false, 'error' => 'Falha ao salvar foto']);
    }
    // Caminho relativo para o banco
    $photoPath = 'uploads/avatars/' . $name;
}

// Garante que a tabela existe
try {
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS site_comments (
          `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          `author_name` VARCHAR(120) NOT NULL,
          `author_photo_path` VARCHAR(512) DEFAULT NULL,
          `rating` TINYINT UNSIGNED NOT NULL,
          `body` TEXT NOT NULL,
          `status` ENUM(\'pending\',\'approved\',\'rejected\') NOT NULL DEFAULT \'pending\',
          `moderated_by_user_id` INT UNSIGNED DEFAULT NULL,
          `moderated_at` DATETIME DEFAULT NULL,
          `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          KEY `idx_status_created` (`status`,`created_at`),
          CONSTRAINT `fk_comment_moderator` FOREIGN KEY (`moderated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
} catch (PDOException $e) {
    // Tabela pode já existir
}

$st = $pdo->prepare(
    'INSERT INTO site_comments (author_name, author_photo_path, rating, body, status, created_at)
     VALUES (?, ?, ?, ?, \'pending\', NOW())'
);
$st->execute([$author, $photoPath, $rating, $body]);

json_out(200, ['ok' => true, 'message' => 'Comentário enviado com sucesso! Aguardando moderação.']);
