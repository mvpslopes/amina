<?php
/**
 * Diagnóstico de conexão MySQL (NÃO deixe ativo em produção).
 *
 * 1) Em config.local.php defina uma chave forte:
 *    'db_diagnostic_key' => 'cole-uma-string-longa-aleatoria',
 * 2) Acesse no navegador (uma vez):
 *    https://SEU-DOMINIO/api/test-db-connection.php?key=SUA_CHAVE
 * 3) Leia o JSON (erro real do PDO: senha, usuário, banco, host).
 * 4) Remova db_diagnostic_key do config e APAGUE este arquivo do servidor.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');

$key = isset($_GET['key']) ? (string) $_GET['key'] : '';
$configFile = __DIR__ . '/config.local.php';

if (!is_readable($configFile)) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'config.local.php não encontrado'], JSON_UNESCAPED_UNICODE);
    exit;
}

/** @var array<string,mixed> $CONFIG */
$CONFIG = require $configFile;
$expected = (string) ($CONFIG['db_diagnostic_key'] ?? '');

if ($expected === '' || !hash_equals($expected, $key)) {
    http_response_code(404);
    echo json_encode(['ok' => false], JSON_UNESCAPED_UNICODE);
    exit;
}

require_once __DIR__ . '/lib/PdoMysql.php';

$db = $CONFIG['db'] ?? [];
if (!is_array($db)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Seção db inválida no config'], JSON_UNESCAPED_UNICODE);
    exit;
}

$r = amina_try_mysql_connection($db);

$safe = [
    'ok' => $r['ok'],
    'hosts_tried' => $r['hosts_tried'],
    'per_host_errors' => $r['per_host_errors'],
    'last_error' => $r['last_error'],
    'db_name' => (string) ($db['name'] ?? ''),
    'db_user' => (string) ($db['user'] ?? ''),
    'db_port' => (int) ($db['port'] ?? 3306),
    'hint' => $r['ok']
        ? 'Conexão OK. Remova db_diagnostic_key e apague test-db-connection.php.'
        : 'Use last_error / per_host_errors: "Access denied" = usuário ou senha; "Unknown database" = nome do banco errado; timeout = host errado.',
];

echo json_encode($safe, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
