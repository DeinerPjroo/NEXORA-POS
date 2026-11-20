<?php
namespace App\Domains\Kitchen;
use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\{Order, User, PreparationCorrection, KitchenTicket, KitchenTicketLine, KitchenTicketEvent, OrderEvent};
use Illuminate\Support\Facades\Gate;
final class CorrectPreparation {
 public function execute(User $actor, Order $order, array $data): Order {
  Gate::authorize('orders.manage'); Gate::authorize('orders.view');
  return app(IdempotentOperation::class)->run($actor,'order.preparation.'.$order->id,$data,Order::class,function($data) use($actor,$order){
   $order=Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
   abort_unless($order->revision===(int)$data['order_revision'],409,'El pedido cambió. Actualiza antes de corregir.');
   abort_if(in_array($order->status,['cancelled','delivered'],true),409,'No se corrige un pedido cancelado o entregado.');
   abort_if($data['destination']==='table' && ($order->channel!=='dine_in' || !$order->dining_session_id),422,'Este pedido no corresponde a una mesa.');
   $items=$order->items()->whereIn('id',$data['item_ids'])->with('preparationCorrections')->lockForUpdate()->get();
   abort_unless($items->count()===count($data['item_ids']),404);
   $ticketIds=KitchenTicketLine::where('order_id',$order->id)->whereIn('order_item_id',$data['item_ids'])->pluck('kitchen_ticket_id')->unique();
   $tickets=KitchenTicket::whereIn('id',$ticketIds)->lockForUpdate()->get();
   abort_if($tickets->contains(fn($t)=>in_array($t->status,['delivered','cancelled'],true)),409,'La comanda ya fue entregada o cancelada.');
   foreach($items as $item){
    $from=$item->destination($order->channel);
    abort_if($from===$data['destination'],409,'El destino ya coincide. Actualiza el pedido.');
    PreparationCorrection::create(['order_id'=>$order->id,'order_item_id'=>$item->id,'actor_id'=>$actor->id,'from_destination'=>$from,'to_destination'=>$data['destination'],'reason'=>$data['reason'],'created_at'=>now()]);
   }
   foreach($tickets as $ticket){
    $ticket->revision++; $ticket->save();
    KitchenTicketEvent::create(['order_id'=>$order->id,'kitchen_ticket_id'=>$ticket->id,'actor_id'=>$actor->id,'from_status'=>$ticket->status,'to_status'=>$ticket->status,'reason'=>'Corrección de destino: '.$data['reason'],'created_at'=>now()]);
   }
   $order->revision++; $order->save();
   OrderEvent::create(['order_id'=>$order->id,'actor_id'=>$actor->id,'from_status'=>$order->status,'to_status'=>$order->status,'reason'=>'Corrección de destino: '.$data['reason'],'created_at'=>now()]);
   Audit::record('order.preparation.corrected','Se corrigieron instrucciones de servir/empacar.',$actor,['order_id'=>$order->id,'item_ids'=>$data['item_ids'],'destination'=>$data['destination']]);
   return $order;
  });
 }
}
