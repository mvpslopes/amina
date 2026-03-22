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
