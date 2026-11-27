<?php

namespace App\Domains\Kitchen;

use Illuminate\Support\Facades\Validator;

final class KitchenDisplay
{
    public static function defaults(): array
    {
        return ['schema_version' => 1, 'labels' => ['new' => 'Nuevas', 'preparing' => 'En preparación', 'ready' => 'Terminadas', 'delivered' => 'Entregadas', 'cancelled' => 'Canceladas'],
            'warning_minutes' => 0, 'overdue_alert' => true];
    }

    public static function validate(array $value, int $target): array
    {
        $rules = ['settings' => ['required', 'array:schema_version,labels,warning_minutes,overdue_alert'],
            'settings.schema_version' => ['required', 'integer', 'in:1'],
            'settings.labels' => ['required', 'array:new,preparing,ready,delivered,cancelled'],
            'settings.warning_minutes' => ['required', 'integer', 'between:0,'.min(60, $target)],
            'settings.overdue_alert' => ['required', 'boolean']];
        foreach (array_keys(self::defaults()['labels']) as $state) {
            $rules['settings.labels.'.$state] = ['required', 'string', 'min:2', 'max:24', 'not_regex:/[<>\x00-\x1F]/u'];
        }
        $result = Validator::make(['settings' => $value], $rules)->validate()['settings'];
        $result['schema_version'] = 1;
        $result['warning_minutes'] = (int) $result['warning_minutes'];
        $result['overdue_alert'] = (bool) $result['overdue_alert'];

        return $result;
    }
}
