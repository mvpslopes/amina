<?php
declare(strict_types=1);

/**
 * Conexão MySQL via PDO (compartilhado entre bootstrap e diagnóstico).
 */
function amina_pdo_options(): array
{
    return [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => 'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci',
    ];
}

/**
 * Hostinger / PHP: "localhost" pode resolver para IPv6 (::1) e o MySQL só escuta em 127.0.0.1.
 * Tentamos o host configurado e alternativas.
 */
function amina_connect_pdo(array $db): PDO
{
    $result = amina_try_mysql_connection($db);
    if ($result['ok'] && $result['pdo'] instanceof PDO) {
        return $result['pdo'];
    }
    $msg = $result['last_error'] ?? 'Falha ao conectar';
    throw new PDOException($msg);
}

/**
 * Tenta conectar e devolve detalhes (para diagnóstico).
 *
 * @return array{
 *   ok: bool,
 *   hosts_tried: list<string>,
 *   per_host_errors: array<string, string>,
 *   last_error: string,
 *   pdo: ?PDO
 * }
 */
function amina_try_mysql_connection(array $db): array
{
    $charset = $db['charset'] ?? 'utf8mb4';
    $port = (int) ($db['port'] ?? 3306);
    $name = (string) ($db['name'] ?? '');
    $user = (string) ($db['user'] ?? '');
    $pass = (string) ($db['pass'] ?? '');
    $pdoOpts = amina_pdo_options();

    $perHost = [];
    $hostsTried = [];

    if (!empty($db['socket'])) {
        $hostsTried[] = 'unix_socket:' . (string) $db['socket'];
        try {
            $dsn = sprintf(
                'mysql:unix_socket=%s;dbname=%s;charset=%s',
                $db['socket'],
                $name,
                $charset
            );
            $pdo = new PDO($dsn, $user, $pass, $pdoOpts);
            return [
                'ok' => true,
                'hosts_tried' => $hostsTried,
                'per_host_errors' => [],
                'last_error' => '',
                'pdo' => $pdo,
            ];
        } catch (PDOException $e) {
            $perHost[$hostsTried[0]] = $e->getMessage();
            return [
                'ok' => false,
                'hosts_tried' => $hostsTried,
                'per_host_errors' => $perHost,
                'last_error' => $e->getMessage(),
                'pdo' => null,
            ];
        }
    }

    $hosts = [];
    if (!empty($db['hosts']) && is_array($db['hosts'])) {
        foreach ($db['hosts'] as $h) {
            $hosts[] = (string) $h;
        }
    } else {
        $h = (string) ($db['host'] ?? '127.0.0.1');
        $hosts[] = $h;
        if (strcasecmp($h, 'localhost') === 0) {
            $hosts[] = '127.0.0.1';
        } elseif ($h === '127.0.0.1') {
            $hosts[] = 'localhost';
        }
    }
    $hosts = array_values(array_unique($hosts));

    $lastError = 'Falha ao conectar';
    foreach ($hosts as $host) {
        $hostsTried[] = $host;
        try {
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=%s',
                $host,
                $port,
                $name,
                $charset
            );
            $pdo = new PDO($dsn, $user, $pass, $pdoOpts);
            return [
                'ok' => true,
                'hosts_tried' => $hostsTried,
                'per_host_errors' => $perHost,
                'last_error' => '',
                'pdo' => $pdo,
            ];
        } catch (PDOException $e) {
            $msg = $e->getMessage();
            $perHost[$host] = $msg;
            $lastError = $msg;
        }
    }

    return [
        'ok' => false,
        'hosts_tried' => $hostsTried,
        'per_host_errors' => $perHost,
        'last_error' => $lastError,
        'pdo' => null,
    ];
}
