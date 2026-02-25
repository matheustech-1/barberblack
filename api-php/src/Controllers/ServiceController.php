<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Response;

final class ServiceController
{
    private Database $database;

    public function __construct(Database $database)
    {
        $this->database = $database;
    }

    public function index(): void
    {
        $statement = $this->database->pdo()->query(
            "SELECT id, name, description, duration_minutes, price_cents
             FROM services
             WHERE active = true
             ORDER BY name ASC"
        );

        $services = $statement->fetchAll();
        Response::json(['services' => $services]);
    }
}
