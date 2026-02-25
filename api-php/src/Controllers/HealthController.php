<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Response;

final class HealthController
{
    private Database $database;

    public function __construct(Database $database)
    {
        $this->database = $database;
    }

    public function index(): void
    {
        $this->database->pdo()->query('SELECT 1');
        Response::json([
            'status' => 'ok',
            'database' => 'connected',
        ]);
    }
}
