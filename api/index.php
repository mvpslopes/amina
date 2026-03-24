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

function b64url(string $raw): string
{
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function ga4_access_token(string $clientEmail, string $privateKey): string
{
    if (!function_exists('openssl_sign')) {
        throw new RuntimeException('OpenSSL não disponível no PHP.');
    }
    $iat = time();
    $header = b64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_UNESCAPED_UNICODE));
    $claims = b64url(json_encode([
        'iss' => $clientEmail,
        'scope' => 'https://www.googleapis.com/auth/analytics.readonly',
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => $iat,
        'exp' => $iat + 3600,
    ], JSON_UNESCAPED_UNICODE));
    $unsigned = $header . '.' . $claims;
    $signature = '';
    $ok = openssl_sign($unsigned, $signature, $privateKey, OPENSSL_ALGO_SHA256);
    if (!$ok) {
        throw new RuntimeException('Falha ao assinar JWT para Google OAuth.');
    }
    $jwt = $unsigned . '.' . b64url($signature);

    if (!function_exists('curl_init')) {
        throw new RuntimeException('cURL não disponível no PHP.');
    }
    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_POSTFIELDS => http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $jwt,
        ]),
        CURLOPT_TIMEOUT => 20,
    ]);
    $resp = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($resp === false || $status >= 400) {
        throw new RuntimeException('Falha ao obter token OAuth: ' . ($err ?: ('HTTP ' . $status)));
    }
    $json = json_decode((string) $resp, true);
    $token = is_array($json) ? (string) ($json['access_token'] ?? '') : '';
    if ($token === '') {
        throw new RuntimeException('Google OAuth sem access_token.');
    }
    return $token;
}

function ga4_post_json(string $url, array $payload, string $bearer): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $bearer,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_TIMEOUT => 25,
    ]);
    $resp = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($resp === false || $status >= 400) {
        $detail = '';
        if (is_string($resp) && $resp !== '') {
            $j = json_decode($resp, true);
            if (is_array($j)) {
                $msg = (string) (($j['error']['message'] ?? '') ?: '');
                if ($msg !== '') {
                    $detail = ' - ' . $msg;
                }
            }
        }
        throw new RuntimeException('GA4 Data API falhou: ' . ($err ?: ('HTTP ' . $status)) . $detail);
    }
    $json = json_decode((string) $resp, true);
    if (!is_array($json)) {
        throw new RuntimeException('Resposta inválida da GA4 Data API.');
    }
    return $json;
}

function ga4_rows(array $report, array $dimKeys, array $metricKeys): array
{
    $rows = $report['rows'] ?? [];
    if (!is_array($rows)) {
        return [];
    }
    $out = [];
    foreach ($rows as $r) {
        $item = [];
        $dv = is_array($r['dimensionValues'] ?? null) ? $r['dimensionValues'] : [];
        $mv = is_array($r['metricValues'] ?? null) ? $r['metricValues'] : [];
        foreach ($dimKeys as $i => $k) {
            $item[$k] = (string) (($dv[$i]['value'] ?? '') ?: '');
        }
        foreach ($metricKeys as $i => $k) {
            $item[$k] = (float) (($mv[$i]['value'] ?? 0) ?: 0);
        }
        $out[] = $item;
    }
    return $out;
}

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
    $attachCols = function (array $p) use ($byProduct, $colMap): array {
        $p['price'] = isset($p['price']) ? (float) $p['price'] : 0.0;
        $ids = $byProduct[$p['id']] ?? [];
        $collections = [];
        foreach ($ids as $cid) {
            if (isset($colMap[$cid])) {
                $collections[] = $colMap[$cid];
            }
        }
        $p['collections'] = $collections;

        return $p;
    };

    if (isset($segments[2]) && ctype_digit((string) $segments[2])) {
        $pid = (int) $segments[2];
        $st = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $st->execute([$pid]);
        $row = $st->fetch();
        if (!$row) {
            json_out(404, ['error' => 'Produto não encontrado']);
        }
        json_out(200, attach_product_images_pdo($pdo, [$attachCols($row)])[0]);
    }

    $rows = $pdo->query('SELECT * FROM products ORDER BY created_at DESC')->fetchAll();
    $out = [];
    foreach ($rows as $p) {
        $out[] = $attachCols($p);
    }
    json_out(200, attach_product_images_pdo($pdo, $out));
}

