<?php
/**
 * Verificação rápida do ambiente PHP (sem expor senhas).
 *
 * Abra: https://SEU-DOMINIO/api/env-check.php
 *
 * Para ver o erro detalhado do MySQL: crie um ficheiro VAZIO
 *   api/db-debug.flag
 * no servidor (Gestor de ficheiros / FTP), recarregue esta página,
 * leia "db", apague db-debug.flag e corrija config.local.php.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');

$root = __DIR__;
$configPath = $root . '/config.local.php';

$out = [
  'php_version' => PHP_VERSION,
  'pdo_mysql_loaded' => extension_loaded('pdo_mysql'),
  'config_local_readable' => is_readable($configPath),
  'db_debug_flag' => file_exists($root . '/db-debug.flag'),
];

if (is_readable($configPath)) {
  /** @var array<string,mixed> $CONFIG */
  $CONFIG = require $configPath;
  $out['jwt_secret_length'] = strlen((string) ($CONFIG['jwt_secret'] ?? ''));
  $db = $CONFIG['db'] ?? null;
  $out['db_configured'] = is_array($db) && ($db['name'] ?? '') !== '' && ($db['user'] ?? '') !== '';

  $showDbDetail = $out['db_debug_flag'] && is_array($db);
  if ($showDbDetail) {
    require_once $root . '/lib/PdoMysql.php';
    $r = amina_try_mysql_connection($db);
    $out['db'] = [
      'ok' => $r['ok'],
      'hosts_tried' => $r['hosts_tried'],
      'per_host_errors' => $r['per_host_errors'],
      'last_error' => $r['last_error'],
    ];
  }
}

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
