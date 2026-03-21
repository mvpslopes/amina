<?php
declare(strict_types=1);

final class Slug
{
    public static function slugify(string $text): string
    {
        $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text) ?: $text;
        $t = strtolower($t);
        $t = preg_replace('/[^a-z0-9]+/', '-', $t) ?? 'item';
        $t = trim($t, '-');
        $t = substr($t, 0, 120);
        return $t !== '' ? $t : 'item';
    }

    public static function unique(PDO $pdo, string $table, string $base, ?int $excludeId = null): string
    {
        $allowed = ['products', 'collections'];
        if (!in_array($table, $allowed, true)) {
            throw new InvalidArgumentException('Tabela inválida');
        }
        $slug = self::slugify($base);
        $n = 0;
        while (true) {
            $candidate = $n > 0 ? $slug . '-' . $n : $slug;
            $st = $pdo->prepare("SELECT id FROM `{$table}` WHERE slug = ?");
            $st->execute([$candidate]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if (!$row || (int) $row['id'] === $excludeId) {
                return $candidate;
            }
            $n++;
        }
    }
}