if ($method === 'GET' && ($segments[0] ?? '') === 'public' && ($segments[1] ?? '') === 'collections') {
    $sql = 'SELECT c.*, (SELECT COUNT(*) FROM product_collections pc WHERE pc.collection_id = c.id) AS product_count
            FROM collections c ORDER BY c.name';
    json_out(200, $pdo->query($sql)->fetchAll());
}

// --- Analytics (GA4 direto, sem Looker) ---
if ($method === 'GET' && ($segments[0] ?? '') === 'analytics' && ($segments[1] ?? '') === 'summary') {
    require_auth($CONFIG, $pdo);

    $gaCfg = is_array($CONFIG['ga4'] ?? null) ? $CONFIG['ga4'] : [];
    $propertyId = trim((string) ($gaCfg['property_id'] ?? ''));
    $clientEmail = trim((string) ($gaCfg['client_email'] ?? ''));
    $privateKey = str_replace('\n', "\n", (string) ($gaCfg['private_key'] ?? ''));
    if ($propertyId === '' || $clientEmail === '' || trim($privateKey) === '') {
        json_out(200, [
            'configured' => false,
            'error' => 'GA4 não configurado no backend. Defina ga4.property_id, ga4.client_email e ga4.private_key em api/config.local.php',
        ]);
    }

    $days = isset($_GET['days']) ? (int) $_GET['days'] : 7;
    if (!in_array($days, [1, 7, 30, 90], true)) {
        $days = 7;
    }
    $dateRanges = [['startDate' => $days . 'daysAgo', 'endDate' => 'today']];
    $property = 'properties/' . $propertyId;

    try {
        $token = ga4_access_token($clientEmail, $privateKey);

        $run = function (array $payload) use ($property, $token): array {
            return ga4_post_json(
                'https://analyticsdata.googleapis.com/v1beta/' . $property . ':runReport',
                $payload,
                $token
            );
        };

        $rt = ga4_post_json(
            'https://analyticsdata.googleapis.com/v1beta/' . $property . ':runRealtimeReport',
            ['metrics' => [['name' => 'activeUsers']]],
            $token
        );
        $totals = $run([
            'dateRanges' => $dateRanges,
            'metrics' => [
                ['name' => 'totalUsers'],
                ['name' => 'sessions'],
                ['name' => 'screenPageViews'],
                ['name' => 'eventCount'],
            ],
        ]);
        $timeline = $run([
            'dateRanges' => $dateRanges,
            'dimensions' => [['name' => 'date']],
            'metrics' => [['name' => 'totalUsers'], ['name' => 'sessions'], ['name' => 'screenPageViews']],
            'orderBys' => [['dimension' => ['dimensionName' => 'date']]],
        ]);
        $byHour = $run([
            'dateRanges' => $dateRanges,
            'dimensions' => [['name' => 'hour']],
            'metrics' => [['name' => 'sessions']],
            'orderBys' => [['dimension' => ['dimensionName' => 'hour']]],
        ]);
        $byWeekday = $run([
            'dateRanges' => $dateRanges,
            'dimensions' => [['name' => 'dayOfWeekName']],
            'metrics' => [['name' => 'sessions']],
            'orderBys' => [['metric' => ['metricName' => 'sessions'], 'desc' => true]],
        ]);
        $byDevice = $run([
            'dateRanges' => $dateRanges,
            'dimensions' => [['name' => 'deviceCategory']],
            'metrics' => [['name' => 'sessions']],
            'orderBys' => [['metric' => ['metricName' => 'sessions'], 'desc' => true]],
        ]);
        $byBrowser = $run([
            'dateRanges' => $dateRanges,
            'dimensions' => [['name' => 'browser']],
            'metrics' => [['name' => 'sessions']],
            'orderBys' => [['metric' => ['metricName' => 'sessions'], 'desc' => true]],
            'limit' => 10,
        ]);
        $byOs = $run([
            'dateRanges' => $dateRanges,
            'dimensions' => [['name' => 'operatingSystem']],
            'metrics' => [['name' => 'sessions']],
            'orderBys' => [['metric' => ['metricName' => 'sessions'], 'desc' => true]],
            'limit' => 10,
        ]);
        $byChannel = $run([
            'dateRanges' => $dateRanges,
            'dimensions' => [['name' => 'sessionDefaultChannelGroup']],
            'metrics' => [['name' => 'sessions']],
            'orderBys' => [['metric' => ['metricName' => 'sessions'], 'desc' => true]],
            'limit' => 10,
        ]);
        $byCountry = $run([
            'dateRanges' => $dateRanges,
            'dimensions' => [['name' => 'country']],
            'metrics' => [['name' => 'sessions'], ['name' => 'screenPageViews']],
            'orderBys' => [['metric' => ['metricName' => 'sessions'], 'desc' => true]],
            'limit' => 10,
        ]);
        $byCity = $run([
            'dateRanges' => $dateRanges,
            'dimensions' => [['name' => 'city'], ['name' => 'country']],
            'metrics' => [['name' => 'sessions']],
            'orderBys' => [['metric' => ['metricName' => 'sessions'], 'desc' => true]],
            'limit' => 10,
        ]);
        $clicks = $run([
            'dateRanges' => $dateRanges,
            'dimensions' => [['name' => 'eventName']],
            'metrics' => [['name' => 'eventCount']],
            'dimensionFilter' => [
                'filter' => [
                    'fieldName' => 'eventName',
                    'stringFilter' => ['matchType' => 'CONTAINS', 'value' => 'click'],
                ],
            ],
            'orderBys' => [['metric' => ['metricName' => 'eventCount'], 'desc' => true]],
            'limit' => 10,
        ]);

        $tRows = $totals['rows'] ?? [];
        $t0 = is_array($tRows[0] ?? null) ? $tRows[0] : [];
        $m = is_array($t0['metricValues'] ?? null) ? $t0['metricValues'] : [];
        $totalUsers = (float) (($m[0]['value'] ?? 0) ?: 0);
        $totalSessions = (float) (($m[1]['value'] ?? 0) ?: 0);
        $totalViews = (float) (($m[2]['value'] ?? 0) ?: 0);
        $totalEvents = (float) (($m[3]['value'] ?? 0) ?: 0);

        $clickRows = ga4_rows($clicks, ['eventName'], ['eventCount']);
        $totalClicks = 0.0;
        foreach ($clickRows as $row) {
            $totalClicks += (float) ($row['eventCount'] ?? 0);
        }

        $rtRows = $rt['rows'] ?? [];
        $online = 0.0;
        if (is_array($rtRows[0] ?? null)) {
            $online = (float) (($rtRows[0]['metricValues'][0]['value'] ?? 0) ?: 0);
        }

        json_out(200, [
            'configured' => true,
            'periodDays' => $days,
            'onlineNow' => $online,
            'cards' => [
                'uniqueVisitors' => $totalUsers,
                'totalVisits' => $totalSessions,
                'totalViews' => $totalViews,
                'avgViewsPerVisitor' => $totalUsers > 0 ? ($totalViews / $totalUsers) : 0,
                'totalClicks' => $totalClicks,
                'totalInteractions' => $totalEvents,
                'conversionRate' => $totalSessions > 0 ? (($totalClicks / $totalSessions) * 100) : 0,
            ],
            'timeline' => ga4_rows($timeline, ['date'], ['users', 'sessions', 'views']),
            'peakHours' => ga4_rows($byHour, ['hour'], ['sessions']),
            'byWeekday' => ga4_rows($byWeekday, ['day'], ['sessions']),
            'byDevice' => ga4_rows($byDevice, ['name'], ['sessions']),
            'byBrowser' => ga4_rows($byBrowser, ['name'], ['sessions']),
            'byOs' => ga4_rows($byOs, ['name'], ['sessions']),
            'byChannel' => ga4_rows($byChannel, ['name'], ['sessions']),
            'byCountry' => ga4_rows($byCountry, ['country'], ['sessions', 'views']),
            'byCity' => ga4_rows($byCity, ['city', 'country'], ['sessions']),
            'topClickedEvents' => $clickRows,
        ]);
    } catch (Throwable $e) {
        json_out(200, [
            'configured' => false,
            'error' => 'Falha ao consultar GA4: ' . $e->getMessage(),
        ]);
    }
}

