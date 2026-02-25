<?php

declare(strict_types=1);

namespace App;

final class Env
{
    /**
     * @return array<string, string>
     */
    public static function load(string $filePath): array
    {
        $env = [];

        if (is_file($filePath)) {
            $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
            foreach ($lines as $line) {
                $trimmed = trim($line);
                if ($trimmed === '' || str_starts_with($trimmed, '#')) {
                    continue;
                }

                $delimiterPosition = strpos($trimmed, '=');
                if ($delimiterPosition === false) {
                    continue;
                }

                $key = trim(substr($trimmed, 0, $delimiterPosition));
                $value = trim(substr($trimmed, $delimiterPosition + 1));
                $value = trim($value, " \t\n\r\0\x0B\"'");
                $env[$key] = $value;
            }
        }

        foreach ($_ENV as $key => $value) {
            if (!array_key_exists($key, $env) && is_string($value)) {
                $env[$key] = $value;
            }
        }

        return $env;
    }
}
