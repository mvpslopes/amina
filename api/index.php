<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

cors_headers();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
if ($base !== '' && strpos($uri, $base) === 0) {
    $uri = substr($uri, strlen($base)) ?: '/';
}
$path = trim($uri, '/');
$segments = $path === '' ? [] : explode('/', $path);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// --- Auth: login ---
if ($method === 'POST' && ($segments[0] ?? '') === 'auth' && ($segments[1] ?? '') === 'login') {
    $body = json_body();
    $username = trim((string) ($body['username'] ?? ''));
    $password = (string) ($body['password'] ?? '');
    if ($username === '' || $password === '') {
        json_out(400, ['error' => 'Usuário e senha são obrigatórios']);
    }
    $st = $pdo->prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?');
    $st->execute([$username]);
    $user = $st->fetch();
    if (!$user || !password_verify($password, $user['password_hash'])) {
        json_out(401, ['error' => 'Credenciais inválidas']);
    }
    $now = time();
    $token = Jwt::sign([
        'sub' => (int) $user['id'],
        'username' => $user['username'],
        'role' => $user['role'],
        'iat' => $now,
        'exp' => $now + 7 * 24 * 3600,
    ], $CONFIG['jwt_secret']);
    json_out(200, [
        'token' => $token,
        'user' => [
            'id' => (int) $user['id'],
            'username' => $user['username'],
            'role' => $user['role'],
        ],
    ]);
}

// --- Auth: me ---
if ($method === 'GET' && ($segments[0] ?? '') === 'auth' && ($segments[1] ?? '') === 'me') {
    $u = require_auth($CONFIG, $pdo);
    json_out(200, ['user' => $u]);
}

// --- Public ---
if ($method === 'GET' && ($segments[0] ?? '') === 'public' && ($segments[1] ?? '') === 'products') {
    $rows = $pdo->query('SELECT * FROM products ORDER BY created_at DESC')->fetchAll();
    $allPc = $pdo->query('SELECT product_id, collection_id FROM product_collections')->fetchAll();
    $byProduct = [];
    foreach ($allPc as $pc) {
        $byProduct[$pc['product_id']][] = (int) $pc['collection_id'];
    }
    $cols = $pdo->query('SELECT id, name, slug FROM collections')->fetchAll();
    $colMap = [];
    foreach ($cols as $c) {
        $colMap[(int) $c['id']] = $c;
    }
    $out = [];
    foreach ($rows as $p) {
        $p['price'] = isset($p['price']) ? (float) $p['price'] : 0.0;
        $ids = $byProduct[$p['id']] ?? [];
        $collections = [];
        foreach ($ids as $cid) {
            if (isset($colMap[$cid])) {
                $collections[] = $colMap[$cid];
            }
        }
        $p['collections'] = $collections;
        $out[] = $p;
    }
    json_out(200, $out);
}

if ($method === 'GET' && ($segments[0] ?? '') === 'public' && ($segments[1] ?? '') === 'collections') {
    $sql = 'SELECT c.*, (SELECT COUNT(*) FROM product_collections pc WHERE pc.collection_id = c.id) AS product_count
            FROM collections c ORDER BY c.name';
    json_out(200, $pdo->query($sql)->fetchAll());
}

// --- Upload (auth) ---
if ($method === 'POST' && ($segments[0] ?? '') === 'upload') {
    require_auth($CONFIG, $pdo);
    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        json_out(400, ['error' => 'Envie um arquivo de imagem (jpeg, png, webp, gif)']);
    }
    $f = $_FILES['file'];
    $mime = '';
    if (function_exists('mime_content_type')) {
        $mime = (string) mime_content_type($f['tmp_name']);
    } elseif (class_exists('finfo')) {
        $fi = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string) $fi->file($f['tmp_name']);
    }
    if (!preg_match('#^image/(jpeg|png|webp|gif)$#i', $mime)) {
        json_out(400, ['error' => 'Envie um arquivo de imagem (jpeg, png, webp, gif)']);
    }
    $ext = match (strtolower($mime)) {
        'image/jpeg' => '.jpg',
        'image/png' => '.png',
        'image/webp' => '.webp',
        'image/gif' => '.gif',
        default => '.jpg',
    };
    $dir = $CONFIG['upload_dir'] ?? (__DIR__ . '/../uploads');
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        json_out(500, ['error' => 'Não foi possível criar pasta de uploads']);
    }
    $name = bin2hex(random_bytes(8)) . $ext;
    $dest = rtrim($dir, '/\\') . DIRECTORY_SEPARATOR . $name;
    if (!move_uploaded_file($f['tmp_name'], $dest)) {
        json_out(500, ['error' => 'Falha ao salvar arquivo']);
    }
    $public = $CONFIG['upload_public_url'] ?? '/uploads';
    json_out(200, ['url' => rtrim($public, '/') . '/' . $name]);
}

