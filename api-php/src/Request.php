<?php

declare(strict_types=1);

namespace App;

final class Request
{
    /**
     * @return array<string, mixed>
     */
    public static function jsonBody(): array
    {
        $rawBody = file_get_contents('php://input');
        if ($rawBody === false || trim($rawBody) === '') {
            return [];
        }

        $decoded = json_decode($rawBody, true);
        if (!is_array($decoded)) {
            throw new HttpException('Invalid JSON body', 400);
        }

        return $decoded;
    }

    public static function bearerToken(): ?string
    {
        $header = self::header('Authorization') ?? '';

        if (!is_string($header) || !str_starts_with($header, 'Bearer ')) {
            return null;
        }

        return trim(substr($header, 7));
    }

    public static function header(string $name): ?string
    {
        $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        $value = $_SERVER[$serverKey] ?? null;
        if (is_string($value) && $value !== '') {
            return $value;
        }

        if (function_exists('getallheaders')) {
            $headers = getallheaders();
            if (is_array($headers)) {
                foreach ($headers as $key => $headerValue) {
                    if (strcasecmp((string) $key, $name) === 0 && is_string($headerValue)) {
                        return $headerValue;
                    }
                }
            }
        }

        return null;
    }
}
