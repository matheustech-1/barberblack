<?php

declare(strict_types=1);

namespace App;

use App\Controllers\AdminController;
use App\Controllers\AppointmentController;
use App\Controllers\HealthController;
use App\Controllers\PaymentController;
use App\Controllers\PlanController;
use App\Controllers\ServiceController;
use Throwable;

final class Router
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

    public function dispatch(string $method, string $uri): void
    {
        try {
            $path = $this->normalizePath($uri);

            $healthController = new HealthController($this->database);
            $serviceController = new ServiceController($this->database);
            $planController = new PlanController($this->database);
            $appointmentController = new AppointmentController($this->database);
            $paymentController = new PaymentController($this->env, $this->database);
            $adminController = new AdminController($this->env, $this->database);

            if ($method === 'GET' && $path === '/') {
                Response::json(['message' => 'Project Barber PHP API online']);
                return;
            }

            if ($method === 'GET' && $path === '/health') {
                $healthController->index();
                return;
            }

            if ($method === 'GET' && $path === '/services') {
                $serviceController->index();
                return;
            }

            if ($method === 'GET' && $path === '/plans') {
                $planController->index();
                return;
            }

            if ($method === 'POST' && $path === '/appointments') {
                $appointmentController->create(Request::jsonBody());
                return;
            }

            if ($method === 'POST' && $path === '/payments/checkout') {
                $paymentController->checkout(Request::jsonBody());
                return;
            }

            if ($method === 'POST' && $path === '/payments/webhook') {
                $paymentController->webhook(Request::jsonBody());
                return;
            }

            if ($method === 'POST' && $path === '/admin/login') {
                $adminController->login(Request::jsonBody());
                return;
            }

            if ($method === 'GET' && $path === '/admin/appointments') {
                Auth::requireAdmin($this->env);
                $adminController->listAppointments();
                return;
            }

            if ($method === 'GET' && $path === '/admin/dashboard') {
                Auth::requireAdmin($this->env);
                $adminController->dashboard();
                return;
            }

            if ($method === 'PATCH' && preg_match('#^/admin/appointments/([0-9a-fA-F-]+)/status$#', $path, $matches) === 1) {
                Auth::requireAdmin($this->env);
                $adminController->updateAppointmentStatus($matches[1], Request::jsonBody());
                return;
            }

            throw new HttpException('Route not found', 404);
        } catch (HttpException $exception) {
            Response::json(['error' => $exception->getMessage()], $exception->getStatusCode());
        } catch (Throwable $exception) {
            error_log((string) $exception);
            Response::json(['error' => 'Internal server error'], 500);
        }
    }

    private function normalizePath(string $uri): string
    {
        $path = parse_url($uri, PHP_URL_PATH);
        if (!is_string($path) || $path === '') {
            return '/';
        }

        $baseDirectory = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? ''));
        if ($baseDirectory !== '' && $baseDirectory !== '/' && str_starts_with($path, $baseDirectory)) {
            $path = substr($path, strlen($baseDirectory));
            if ($path === false || $path === '') {
                $path = '/';
            }
        }

        if ($path === '/api') {
            return '/';
        }

        if (str_starts_with($path, '/api/')) {
            $path = substr($path, 4);
        }

        if ($path === '' || $path === false) {
            return '/';
        }

        return $path;
    }
}