// --- Users (root) ---
if (($segments[0] ?? '') === 'users') {
    $u = require_auth($CONFIG, $pdo);
    require_root($u);

    if ($method === 'GET' && count($segments) === 1) {
        $sql = 'SELECT u.id, u.username, u.role, u.created_at, c.username AS created_by_username
                FROM users u LEFT JOIN users c ON c.id = u.created_by ORDER BY u.id';
        json_out(200, $pdo->query($sql)->fetchAll());
    }

    if ($method === 'POST' && count($segments) === 1) {
        $body = json_body();
        $uname = trim((string) ($body['username'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        $role = ($body['role'] ?? '') === 'admin' ? 'admin' : null;
        if ($uname === '' || $password === '') {
            json_out(400, ['error' => 'Usuário e senha são obrigatórios']);
        }
        if (!$role) {
            json_out(400, ['error' => 'Role inválida. Use "admin".']);
        }
        if (strlen($uname) < 2) {
            json_out(400, ['error' => 'Nome de usuário muito curto']);
        }
        if (strlen($password) < 8) {
            json_out(400, ['error' => 'Senha deve ter no mínimo 8 caracteres']);
        }
        $st = $pdo->prepare('SELECT id FROM users WHERE username = ?');
        $st->execute([$uname]);
        if ($st->fetch()) {
            json_out(409, ['error' => 'Usuário já existe']);
        }
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
        $st = $pdo->prepare('INSERT INTO users (username, password_hash, role, created_by) VALUES (?, ?, ?, ?)');
        $st->execute([$uname, $hash, $role, $u['id']]);
        json_out(201, ['id' => (int) $pdo->lastInsertId(), 'username' => $uname, 'role' => $role]);
    }

    if ($method === 'DELETE' && isset($segments[1]) && ctype_digit($segments[1])) {
        $id = (int) $segments[1];
        $st = $pdo->prepare('SELECT id, role FROM users WHERE id = ?');
        $st->execute([$id]);
        $target = $st->fetch();
        if (!$target) {
            json_out(404, ['error' => 'Usuário não encontrado']);
        }
        if ($target['role'] === 'root') {
            json_out(403, ['error' => 'Não é permitido excluir usuário root']);
        }
        if ((int) $target['id'] === $u['id']) {
            json_out(403, ['error' => 'Não é permitido excluir a si mesmo']);
        }
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
        json_out(200, ['ok' => true]);
    }
}

// --- Products & Collections: require auth ---
$needAuth = in_array($segments[0] ?? '', ['products', 'collections'], true);
if ($needAuth) {
    $authUser = require_auth($CONFIG, $pdo);
}

// --- Collections ---
if (($segments[0] ?? '') === 'collections') {
    if ($method === 'GET' && count($segments) === 1) {
        $sql = 'SELECT c.*, (SELECT COUNT(*) FROM product_collections pc WHERE pc.collection_id = c.id) AS product_count
                FROM collections c ORDER BY c.name';
        json_out(200, $pdo->query($sql)->fetchAll());
    }
    if ($method === 'GET' && isset($segments[1]) && ctype_digit($segments[1])) {
        $id = (int) $segments[1];
        $st = $pdo->prepare('SELECT * FROM collections WHERE id = ?');
        $st->execute([$id]);
        $row = $st->fetch();
        if (!$row) {
            json_out(404, ['error' => 'Coleção não encontrada']);
        }
        $st = $pdo->prepare(
            'SELECT p.id, p.name, p.slug, p.price, p.image_url FROM products p
             INNER JOIN product_collections pc ON pc.product_id = p.id WHERE pc.collection_id = ? ORDER BY p.name'
        );
        $st->execute([$id]);
        $row['products'] = $st->fetchAll();
        json_out(200, $row);
    }
    if ($method === 'POST' && count($segments) === 1) {
        $body = json_body();
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            json_out(400, ['error' => 'Nome é obrigatório']);
        }
        $slug = Slug::unique($pdo, 'collections', $name);
        $now = now_sql();
        $st = $pdo->prepare(
            'INSERT INTO collections (name, slug, description, image_url, created_at, updated_at) VALUES (?,?,?,?,?,?)'
        );
        $st->execute([
            $name,
            $slug,
            $body['description'] ?? null,
            $body['image_url'] ?? null,
            $now,
            $now,
        ]);
        $newId = (int) $pdo->lastInsertId();
        $st = $pdo->prepare('SELECT * FROM collections WHERE id = ?');
        $st->execute([$newId]);
        json_out(201, $st->fetch());
    }
    if ($method === 'PUT' && isset($segments[1]) && ctype_digit($segments[1])) {
        $id = (int) $segments[1];
        $st = $pdo->prepare('SELECT * FROM collections WHERE id = ?');
        $st->execute([$id]);
        $existing = $st->fetch();
        if (!$existing) {
            json_out(404, ['error' => 'Coleção não encontrada']);
        }
        $body = json_body();
        $newName = array_key_exists('name', $body) ? trim((string) $body['name']) : $existing['name'];
        if ($newName === '') {
            json_out(400, ['error' => 'Nome é obrigatório']);
        }
        $slug = $existing['slug'];
        if (array_key_exists('name', $body) && $newName !== $existing['name']) {
            $slug = Slug::unique($pdo, 'collections', $newName, $id);
        }
        $desc = array_key_exists('description', $body)
            ? ($body['description'] === null ? null : (string) $body['description'])
            : $existing['description'];
        $img = array_key_exists('image_url', $body)
            ? ($body['image_url'] === null ? null : (string) $body['image_url'])
            : $existing['image_url'];
        $st = $pdo->prepare(
            'UPDATE collections SET name=?, slug=?, description=?, image_url=?, updated_at=? WHERE id=?'
        );
        $st->execute([$newName, $slug, $desc, $img, now_sql(), $id]);
        $st = $pdo->prepare('SELECT * FROM collections WHERE id = ?');
        $st->execute([$id]);
        json_out(200, $st->fetch());
    }
    if ($method === 'DELETE' && isset($segments[1]) && ctype_digit($segments[1])) {
        $id = (int) $segments[1];
        $st = $pdo->prepare('SELECT id FROM collections WHERE id = ?');
        $st->execute([$id]);
        if (!$st->fetch()) {
            json_out(404, ['error' => 'Coleção não encontrada']);
        }
        $pdo->prepare('DELETE FROM collections WHERE id = ?')->execute([$id]);
        json_out(200, ['ok' => true]);
    }
}

// --- Products (helpers) ---
function attach_collections_pdo(PDO $pdo, array $productRows): array
{
    $allPc = $pdo->query('SELECT product_id, collection_id FROM product_collections')->fetchAll();
    $byProduct = [];
    foreach ($allPc as $pc) {
        $byProduct[$pc['product_id']][] = (int) $pc['collection_id'];
    }
    $cols = $pdo->query('SELECT id, name, slug FROM collections')->fetchAll();
    $colMap = [];
    foreach ($cols as $c) {
        $colMap[(int) $c['id']] = $c;
    }
    $out = [];
    foreach ($productRows as $p) {
        $p['price'] = isset($p['price']) ? (float) $p['price'] : 0.0;
        $ids = $byProduct[$p['id']] ?? [];
        $collections = [];
        foreach ($ids as $cid) {
            if (isset($colMap[$cid])) {
                $collections[] = $colMap[$cid];
            }
        }
        $p['collection_ids'] = $ids;
        $p['collections'] = $collections;
        $out[] = $p;
    }
    return $out;
}

function set_product_collections(PDO $pdo, int $productId, ?array $collectionIds): void
{
    $pdo->prepare('DELETE FROM product_collections WHERE product_id = ?')->execute([$productId]);
    if (!is_array($collectionIds) || $collectionIds === []) {
        return;
    }
    $ins = $pdo->prepare('INSERT INTO product_collections (product_id, collection_id) VALUES (?, ?)');
    $chk = $pdo->prepare('SELECT id FROM collections WHERE id = ?');
    foreach ($collectionIds as $raw) {
        $cid = (int) $raw;
        if ($cid <= 0) {
            continue;
        }
        $chk->execute([$cid]);
        if (!$chk->fetch()) {
            continue;
        }
        try {
            $ins->execute([$productId, $cid]);
        } catch (PDOException) {
        }
    }
}

if (($segments[0] ?? '') === 'products') {
    if ($method === 'GET' && count($segments) === 1) {
        $rows = $pdo->query('SELECT * FROM products ORDER BY created_at DESC')->fetchAll();
        json_out(200, attach_collections_pdo($pdo, $rows));
    }
    if ($method === 'GET' && isset($segments[1]) && ctype_digit($segments[1])) {
        $id = (int) $segments[1];
        $st = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $st->execute([$id]);
        $row = $st->fetch();
        if (!$row) {
            json_out(404, ['error' => 'Produto não encontrado']);
        }
        $out = attach_collections_pdo($pdo, [$row]);
        json_out(200, $out[0]);
    }
    if ($method === 'POST' && count($segments) === 1) {
        $body = json_body();
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            json_out(400, ['error' => 'Nome é obrigatório']);
        }
        $price = (float) ($body['price'] ?? -1);
        if ($price < 0 || !is_finite($price)) {
            json_out(400, ['error' => 'Preço inválido']);
        }
        $slug = Slug::unique($pdo, 'products', $name);
        $now = now_sql();
        $st = $pdo->prepare(
            'INSERT INTO products (name, slug, description, price, image_url, category, badge, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?)'
        );
        $st->execute([
            $name,
            $slug,
            $body['description'] ?? null,
            $price,
            $body['image_url'] ?? null,
            $body['category'] ?? null,
            $body['badge'] ?? null,
            $now,
            $now,
        ]);
        $newId = (int) $pdo->lastInsertId();
        set_product_collections($pdo, $newId, $body['collection_ids'] ?? null);
        $st = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $st->execute([$newId]);
        $out = attach_collections_pdo($pdo, [$st->fetch()]);
        json_out(201, $out[0]);
    }
    if ($method === 'PUT' && isset($segments[1]) && ctype_digit($segments[1])) {
        $id = (int) $segments[1];
        $st = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $st->execute([$id]);
        $existing = $st->fetch();
        if (!$existing) {
            json_out(404, ['error' => 'Produto não encontrado']);
        }
        $body = json_body();
        $name = array_key_exists('name', $body) ? trim((string) $body['name']) : $existing['name'];
        $slug = $existing['slug'];
        if (array_key_exists('name', $body) && $name !== '' && $name !== $existing['name']) {
            $slug = Slug::unique($pdo, 'products', $name, $id);
        }
        $price = array_key_exists('price', $body) ? (float) $body['price'] : (float) $existing['price'];
        if ($price < 0 || !is_finite($price)) {
            json_out(400, ['error' => 'Preço inválido']);
        }
        $desc = array_key_exists('description', $body)
            ? ($body['description'] === null ? null : (string) $body['description'])
            : $existing['description'];
        $img = array_key_exists('image_url', $body)
            ? ($body['image_url'] === null ? null : (string) $body['image_url'])
            : $existing['image_url'];
        $cat = array_key_exists('category', $body)
            ? ($body['category'] === null ? null : (string) $body['category'])
            : $existing['category'];
        $badge = array_key_exists('badge', $body)
            ? ($body['badge'] === null || $body['badge'] === '' ? null : (string) $body['badge'])
            : ($existing['badge'] ?? null);
        $st = $pdo->prepare(
            'UPDATE products SET name=?, slug=?, description=?, price=?, image_url=?, category=?, badge=?, updated_at=? WHERE id=?'
        );
        $st->execute([$name ?: $existing['name'], $slug, $desc, $price, $img, $cat, $badge, now_sql(), $id]);
        if (array_key_exists('collection_ids', $body)) {
            set_product_collections($pdo, $id, is_array($body['collection_ids']) ? $body['collection_ids'] : []);
        }
        $st = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $st->execute([$id]);
        $out = attach_collections_pdo($pdo, [$st->fetch()]);
        json_out(200, $out[0]);
    }
    if ($method === 'DELETE' && isset($segments[1]) && ctype_digit($segments[1])) {
        $id = (int) $segments[1];
        $st = $pdo->prepare('SELECT id FROM products WHERE id = ?');
        $st->execute([$id]);
        if (!$st->fetch()) {
            json_out(404, ['error' => 'Produto não encontrado']);
        }
        $pdo->prepare('DELETE FROM products WHERE id = ?')->execute([$id]);
        json_out(200, ['ok' => true]);
    }
}

json_out(404, ['error' => 'Rota não encontrada']);
