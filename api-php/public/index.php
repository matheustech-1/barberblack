<?php

declare(strict_types=1);

use App\Database;
use App\Env;
use App\Response;
use App\Router;

spl_autoload_register(static function (string $className): void {
    $prefix = 'App\\';
    if (!str_starts_with($className, $prefix)) {
        return;
    }

    $relativeClass = substr($className, strlen($prefix));
    $filePath = __DIR__ . '/../src/' . str_replace('\\', '/', $relativeClass) . '.php';

    if (is_file($filePath)) {
        require_once $filePath;
    }
});

$env = Env::load(__DIR__ . '/../.env');
Response::setCorsHeaders((string) ($env['CORS_ORIGIN'] ?? '*'));

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    Response::noContent();
    return;
}

$database = new Database($env);
$router = new Router($env, $database);
$router->dispatch($_SERVER['REQUEST_METHOD'] ?? 'GET', $_SERVER['REQUEST_URI'] ?? '/');
