<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_out(405, ['ok' => false, 'error' => 'Método não permitido']);
}

$limit = max(1, min(100, (int) ($_GET['limit'] ?? 4)));
$offset = max(0, (int) ($_GET['offset'] ?? 0));

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
    'SELECT id, author_name, author_photo_path, rating, body, created_at
     FROM site_comments
     WHERE status = \'approved\'
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?'
);
$st->bindValue(1, $limit, PDO::PARAM_INT);
$st->bindValue(2, $offset, PDO::PARAM_INT);
$st->execute();
$rows = $st->fetchAll();

$stc = $pdo->query("SELECT COUNT(*) AS c FROM site_comments WHERE status = 'approved'");
$total = (int) $stc->fetch()['c'];

$tzBr = new DateTimeZone('America/Sao_Paulo');
$list = [];
foreach ($rows as $r) {
    $createdIso = '';
    $raw = $r['created_at'] ?? '';
    if ($raw !== '') {
        try {
            $dt = new DateTimeImmutable((string) $raw, $tzBr);
            $createdIso = $dt->format('c');
        } catch (Throwable $e) {
            $createdIso = (string) $raw;
        }
    }
    $list[] = [
        'id' => (int) $r['id'],
        'author_name' => $r['author_name'],
        'author_photo' => $r['author_photo_path'],
        'rating' => (int) $r['rating'],
        'body' => $r['body'],
        'created_at' => $createdIso,
    ];
}

json_out(200, ['ok' => true, 'comments' => $list, 'total' => $total]);
