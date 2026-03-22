<?php
declare(strict_types=1);

function send_bootstrap_error(int $code, string $msg): void
{
    if (!headers_sent()) {
        header('Access-Control-Allow-Origin: *');
        header('Content-Type: application/json; charset=utf-8');
    }
    http_response_code($code);
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

$configFile = __DIR__ . '/config.local.php';
if (!is_readable($configFile)) {
    send_bootstrap_error(500, 'Crie api/config.local.php a partir de config.example.php');
}

/** @var array<string,mixed> $CONFIG */
$CONFIG = require $configFile;

$secret = (string) ($CONFIG['jwt_secret'] ?? '');
if (strlen($secret) < 16) {
    send_bootstrap_error(500, 'Defina jwt_secret com pelo menos 16 caracteres em config.local.php');
}

$db = $CONFIG['db'];

if (!extension_loaded('pdo_mysql')) {
    send_bootstrap_error(
        500,
        'A extensão PHP pdo_mysql não está ativa. No hPanel: Avançado → Configuração PHP → extensões → ative "pdo_mysql" (ou mysqli).'
    );
}

require_once __DIR__ . '/lib/PdoMysql.php';

try {
    $pdo = amina_connect_pdo($db);
} catch (PDOException $e) {
    $hint = 'Confira em hPanel → Bancos de dados MySQL: host, nome do banco, usuário com prefixo e senha. '
        . 'O utilizador MySQL tem de estar associado ao banco em "Utilizadores e bases de dados". '
        . 'Senha com símbolos: use aspas duplas no PHP. ';
    $msg = 'Falha na conexão com o banco. ' . $hint;
    /**
     * Diagnóstico (escolha UM método, depois desligue):
     * - config: 'expose_mysql_error' => true
     * - ficheiro vazio: api/db-debug.flag (apague depois)
     * - .htaccess na pasta api: SetEnv AMINA_DEBUG_DB 1
     */
    $debugDb = !empty($CONFIG['expose_mysql_error'])
        || file_exists(__DIR__ . '/db-debug.flag')
        || (string) getenv('AMINA_DEBUG_DB') === '1';
    if ($debugDb) {
        $msg .= ' [DEBUG PDO] ' . $e->getMessage();
    }
    send_bootstrap_error(500, $msg);
}

require_once __DIR__ . '/lib/Jwt.php';
require_once __DIR__ . '/lib/Slug.php';

function json_out(int $code, array $data): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

function cors_headers(): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
}

function get_bearer_token(): ?string
{
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    if (is_array($headers)) {
        foreach ($headers as $k => $v) {
            if (strcasecmp((string) $k, 'Authorization') === 0 && preg_match('/Bearer\s+(\S+)/i', (string) $v, $m)) {
                return $m[1];
            }
        }
    }
    if (!empty($_SERVER['HTTP_AUTHORIZATION']) && preg_match('/Bearer\s+(\S+)/i', $_SERVER['HTTP_AUTHORIZATION'], $m)) {
        return $m[1];
    }
    return null;
}

function require_auth(array $CONFIG, PDO $pdo): array
{
    $token = get_bearer_token();
    if (!$token) {
        json_out(401, ['error' => 'Token não informado']);
    }
    $payload = Jwt::verify($token, $CONFIG['jwt_secret']);
    if (!$payload) {
        json_out(401, ['error' => 'Token inválido ou expirado']);
    }
    return [
        'id' => (int) $payload['sub'],
        'username' => (string) $payload['username'],
        'role' => (string) $payload['role'],
    ];
}

function require_root(array $user): void
{
    if (($user['role'] ?? '') !== 'root') {
        json_out(403, ['error' => 'Apenas Root pode realizar esta ação']);
    }
}

/** Root ou Administrador — alterar produtos, coleções e upload. */
function require_editor(array $user): void
{
    $r = (string) ($user['role'] ?? '');
    if ($r === 'root' || $r === 'admin') {
        return;
    }
    json_out(403, ['error' => 'Sem permissão para alterar dados (perfil somente leitura).']);
}

function now_sql(): string
{
    return date('Y-m-d H:i:s');
}

/** Garante tabela de galeria (deploys antigos). */
function amina_ensure_product_images_table(PDO $pdo): void
{
    try {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS product_images (
              id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
              product_id INT UNSIGNED NOT NULL,
              image_url VARCHAR(2048) NOT NULL,
              sort_order INT UNSIGNED NOT NULL DEFAULT 0,
              KEY idx_pi_product (product_id),
              CONSTRAINT fk_pi_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    } catch (PDOException) {
        /* tabela já existe ou permissões */
    }
}

/**
 * @param array<int,array<string,mixed>> $productRows
 * @return array<int,array<string,mixed>>
 */
function attach_product_images_pdo(PDO $pdo, array $productRows): array
{
    $ids = [];
    foreach ($productRows as $p) {
        if (isset($p['id'])) {
            $ids[] = (int) $p['id'];
        }
    }
    $ids = array_values(array_unique(array_filter($ids, static function ($x) {
        return $x > 0;
    })));
    if ($ids === []) {
        $out = [];
        foreach ($productRows as $p) {
            $p['images'] = !empty($p['image_url']) ? [ $p['image_url'] ] : [];
            $out[] = $p;
        }

        return $out;
    }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare(
        "SELECT product_id, image_url FROM product_images WHERE product_id IN ($in) ORDER BY product_id, sort_order, id"
    );
    $st->execute($ids);
    $byPid = [];
    while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
        $pid = (int) $r['product_id'];
        $byPid[$pid][] = $r['image_url'];
    }
    $out = [];
    foreach ($productRows as $p) {
        $pid = (int) $p['id'];
        $from = $byPid[$pid] ?? [];
        $imgs = count($from) ? $from : (!empty($p['image_url']) ? [$p['image_url']] : []);
        $p['images'] = array_slice($imgs, 0, 5);
        $out[] = $p;
    }

    return $out;
}

function set_product_images(PDO $pdo, int $productId, $imagesRaw): void
{
    $pdo->prepare('DELETE FROM product_images WHERE product_id = ?')->execute([$productId]);
    if (!is_array($imagesRaw) || $imagesRaw === []) {
        return;
    }
    $order = 0;
    $max = 5;
    $ins = $pdo->prepare('INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)');
    foreach ($imagesRaw as $u) {
        if ($order >= $max) {
            break;
        }
        $url = trim((string) $u);
        if ($url === '') {
            continue;
        }
        $ins->execute([$productId, $url, $order++]);
    }
}

amina_ensure_product_images_table($pdo);
