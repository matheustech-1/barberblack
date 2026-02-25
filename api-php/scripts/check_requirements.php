<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/Env.php';

use App\Env;

$requiredExtensions = ['pdo', 'pdo_pgsql', 'pgsql', 'json', 'openssl'];
$requiredEnv = [
    'DATABASE_URL',
    'ADMIN_USER',
    'ADMIN_PASSWORD',
    'ADMIN_JWT_SECRET',
];

$missingExtensions = [];
foreach ($requiredExtensions as $extension) {
    if (!extension_loaded($extension)) {
        $missingExtensions[] = $extension;
    }
}

$env = Env::load(__DIR__ . '/../.env');
$missingEnv = [];
foreach ($requiredEnv as $envVar) {
    if (!isset($env[$envVar]) || trim((string) $env[$envVar]) === '') {
        $missingEnv[] = $envVar;
    }
}

if ($missingExtensions !== []) {
    fwrite(STDERR, 'Missing PHP extensions: ' . implode(', ', $missingExtensions) . PHP_EOL);
}

if ($missingEnv !== []) {
    fwrite(STDERR, 'Missing env vars: ' . implode(', ', $missingEnv) . PHP_EOL);
}

if ($missingExtensions !== [] || $missingEnv !== []) {
    exit(1);
}

fwrite(STDOUT, 'Environment looks good.' . PHP_EOL);
