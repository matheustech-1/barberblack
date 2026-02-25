<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Response;

final class PlanController
{
    private Database $database;

    public function __construct(Database $database)
    {
        $this->database = $database;
    }

    public function index(): void
    {
        $statement = $this->database->pdo()->query(
            "SELECT id, name, description, monthly_price_cents, cuts_per_month
             FROM plans
             WHERE active = true
             ORDER BY monthly_price_cents ASC"
        );

        $plans = $statement->fetchAll();
        Response::json(['plans' => $plans]);
    }
}
