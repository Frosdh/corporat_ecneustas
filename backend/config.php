<?php

declare(strict_types=1);

$config = [
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'database' => 'corporat_san-bartolome',
        'username' => 'corporat_san-bartolome',
        'password' => ']p!^XhIiiIB~)uGk',
        'charset' => 'utf8mb4',
    ],
    'gemini' => [
        'api_key' => '', // Se carga localmente desde config_local.php
        'model'   => 'gemini-2.5-flash',
        'mode'    => 'gemini', // 'gemini' para usar la API, 'local' para el motor experto local sin conexión
    ],
    'app' => [
        'target_surveys' => 300,
        'session_name' => 'san_bartolome_app',
        'max_upload_size' => 5 * 1024 * 1024,
        'allowed_upload_mime_types' => [
            'image/jpeg',
            'image/png',
            'application/pdf',
        ],
        'storage_dir' => __DIR__ . '/storage',
    ],
];

if (file_exists(__DIR__ . '/config_local.php')) {
    $localConfig = require __DIR__ . '/config_local.php';
    if (is_array($localConfig)) {
        $config = array_replace_recursive($config, $localConfig);
    }
}

return $config;
