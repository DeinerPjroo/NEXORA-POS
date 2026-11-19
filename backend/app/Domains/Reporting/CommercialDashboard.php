<?php

namespace App\Domains\Reporting;

use App\Domains\Sales\SaleBalance;
use App\Domains\Sales\SaleTotals;
use App\Models\Branch;
use App\Models\CashMovement;
use App\Models\CashSession;
use App\Models\DiningSessionTable;
use App\Models\Order;
use App\Models\OrderCombo;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\SaleRefund;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class CommercialDashboard
{
    public function read(User $actor, array $data): array
    {
        Gate::authorize('dashboard.view');

        return DB::transaction(function () use ($actor, $data) {
            $company = $actor->tenant()->firstOrFail();
            $timezone = $company->timezone;
            $today = CarbonImmutable::now($timezone)->startOfDay();
            $from = CarbonImmutable::createFromFormat('!Y-m-d', $data['from'] ?? $today->startOfMonth()->toDateString(), $timezone);
            $to = CarbonImmutable::createFromFormat('!Y-m-d', $data['to'] ?? $today->toDateString(), $timezone);
            $days = (int) $from->diffInDays($to) + 1;
            if ($to->lt($from) || $days < 1 || $days > 93) {
                throw ValidationException::withMessages(['to' => 'Selecciona un periodo de 1 a 93 días, con fecha final igual o posterior a la inicial.']);
            }
            $end = $to->addDay();
            $previous = $from->subDays($days);
            $branch = isset($data['branch_id']) ? (int) $data['branch_id'] : null;
            $financial = null;
            if ($actor->can('sales.view')) {
                $current = $this->financial($from, $end, $branch, $timezone, $company->currency, true);
                $prior = $this->financial($previous, $from, $branch, $timezone, $company->currency, false);
                $currencies = array_unique([...array_keys($current['totals']), ...array_keys($prior['totals'])]);
                sort($currencies);
                $financial = ['currencies' => [], 'series' => array_values($current['series']), 'methods' => array_values($current['methods']), 'hours' => array_values($current['hours']), 'products' => $this->products($from, $end, $branch), 'operators' => $this->operators($current['operators'], $actor->tenant_id)];
                foreach ($currencies as $currency) {
                    $now = $current['totals'][$currency] ?? $this->emptyTotals($currency);
                    $before = $prior['totals'][$currency] ?? $this->emptyTotals($currency);
                    $financial['currencies'][] = ['currency' => $currency, 'current' => $now, 'previous' => $before, 'sales_change' => $this->change($now['sales_total'], $before['sales_total']), 'net_change' => $this->change($now['net_paid_amount'], $before['net_paid_amount'])];
                }
            }

            return ['timezone' => $timezone, 'currency' => $company->currency, 'generated_at' => CarbonImmutable::now()->utc()->toJSON(),
                'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'days' => $days, 'previous_from' => $previous->toDateString(), 'previous_to' => $from->subDay()->toDateString()],
                'branch_id' => $branch, 'branches' => Branch::orderBy('name')->get(['id', 'name', 'is_active']),
                'sales' => $financial, 'cash_expenses' => $actor->can('cash.view') ? $this->cashExpenses($from, $end, $branch) : null,
                'live' => ['orders_active' => $actor->can('orders.view') ? Order::whereIn('status', ['open', 'preparing', 'ready'])->when($branch, fn ($q, $id) => $q->where('branch_id', $id))->count() : null,
                    'tables_occupied' => $actor->can('dining.view') ? DiningSessionTable::whereNull('released_at')->when($branch, fn ($q, $id) => $q->where('branch_id', $id))->count() : null,
                    'cash_sessions_open' => $actor->can('cash.view') ? CashSession::where('status', 'open')->when($branch, fn ($q, $id) => $q->where('branch_id', $id))->count() : null]];
        });
    }

    private function emptyTotals(string $currency): array
    {
        return ['currency' => $currency, 'sales_count' => 0, 'payment_count' => 0, 'refund_count' => 0, ...array_fill_keys(['sales_total', 'applied_amount', 'refunded_amount', 'net_paid_amount', 'balance_due', 'tax_amount', 'tip_amount', 'average_ticket'], '0.0000')];
    }

    private function scope(Builder $query, CarbonImmutable $start, CarbonImmutable $end, ?int $branch, ?string $alias = null): Builder
    {
        $table = $alias ?? $query->getModel()->getTable();

        return $query->where($table.'.created_at', '>=', $start->setTimezone(config('app.timezone'))->format('Y-m-d H:i:s'))->where($table.'.created_at', '<', $end->setTimezone(config('app.timezone'))->format('Y-m-d H:i:s'))->when($branch, fn ($q, $id) => $q->where($table.'.branch_id', $id));
    }

    private function financial(CarbonImmutable $start, CarbonImmutable $end, ?int $branch, string $timezone, string $currency, bool $details): array
    {
        $totals = [$currency => $this->emptyTotals($currency)];
        $series = [];
        $methods = [];
        $hours = [];
        $operators = [];
        $ensure = function (string $code) use (&$totals) {
            $totals[$code] ??= $this->emptyTotals($code);
        };
        $daily = function (string $code, $at) use (&$series, $timezone) {
            $day = CarbonImmutable::instance($at)->setTimezone($timezone)->toDateString();
            $key = $code.':'.$day;
            $series[$key] ??= ['currency' => $code, 'date' => $day, 'sales_count' => 0, 'sales_total' => '0.0000', 'applied_amount' => '0.0000', 'refunded_amount' => '0.0000', 'net_paid_amount' => '0.0000'];

            return $key;
        };
        foreach ($this->scope(Sale::query(), $start, $end, $branch)->with(['payments:id,tenant_id,sale_id,amount', 'refunds:id,tenant_id,sale_id,amount'])->lazyById(300) as $sale) {
            $code = $sale->currency;
            $ensure($code);
            $t = &$totals[$code];
            $t['sales_count']++;
            foreach (['sales_total' => 'total', 'tax_amount' => 'tax_amount', 'tip_amount' => 'tip_amount'] as $metric => $attribute) {
                $t[$metric] = bcadd($t[$metric], $sale->{$attribute} ?? '0', 4);
            }
            $t['balance_due'] = bcadd($t['balance_due'], app(SaleBalance::class)->amounts($sale)['balance_due'], 4);
            unset($t);
            if (! $details) {
                continue;
            }
            $key = $daily($code, $sale->created_at);
            $series[$key]['sales_count']++;
            $series[$key]['sales_total'] = bcadd($series[$key]['sales_total'], $sale->total, 4);
            $hour = CarbonImmutable::instance($sale->created_at)->setTimezone($timezone)->format('H');
            $key = $code.':'.$hour;
            $hours[$key] ??= ['currency' => $code, 'hour' => $hour, 'count' => 0, 'amount' => '0.0000'];
            $hours[$key]['count']++;
            $hours[$key]['amount'] = bcadd($hours[$key]['amount'], $sale->total, 4);
            $key = $code.':'.$sale->created_by;
            $operators[$key] ??= ['currency' => $code, 'user_id' => $sale->created_by, 'count' => 0, 'amount' => '0.0000'];
            $operators[$key]['count']++;
            $operators[$key]['amount'] = bcadd($operators[$key]['amount'], $sale->total, 4);
        }
        foreach ($this->scope(Payment::query(), $start, $end, $branch)->with('sale:id,tenant_id,currency')->lazyById(500) as $payment) {
            $code = $payment->sale->currency;
            $ensure($code);
            $totals[$code]['payment_count']++;
            $totals[$code]['applied_amount'] = bcadd($totals[$code]['applied_amount'], $payment->amount, 4);
            if (! $details) {
                continue;
            }
            $key = $daily($code, $payment->created_at);
            $series[$key]['applied_amount'] = bcadd($series[$key]['applied_amount'], $payment->amount, 4);
            $key = $this->methodKey($code, $payment);
            $methods[$key] ??= $this->method($code, $payment);
            $methods[$key]['payment_count']++;
            $methods[$key]['applied_amount'] = bcadd($methods[$key]['applied_amount'], $payment->amount, 4);
        }
        foreach ($this->scope(SaleRefund::query(), $start, $end, $branch)->with(['sale:id,tenant_id,currency', 'payment:id,tenant_id,payment_method_id,method_name,method_kind'])->lazyById(500) as $refund) {
            $code = $refund->sale->currency;
            $ensure($code);
            $totals[$code]['refund_count']++;
            $totals[$code]['refunded_amount'] = bcadd($totals[$code]['refunded_amount'], $refund->amount, 4);
            if (! $details) {
                continue;
            }
            $key = $daily($code, $refund->created_at);
            $series[$key]['refunded_amount'] = bcadd($series[$key]['refunded_amount'], $refund->amount, 4);
            $key = $this->methodKey($code, $refund->payment);
            $methods[$key] ??= $this->method($code, $refund->payment);
            $methods[$key]['refund_count']++;
            $methods[$key]['refunded_amount'] = bcadd($methods[$key]['refunded_amount'], $refund->amount, 4);
        }
        foreach ($totals as &$total) {
            $total['net_paid_amount'] = bcsub($total['applied_amount'], $total['refunded_amount'], 4);
            $total['average_ticket'] = $total['sales_count'] ? SaleTotals::round(bcdiv($total['sales_total'], (string) $total['sales_count'], 8)) : '0.0000';
        }unset($total);
        if ($details) {
            foreach (array_keys($totals) as $code) {
                for ($day = $start; $day->lt($end); $day = $day->addDay()) {
                    $daily($code, $day);
                }
            }
            foreach ($series as &$row) {
                $row['net_paid_amount'] = bcsub($row['applied_amount'], $row['refunded_amount'], 4);
            }unset($row);
            foreach ($methods as &$row) {
                $row['net_paid_amount'] = bcsub($row['applied_amount'], $row['refunded_amount'], 4);
            }unset($row);
            ksort($series);
            ksort($hours);
            ksort($methods);
        }

        return compact('totals', 'series', 'methods', 'hours', 'operators');
    }

    private function methodKey(string $currency, ?Payment $payment): string
    {
        return $currency.':'.($payment?->payment_method_id ?? 'legacy').':'.($payment?->method_kind ?? 'unknown').':'.($payment?->method_name ?? 'Sin referencia histórica');
    }

    private function method(string $currency, ?Payment $payment): array
    {
        return ['currency' => $currency, 'name' => $payment?->method_name ?? 'Sin referencia histórica', 'kind' => $payment?->method_kind ?? 'unknown', 'payment_count' => 0, 'refund_count' => 0, 'applied_amount' => '0.0000', 'refunded_amount' => '0.0000', 'net_paid_amount' => '0.0000'];
    }

    private function change(string $current, string $previous): array
    {
        $difference = bcsub($current, $previous, 4);
        $percent = null;
        if (bccomp($previous, '0', 4) > 0) {
            $raw = bcdiv(bcmul($difference, '100', 8), $previous, 8);
            $percent = bcadd($raw, bccomp($raw, '0', 8) < 0 ? '-0.005' : '0.005', 2);
        }

        return ['amount' => $difference, 'percent' => $percent];
    }

    private function products(CarbonImmutable $from, CarbonImmutable $end, ?int $branch): array
    {
        $products = [];
        foreach ([OrderItem::class, OrderCombo::class] as $model) {
            $table = (new $model)->getTable();
            $q = $model::query()->join('sales as report_sales', fn ($j) => $j->on('report_sales.order_id', '=', $table.'.order_id')->on('report_sales.tenant_id', '=', $table.'.tenant_id'));
            if ($model === OrderItem::class) {
                $q->whereNull($table.'.order_combo_id');
            }
            foreach ($this->scope($q, $from, $end, $branch, 'report_sales')->orderBy($table.'.id')->select($table.'.id', $table.'.product_id', $table.'.product_name', $table.'.quantity', 'report_sales.currency')->cursor() as $item) {
                $key = $item->currency.':'.$item->product_id;
                $products[$key] ??= ['currency' => $item->currency, 'product_id' => $item->product_id, 'name' => $item->product_name, 'quantity' => 0];
                $products[$key]['name'] = $item->product_name;
                $products[$key]['quantity'] += $item->quantity;
            }
        }
        usort($products, fn ($a, $b) => $b['quantity'] <=> $a['quantity'] ?: $a['product_id'] <=> $b['product_id']);
        // Máximo diez por moneda; no truncar otras monedas por un ranking global.
        $counts = [];

        return array_values(array_filter($products, function ($p) use (&$counts) {
            return ($counts[$p['currency']] = ($counts[$p['currency']] ?? 0) + 1) <= 10;
        }));
    }

    private function operators(array $rows, int $tenant): array
    {
        usort($rows, fn ($a, $b) => $b['count'] <=> $a['count'] ?: $a['user_id'] <=> $b['user_id']);
        $counts = [];
        $rows = array_values(array_filter($rows, function ($r) use (&$counts) {
            return ($counts[$r['currency']] = ($counts[$r['currency']] ?? 0) + 1) <= 10;
        }));
        $names = User::where('tenant_id', $tenant)->whereIn('id', array_column($rows, 'user_id'))->pluck('name', 'id');

        return array_map(fn ($r) => [...$r, 'name' => $names[$r['user_id']] ?? 'Usuario histórico'], $rows);
    }

    private function cashExpenses(CarbonImmutable $from, CarbonImmutable $end, ?int $branch): array
    {
        $q = CashMovement::query()->join('cash_sessions as report_sessions', fn ($j) => $j->on('report_sessions.id', '=', 'cash_movements.cash_session_id')->on('report_sessions.tenant_id', '=', 'cash_movements.tenant_id'))
            ->where('cash_movements.type', 'expense')->whereNotIn('cash_movements.id', SaleRefund::whereNotNull('cash_movement_id')->select('cash_movement_id'))
            ->where('cash_movements.created_at', '>=', $from->setTimezone(config('app.timezone'))->format('Y-m-d H:i:s'))->where('cash_movements.created_at', '<', $end->setTimezone(config('app.timezone'))->format('Y-m-d H:i:s'))->when($branch, fn ($q, $id) => $q->where('report_sessions.branch_id', $id));
        $totals = [];
        foreach ($q->orderBy('cash_movements.id')->select('cash_movements.id', 'cash_movements.amount', 'report_sessions.currency')->cursor() as $movement) {
            $code = $movement->currency;
            $totals[$code] ??= ['currency' => $code, 'count' => 0, 'amount' => '0.0000'];
            $totals[$code]['count']++;
            $totals[$code]['amount'] = bcadd($totals[$code]['amount'], $movement->amount, 4);
        }ksort($totals);

        return array_values($totals);
    }
}
