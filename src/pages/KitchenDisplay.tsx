import React, { useState, useEffect, useRef } from 'react';
import { useOrderStore } from '../store/orderStore';
import { supabase } from '../lib/supabase';
import { Order, OrderItem, OrderType, OrderStatus } from '../types';
import { CookingPot, CheckCircle, Clock, Fire, ArrowClockwise } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';

// Helper to map a DB row to Order
function mapDbOrder(o: any): Order {
  return {
    id: o.id,
    localId: o.local_id,
    tableId: o.table_id || undefined,
    tableNumber: o.table_number || undefined,
    orderType: o.order_type as OrderType,
    status: o.status as OrderStatus,
    staffId: o.staff_id,
    staffName: o.staff_name,
    items: (o.items || []) as OrderItem[],
    syncStatus: 'synced',
    guestCount: o.guest_count || undefined,
    createdAt: new Date(o.created_at),
    updatedAt: new Date(o.updated_at),
    kotPrintedAt: o.kot_printed_at ? new Date(o.kot_printed_at) : undefined,
  };
}

function useElapsed(since: Date) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(since).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [since]);
  return elapsed;
}

function KDSTimer({ since }: { since: Date }) {
  const elapsed = useElapsed(since);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const urgency = mins >= 20 ? 'urgent' : mins >= 10 ? 'warn' : 'fresh';
  return (
    <div className={`kds-card ${urgency}`}>
      <span className="kds-timer">{String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}</span>
    </div>
  );
}

function KDSCard({ order, onUpdateItemStatus, onUpdateOrderStatus }: {
  order: Order;
  onUpdateItemStatus: (orderId: string, itemId: string, status: OrderItem['status']) => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
}) {
  const elapsed = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
  const urgency = elapsed >= 20 ? 'urgent' : elapsed >= 10 ? 'warn' : 'fresh';
  const allReady = order.items.every((i) => i.status === 'ready' || i.status === 'served' || i.status === 'void');

  return (
    <div className={`kds-card ${urgency}`}>
      <div className="kds-card-header">
        <div>
          <div className="kds-order-num">
            {order.orderType === 'takeaway' ? 'Takeaway' : `Table ${order.tableNumber || '?'}`}
          </div>
          <div className="kds-table">{order.items.length} items • {order.staffName}</div>
        </div>
        <KDSTimer since={order.createdAt} />
      </div>

      <div className="kds-items">
        {order.items.filter((i) => i.status !== 'void').map((item) => (
          <div key={item.id} className="kds-item">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className={`veg-dot ${item.isVeg ? 'veg' : 'nonveg'}`} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                  {item.quantity}x {item.menuItemName}
                </div>
                {item.variantName && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.variantName}</div>}
                {item.note && <div style={{ fontSize: '0.7rem', color: 'var(--status-reserved)', fontStyle: 'italic' }}>"{item.note}"</div>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {item.status === 'pending' && (
                <button
                  className="kds-item-status pending"
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => onUpdateItemStatus(order.id, item.id, 'preparing')}
                >
                  Start
                </button>
              )}
              {item.status === 'preparing' && (
                <button
                  className="kds-item-status preparing"
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => onUpdateItemStatus(order.id, item.id, 'ready')}
                >
                  Preparing
                </button>
              )}
              {item.status === 'ready' && (
                <span className="kds-item-status ready">Ready</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="kds-card-footer">
        <button
          className="btn btn-sm btn-secondary"
          style={{ flex: 1 }}
          onClick={() => order.items.forEach((i) => {
            if (i.status === 'pending') onUpdateItemStatus(order.id, i.id, 'preparing');
          })}
        >
          <Fire size={14} /> Fire All
        </button>
        {allReady && (
          <button
            className="btn btn-sm btn-success"
            style={{ flex: 1 }}
            onClick={() => {
              order.items.forEach((i) => onUpdateItemStatus(order.id, i.id, 'served'));
              onUpdateOrderStatus(order.id, 'ready');
            }}
          >
            <CheckCircle size={14} /> Served
          </button>
        )}
      </div>
    </div>
  );
}

export default function KitchenDisplay() {
  const { updateItemStatus, updateOrderStatus } = useOrderStore();

  // KDS manages its own independent orders state fetched directly from Supabase
  // This ensures it ALWAYS shows the latest data regardless of other devices' local state
  const [kdsOrders, setKdsOrders] = useState<Order[]>([]);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<any>(null);

  const fetchKitchenOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .in('status', ['kot_sent', 'preparing', 'ready']);

    if (!error && data) {
      setKdsOrders(data.map(mapDbOrder));
      setLastSync(new Date());
    }
  };

  useEffect(() => {
    // 1. Fetch immediately
    fetchKitchenOrders();

    // 2. Polling every 8 seconds as reliable fallback
    const poll = setInterval(fetchKitchenOrders, 8000);

    // 3. Real-time subscription for instant updates
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    channelRef.current = supabase
      .channel('kds:orders:' + Date.now()) // unique channel name avoids conflicts
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const deletedId = (payload.old as any).id;
          setKdsOrders(prev => prev.filter(o => o.id !== deletedId));
          return;
        }

        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const order = mapDbOrder(payload.new);
          const isKitchenStatus = ['kot_sent', 'preparing', 'ready'].includes(order.status);

          setKdsOrders(prev => {
            const idx = prev.findIndex(o => o.id === order.id);
            if (!isKitchenStatus) {
              // Order moved out of kitchen (paid/voided) — remove it
              return prev.filter(o => o.id !== order.id);
            }
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = order;
              return updated;
            }
            return [...prev, order];
          });
          setLastSync(new Date());
        }
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      clearInterval(poll);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  const activeOrders = kdsOrders.filter(o => ['kot_sent', 'preparing'].includes(o.status));

  return (
    <>
      <TopBar
        title="Kitchen Display System"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span
              className="badge"
              style={{
                background: connected ? 'var(--status-free-bg)' : 'var(--status-cleaning-bg)',
                color: connected ? 'var(--status-free)' : 'var(--status-cleaning)',
                display: 'flex', alignItems: 'center', gap: 4
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: connected ? 'var(--status-free)' : 'var(--status-cleaning)',
                display: 'inline-block'
              }} />
              {connected ? 'Live' : 'Connecting...'}
            </span>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {activeOrders.length} active order{activeOrders.length !== 1 ? 's' : ''}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={fetchKitchenOrders}
              title="Refresh"
              style={{ padding: '4px 8px' }}
            >
              <ArrowClockwise size={14} />
            </button>
          </div>
        }
      />
      <div className="page-body">
        {/* Legend */}
        <div style={{ display: 'flex', gap: 'var(--space-5)', marginBottom: 'var(--space-5)', padding: '10px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 'var(--space-5)' }}>
            {[
              { color: 'var(--timer-fresh)', label: '0–10 min' },
              { color: 'var(--timer-warn)', label: '10–20 min' },
              { color: 'var(--timer-urgent)', label: '20+ min' },
            ].map((l) => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Last sync: {lastSync.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>

        {activeOrders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <CookingPot size={36} />
            </div>
            <div className="empty-state-title">Kitchen is clear</div>
            <div className="empty-state-desc">No active orders at the moment. New orders will appear here automatically.</div>
          </div>
        ) : (
          <div className="kds-board">
            {activeOrders.map((order) => (
              <KDSCard
                key={order.id}
                order={order}
                onUpdateItemStatus={updateItemStatus}
                onUpdateOrderStatus={updateOrderStatus}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
