<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\HttpException;
use App\Request;
use App\Response;
use PDO;
use Throwable;

final class PaymentController
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
    public function checkout(array $body): void
    {
        $appointmentId = trim((string) ($body['appointmentId'] ?? ''));
        $provider = trim((string) ($body['provider'] ?? ($this->env['PAYMENT_PROVIDER'] ?? 'manual_pix')));
        $amountCents = isset($body['amountCents']) ? (int) $body['amountCents'] : null;

        if ($appointmentId === '') {
            throw new HttpException('appointmentId is required', 400);
        }

        if ($provider === '') {
            $provider = 'manual_pix';
        }

        $pdo = $this->database->pdo();
        try {
            $pdo->beginTransaction();

            $appointmentStatement = $pdo->prepare(
                "SELECT a.id, a.status, s.price_cents
                 FROM appointments a
                 JOIN services s ON s.id = a.service_id
                 WHERE a.id = :id
                 LIMIT 1"
            );
            $appointmentStatement->execute([':id' => $appointmentId]);
            $appointment = $appointmentStatement->fetch();

            if ($appointment === false) {
                $pdo->rollBack();
                throw new HttpException('Appointment not found', 404);
            }

            if (in_array((string) $appointment['status'], ['cancelled', 'completed'], true)) {
                $pdo->rollBack();
                throw new HttpException('Appointment is not eligible for payment', 409);
            }

            $finalAmount = $amountCents !== null && $amountCents > 0
                ? $amountCents
                : (int) $appointment['price_cents'];

            $externalId = 'pay_' . bin2hex(random_bytes(8));

            $insertStatement = $pdo->prepare(
                "INSERT INTO payments (appointment_id, provider, external_id, amount_cents, status)
                 VALUES (:appointment_id, :provider, :external_id, :amount_cents, 'pending')
                 RETURNING id, appointment_id, provider, external_id, amount_cents, status, created_at"
            );
            $insertStatement->execute([
                ':appointment_id' => $appointmentId,
                ':provider' => $provider,
                ':external_id' => $externalId,
                ':amount_cents' => $finalAmount,
            ]);

            $payment = $insertStatement->fetch();
            $pdo->commit();

            Response::json([
                'payment' => $payment,
                'instructions' => [
                    'type' => $provider,
                    'message' => 'Checkout created. Integrate provider API to generate payment link or PIX payload.',
                    'pixKey' => (string) ($this->env['PAYMENT_PIX_KEY'] ?? ''),
                ],
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
            throw new HttpException('Failed to create checkout', 500);
        }
    }

    /**
     * @param array<string, mixed> $body
     */
    public function webhook(array $body): void
    {
        $expectedToken = trim((string) ($this->env['PAYMENT_WEBHOOK_TOKEN'] ?? ''));
        if ($expectedToken !== '') {
            $receivedToken = Request::header('X-Webhook-Token') ?? '';
            if (!hash_equals($expectedToken, $receivedToken)) {
                throw new HttpException('Invalid webhook token', 401);
            }
        }

        $paymentId = trim((string) ($body['paymentId'] ?? ''));
        $externalId = trim((string) ($body['externalId'] ?? ''));
        $provider = trim((string) ($body['provider'] ?? 'manual_pix'));
        $eventType = trim((string) ($body['eventType'] ?? 'payment_update'));
        $statusRaw = trim((string) ($body['paymentStatus'] ?? ($body['status'] ?? '')));

        if ($paymentId === '' && $externalId === '') {
            throw new HttpException('paymentId or externalId is required', 400);
        }

        if ($statusRaw === '') {
            throw new HttpException('paymentStatus is required', 400);
        }

        $normalizedStatus = $this->normalizePaymentStatus($statusRaw);
        if ($normalizedStatus === null) {
            throw new HttpException('Invalid paymentStatus', 400);
        }

        $pdo = $this->database->pdo();
        try {
            $pdo->beginTransaction();

            if ($paymentId !== '') {
                $paymentStatement = $pdo->prepare(
                    "SELECT id, appointment_id, status, external_id
                     FROM payments
                     WHERE id = :id
                     LIMIT 1"
                );
                $paymentStatement->execute([':id' => $paymentId]);
            } else {
                $paymentStatement = $pdo->prepare(
                    "SELECT id, appointment_id, status, external_id
                     FROM payments
                     WHERE external_id = :external_id
                     LIMIT 1"
                );
                $paymentStatement->execute([':external_id' => $externalId]);
            }

            $payment = $paymentStatement->fetch();
            if ($payment === false) {
                $pdo->rollBack();
                throw new HttpException('Payment not found', 404);
            }

            $resolvedExternalId = $externalId !== '' ? $externalId : (string) ($payment['external_id'] ?? '');
            if ($resolvedExternalId === '') {
                $resolvedExternalId = 'evt_' . bin2hex(random_bytes(8));
            }

            $updateStatement = $pdo->prepare(
                "UPDATE payments
                 SET
                    provider = :provider,
                    external_id = :external_id,
                    status = :status_value,
                    paid_at = CASE WHEN :status_paid_check = 'paid' THEN NOW() ELSE paid_at END,
                    updated_at = NOW()
                 WHERE id = :id
                 RETURNING id, appointment_id, status, external_id, paid_at"
            );
            $updateStatement->execute([
                ':provider' => $provider,
                ':external_id' => $resolvedExternalId,
                ':status_value' => $normalizedStatus,
                ':status_paid_check' => $normalizedStatus,
                ':id' => (string) $payment['id'],
            ]);
            $updatedPayment = $updateStatement->fetch();

            if ($normalizedStatus === 'paid' && !empty($updatedPayment['appointment_id'])) {
                $appointmentUpdate = $pdo->prepare(
                    "UPDATE appointments
                     SET status = 'confirmed', updated_at = NOW()
                     WHERE id = :appointment_id
                       AND status IN ('pending_payment', 'confirmed')"
                );
                $appointmentUpdate->execute([
                    ':appointment_id' => (string) $updatedPayment['appointment_id'],
                ]);
            }

            $payloadJson = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if (!is_string($payloadJson)) {
                $payloadJson = '{}';
            }

            $webhookStatement = $pdo->prepare(
                "INSERT INTO webhook_events (provider, event_type, payload)
                 VALUES (:provider, :event_type, CAST(:payload AS JSONB))"
            );
            $webhookStatement->execute([
                ':provider' => $provider,
                ':event_type' => $eventType,
                ':payload' => $payloadJson,
            ]);

            $pdo->commit();
            Response::json([
                'ok' => true,
                'payment' => $updatedPayment,
            ]);
        } catch (HttpException $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw new HttpException('Failed to process webhook', 500);
        }
    }

    private function normalizePaymentStatus(string $status): ?string
    {
        $status = strtolower(trim($status));

        return match ($status) {
            'paid', 'approved', 'succeeded', 'success' => 'paid',
            'pending', 'in_process', 'waiting' => 'pending',
            'failed', 'rejected', 'error' => 'failed',
            'cancelled', 'canceled', 'voided' => 'cancelled',
            default => null,
        };
    }
}
