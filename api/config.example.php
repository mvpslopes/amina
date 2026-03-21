<?php
/**
 * Renomeie para config.local.php ou edite config.local.php no servidor.
 *
 * ATENÇÃO: substitua SUA_SENHA_MYSQL pela senha REAL do hPanel.
 * Se mantiver o placeholder, o site mostrará "Falha na conexão com o banco".
 *
 * Senha com caracteres especiais (# ' " \): use aspas DUPLAS:
 *   'pass' => "uf2#mO1?",
 *
 * Host: na Hostinger costuma funcionar 127.0.0.1 ou localhost.
 * Se o painel mostrar outro "Hostname MySQL", coloque em 'host' ou em 'hosts' abaixo.
 */
return [
    'db' => [
        // Prefira 127.0.0.1 em hospedagem compartilhada (evita problema IPv6)
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'u179630068_amina_bd',
        'user' => 'u179630068_amina_user',
        'pass' => 'SUA_SENHA_MYSQL',
        'charset' => 'utf8mb4',
        // Opcional: tentar vários hosts em ordem
        // 'hosts' => ['127.0.0.1', 'localhost'],
        // Opcional: socket Unix (raro na Hostinger)
        // 'socket' => '/var/run/mysqld/mysqld.sock',
    ],
    /** Mínimo 16 caracteres (obrigatório). Troque em produção. */
    'jwt_secret' => 'amina-jwt-altere-esta-frase-com-32-chars-min',
    /** Caminho absoluto no servidor onde salvar imagens (fora de public_html se possível) */
    'upload_dir' => __DIR__ . '/../uploads',
    /** URL pública das imagens (mesmo domínio do site) */
    'upload_public_url' => '/uploads',

    /**
     * Só para diagnosticar conexão MySQL. Defina uma string longa e acesse:
     *   /api/test-db-connection.php?key=ESSA_STRING
     * Depois remova esta linha e apague test-db-connection.php no servidor.
     */
    // 'db_diagnostic_key' => 'troque-por-chave-secreta-longa',

    /**
     * true = erro 500 mostra mensagem real do PDO (aparece também no texto vermelho do login).
     * Alternativa: ficheiro vazio api/db-debug.flag (apague depois) ou SetEnv AMINA_DEBUG_DB 1 no .htaccess da api.
     */
    'expose_mysql_error' => false,
];
