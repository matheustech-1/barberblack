<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\HttpException;
use App\Response;
use PDO;
use Throwable;

final class AppointmentController
{
    private Database $database;

    public function __construct(Database $database)
    {
        $this->database = $database;
    }

    /**
     * @param array<string, mixed> $body
     */
    public function create(array $body): void
    {
        $name = trim((string) ($body['name'] ?? ''));
        $phone = $this->normalizePhone((string) ($body['phone'] ?? ''));
        $serviceId = trim((string) ($body['serviceId'] ?? ''));
        $appointmentDate = trim((string) ($body['appointmentDate'] ?? ''));
        $appointmentTime = trim((string) ($body['appointmentTime'] ?? ''));
        $paymentMethod = trim((string) ($body['paymentMethod'] ?? 'onsite'));
        $notes = trim((string) ($body['notes'] ?? ''));
        $barberId = trim((string) ($body['barberId'] ?? ''));

        if ($name === '' || $phone === '' || $serviceId === '' || $appointmentDate === '' || $appointmentTime === '') {
            throw new HttpException('name, phone, serviceId, appointmentDate and appointmentTime are required', 400);
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $appointmentDate) !== 1 || preg_match('/^\d{2}:\d{2}$/', $appointmentTime) !== 1) {
            throw new HttpException('Invalid date or time format. Use YYYY-MM-DD and HH:mm', 400);
        }

        if (strlen($phone) < 10 || strlen($phone) > 13) {
            throw new HttpException('Invalid phone number', 400);
        }

        $barberIdOrNull = $barberId !== '' ? $barberId : null;
        $notesOrNull = $notes !== '' ? $notes : null;

        $pdo = $this->database->pdo();
        try {
            $pdo->beginTransaction();

            $customerStatement = $pdo->prepare(
                "INSERT INTO customers (name, phone)
                 VALUES (:name, :phone)
                 ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
                 RETURNING id, name, phone"
            );
            $customerStatement->execute([
                ':name' => $name,
                ':phone' => $phone,
            ]);
            $customer = $customerStatement->fetch();

            $serviceStatement = $pdo->prepare(
                "SELECT id FROM services WHERE id = :service_id AND active = true"
            );
            $serviceStatement->execute([':service_id' => $serviceId]);
            $resolvedService = $serviceStatement->fetch();
            if ($resolvedService === false) {
                $pdo->rollBack();
                throw new HttpException('Service not found', 404);
            }

            $clashStatement = $pdo->prepare(
                "SELECT id
                 FROM appointments
                 WHERE barber_id IS NOT DISTINCT FROM :barber_id
                   AND appointment_date = :appointment_date
                   AND appointment_time = :appointment_time
                   AND status IN ('pending_payment', 'confirmed')
                 LIMIT 1"
            );
            $clashStatement->bindValue(':barber_id', $barberIdOrNull, $barberIdOrNull === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
            $clashStatement->bindValue(':appointment_date', $appointmentDate);
            $clashStatement->bindValue(':appointment_time', $appointmentTime);
            $clashStatement->execute();

            if ($clashStatement->fetch() !== false) {
                $pdo->rollBack();
                throw new HttpException('This time slot is already booked', 409);
            }

            $insertStatement = $pdo->prepare(
                "INSERT INTO appointments (
                    customer_id,
                    service_id,
                    barber_id,
                    appointment_date,
                    appointment_time,
                    payment_method,
                    notes,
                    status
                 ) VALUES (
                    :customer_id,
                    :service_id,
                    :barber_id,
                    :appointment_date,
                    :appointment_time,
                    :payment_method,
                    :notes,
                    'pending_payment'
                 )
                 RETURNING
                    id,
                    customer_id,
                    service_id,
                    barber_id,
                    appointment_date,
                    appointment_time,
                    payment_method,
                    status,
                    created_at"
            );
            $insertStatement->bindValue(':customer_id', (string) $customer['id']);
            $insertStatement->bindValue(':service_id', (string) $resolvedService['id']);
            $insertStatement->bindValue(':barber_id', $barberIdOrNull, $barberIdOrNull === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
            $insertStatement->bindValue(':appointment_date', $appointmentDate);
            $insertStatement->bindValue(':appointment_time', $appointmentTime);
            $insertStatement->bindValue(':payment_method', $paymentMethod === '' ? 'onsite' : $paymentMethod);
            $insertStatement->bindValue(':notes', $notesOrNull, $notesOrNull === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
            $insertStatement->execute();

            $appointment = $insertStatement->fetch();
            $pdo->commit();

            Response::json([
                'appointment' => $appointment,
                'customer' => $customer,
            ], 201);
        } catch (HttpException $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw new HttpException('Failed to create appointment', 500);
        }
    }

    private function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? '';
    }
}
