<?php

declare(strict_types=1);

namespace App;

use RuntimeException;

final class HttpException extends RuntimeException
{
    private int $statusCode;

    public function __construct(
        string $message,
        int $statusCode
    ) {
        $this->statusCode = $statusCode;
        parent::__construct($message);
    }

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}