// --- Upload (auth) ---
if ($method === 'POST' && ($segments[0] ?? '') === 'upload') {
    $up = require_auth($CONFIG, $pdo);
    require_editor($up);
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
        $rawRole = strtolower(trim((string) ($body['role'] ?? 'admin')));
        if ($rawRole === 'root') {
            json_out(400, ['error' => 'Não é permitido criar usuário root por aqui.']);
        }
        $role = in_array($rawRole, ['admin', 'operador'], true) ? $rawRole : null;
        if ($uname === '' || $password === '') {
            json_out(400, ['error' => 'Usuário e senha são obrigatórios']);
        }
        if (!$role) {
            json_out(400, ['error' => 'Perfil inválido. Use "admin" ou "operador".']);
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
        require_editor($authUser);
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
        require_editor($authUser);
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
        require_editor($authUser);
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
        json_out(200, attach_product_images_pdo($pdo, attach_collections_pdo($pdo, $rows)));
    }
    if ($method === 'GET' && isset($segments[1]) && ctype_digit($segments[1])) {
        $id = (int) $segments[1];
        $st = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $st->execute([$id]);
        $row = $st->fetch();
        if (!$row) {
            json_out(404, ['error' => 'Produto não encontrado']);
        }
        $out = attach_product_images_pdo($pdo, attach_collections_pdo($pdo, [$row]));
        json_out(200, $out[0]);
    }
    if ($method === 'POST' && count($segments) === 1) {
        require_editor($authUser);
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
        $imgForRow = $body['image_url'] ?? null;
        if (!empty($body['images']) && is_array($body['images'])) {
            foreach ($body['images'] as $u) {
                $u = trim((string) $u);
                if ($u !== '') {
                    $imgForRow = $u;
                    break;
                }
            }
        }
        $st = $pdo->prepare(
            'INSERT INTO products (name, slug, description, price, image_url, category, badge, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?)'
        );
        $st->execute([
            $name,
            $slug,
            $body['description'] ?? null,
            $price,
            $imgForRow,
            $body['category'] ?? null,
            $body['badge'] ?? null,
            $now,
            $now,
        ]);
        $newId = (int) $pdo->lastInsertId();
        set_product_collections($pdo, $newId, $body['collection_ids'] ?? null);
        if (!empty($body['images']) && is_array($body['images'])) {
            set_product_images($pdo, $newId, $body['images']);
        } elseif ($imgForRow) {
            set_product_images($pdo, $newId, [$imgForRow]);
        } else {
            set_product_images($pdo, $newId, []);
        }
        $st = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $st->execute([$newId]);
        $out = attach_product_images_pdo($pdo, attach_collections_pdo($pdo, [$st->fetch()]));
        json_out(201, $out[0]);
    }
    if ($method === 'PUT' && isset($segments[1]) && ctype_digit($segments[1])) {
        require_editor($authUser);
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
        if (array_key_exists('images', $body)) {
            $arr = is_array($body['images']) ? $body['images'] : [];
            set_product_images($pdo, $id, $arr);
            $first = null;
            foreach ($arr as $u) {
                $u = trim((string) $u);
                if ($u !== '') {
                    $first = $u;
                    break;
                }
            }
            $img = $first;
        } elseif (array_key_exists('image_url', $body)) {
            set_product_images($pdo, $id, $img ? [$img] : []);
        }
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
        $out = attach_product_images_pdo($pdo, attach_collections_pdo($pdo, [$st->fetch()]));
        json_out(200, $out[0]);
    }
    if ($method === 'DELETE' && isset($segments[1]) && ctype_digit($segments[1])) {
        require_editor($authUser);
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
