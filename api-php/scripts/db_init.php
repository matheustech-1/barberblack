<?php

declare(strict_types=1);

use App\Database;
use App\Env;

require_once __DIR__ . '/../src/Env.php';
require_once __DIR__ . '/../src/HttpException.php';
require_once __DIR__ . '/../src/Database.php';

$env = Env::load(__DIR__ . '/../.env');
$database = new Database($env);
$schemaPath = __DIR__ . '/../sql/schema.sql';

if (!is_file($schemaPath)) {
    fwrite(STDERR, "schema.sql not found\n");
    exit(1);
}

$sql = file_get_contents($schemaPath);
if ($sql === false) {
    fwrite(STDERR, "Failed to read schema.sql\n");
    exit(1);
}

try {
    $database->pdo()->exec($sql);
    fwrite(STDOUT, "Database initialized successfully.\n");
    exit(0);
} catch (Throwable $exception) {
    fwrite(STDERR, "Failed to initialize database: " . $exception->getMessage() . "\n");
    exit(1);
}
