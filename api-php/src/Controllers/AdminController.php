<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\HttpException;
use App\Jwt;
use App\Response;

final class AdminController
{
    /**
     * @var array<string, string>
     */
    private array $env;
    private Database $database;

    /**
     * @param array<string, string> $env
     */
    public function __construct(array $env, Database $database)
    {
        $this->env = $env;
        $this->database = $database;
    }

    /**
     * @param array<string, mixed> $body
     */
    public function login(array $body): void
    {
        $username = trim((string) ($body['username'] ?? ''));
        $password = trim((string) ($body['password'] ?? ''));

        if ($username === '' || $password === '') {
            throw new HttpException('username and password are required', 400);
        }

        if (
            $username !== (string) ($this->env['ADMIN_USER'] ?? '') ||
            $password !== (string) ($this->env['ADMIN_PASSWORD'] ?? '')
        ) {
            throw new HttpException('Invalid credentials', 401);
        }

        $secret = (string) ($this->env['ADMIN_JWT_SECRET'] ?? '');
        if ($secret === '') {
            throw new HttpException('ADMIN_JWT_SECRET not configured', 500);
        }

        $expiresIn = Jwt::durationToSeconds((string) ($this->env['ADMIN_JWT_EXPIRES_IN'] ?? '8h'));
        $token = Jwt::encode([
            'role' => 'admin',
            'username' => $username,
            'exp' => time() + $expiresIn,
        ], $secret);

        Response::json(['token' => $token]);
    }

    public function listAppointments(): void
    {
        $statement = $this->database->pdo()->query(
            "SELECT
                a.id,
                a.appointment_date,
                a.appointment_time,
                a.status,
                a.payment_method,
                a.notes,
                c.name AS customer_name,
                c.phone AS customer_phone,
                s.name AS service_name,
                b.name AS barber_name
             FROM appointments a
             JOIN customers c ON c.id = a.customer_id
             JOIN services s ON s.id = a.service_id
             LEFT JOIN barbers b ON b.id = a.barber_id
             ORDER BY a.appointment_date DESC, a.appointment_time DESC
             LIMIT 200"
        );

        Response::json(['appointments' => $statement->fetchAll()]);
    }

    /**
     * @param array<string, mixed> $body
     */
    public function updateAppointmentStatus(string $appointmentId, array $body): void
    {
        $status = trim((string) ($body['status'] ?? ''));
        $allowedStatus = ['pending_payment', 'confirmed', 'cancelled', 'completed'];
        if (!in_array($status, $allowedStatus, true)) {
            throw new HttpException('Invalid status', 400);
        }

        $statement = $this->database->pdo()->prepare(
            "UPDATE appointments
             SET status = :status, updated_at = NOW()
             WHERE id = :id
             RETURNING id, status, updated_at"
        );
        $statement->execute([
            ':status' => $status,
            ':id' => $appointmentId,
        ]);

        $appointment = $statement->fetch();
        if ($appointment === false) {
            throw new HttpException('Appointment not found', 404);
        }

        Response::json(['appointment' => $appointment]);
    }

    public function dashboard(): void
    {
        $statement = $this->database->pdo()->query(
            "SELECT status, COUNT(*)::int AS total
             FROM appointments
             GROUP BY status"
        );

        Response::json(['stats' => $statement->fetchAll()]);
    }
}
