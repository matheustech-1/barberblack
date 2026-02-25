<?php

declare(strict_types=1);

namespace App;

use PDO;
use PDOException;

final class Database
{
    private ?PDO $pdo = null;
    /**
     * @var array<string, string>
     */
    private array $env;

    /**
     * @param array<string, string> $env
     */
    public function __construct(array $env)
    {
        $this->env = $env;
    }

    public function pdo(): PDO
    {
        if ($this->pdo !== null) {
            return $this->pdo;
        }

        $databaseUrl = (string) ($this->env['DATABASE_URL'] ?? '');
        if ($databaseUrl === '') {
            throw new HttpException('Missing DATABASE_URL', 500);
        }

        $parts = parse_url($databaseUrl);
        if ($parts === false) {
            throw new HttpException('Invalid DATABASE_URL format', 500);
        }

        $host = (string) ($parts['host'] ?? 'localhost');
        $port = (int) ($parts['port'] ?? 5432);
        $user = urldecode((string) ($parts['user'] ?? ''));
        $pass = urldecode((string) ($parts['pass'] ?? ''));
        $dbName = ltrim((string) ($parts['path'] ?? ''), '/');

        if ($dbName === '') {
            throw new HttpException('DATABASE_URL missing database name', 500);
        }

        $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s', $host, $port, $dbName);

        try {
            $this->pdo = new PDO(
                $dsn,
                $user,
                $pass,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );
        } catch (PDOException $exception) {
            throw new HttpException('Database connection failed', 500);
        }

        return $this->pdo;
    }
}
