<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    protected $fillable = ['key', 'value', 'group', 'type', 'label', 'description'];

    public static function value(string $key, mixed $default = null): mixed
    {
        return static::query()->where('key', $key)->value('value') ?? $default;
    }

    public static function put(string $key, mixed $value, array $metadata = []): self
    {
        return static::query()->updateOrCreate(
            ['key' => $key],
            array_merge([
                'value' => (string) $value,
                'group' => 'general',
                'type' => 'string',
                'label' => $key,
                'description' => null,
            ], $metadata, ['value' => (string) $value]),
        );
    }
}
