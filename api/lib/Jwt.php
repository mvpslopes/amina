<?php
declare(strict_types=1);

final class Jwt
{
    private static function b64urlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function b64urlDecode(string $data): string
    {
        $pad = 4 - (strlen($data) % 4);
        if ($pad < 4) {
            $data .= str_repeat('=', $pad);
        }
        return (string) base64_decode(strtr($data, '-_', '+/'), true);
    }

    public static function sign(array $payload, string $secret): string
    {
        $header = ['typ' => 'JWT', 'alg' => 'HS256'];
        $segments = [
            self::b64urlEncode(json_encode($header, JSON_UNESCAPED_SLASHES)),
            self::b64urlEncode(json_encode($payload, JSON_UNESCAPED_SLASHES)),
        ];
        $signing = implode('.', $segments);
        $sig = hash_hmac('sha256', $signing, $secret, true);
        $segments[] = self::b64urlEncode($sig);
        return implode('.', $segments);
    }

    /** @return array<string,mixed>|null */
    public static function verify(string $token, string $secret): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }
        $signing = $parts[0] . '.' . $parts[1];
        $sig = self::b64urlDecode($parts[2]);
        $expected = hash_hmac('sha256', $signing, $secret, true);
        if (!hash_equals($expected, $sig)) {
            return null;
        }
        $payload = json_decode(self::b64urlDecode($parts[1]), true);
        if (!is_array($payload)) {
            return null;
        }
        if (($payload['exp'] ?? 0) < time()) {
            return null;
        }
        return $payload;
    }
}
