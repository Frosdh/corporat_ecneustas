<?php

declare(strict_types=1);

return [
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'database' => 'corporat_san-bartolome',
        'username' => 'corporat_san-bartolome',
        'password' => ']p!^XhIiiIB~)uGk',
        'charset' => 'utf8mb4',
    ],
    'gemini' => [
        'api_key' => '', // Pega aquí tu API key de Google AI Studio: https://aistudio.google.com/app/apikey
        'model'   => 'gemini-1.5-flash',
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
