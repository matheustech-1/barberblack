<?php

declare(strict_types=1);

namespace App;

final class Auth
{
    /**
     * @param array<string, string> $env
     * @return array<string, mixed>
     */
    public static function requireAdmin(array $env): array
    {
        $token = Request::bearerToken();
        if ($token === null) {
            throw new HttpException('Missing admin token', 401);
        }

        $secret = (string) ($env['ADMIN_JWT_SECRET'] ?? '');
        if ($secret === '') {
            throw new HttpException('ADMIN_JWT_SECRET not configured', 500);
        }

        $payload = Jwt::decode($token, $secret);
        if ($payload === null || ($payload['role'] ?? '') !== 'admin') {
            throw new HttpException('Invalid or expired admin token', 401);
        }

        return $payload;
    }
}
