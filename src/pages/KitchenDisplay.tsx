import React, { useState, useEffect } from 'react';
import { useOrderStore } from '../store/orderStore';
import { OrderItem } from '../types';
import { CookingPot, CheckCircle, Clock, Fire } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';

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

function KDSCard({ order }: { order: ReturnType<typeof useOrderStore.getState>['orders'][0] }) {
  const { updateItemStatus, updateOrderStatus } = useOrderStore();
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
          <div className="kds-table">{order.items.length} items</div>
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
            <div style={{ display: 'flex', flex: 'column', gap: 4 }}>
              {item.status === 'pending' && (
                <button
                  className="kds-item-status pending"
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => updateItemStatus(order.id, item.id, 'preparing')}
                >
                  Start
                </button>
              )}
              {item.status === 'preparing' && (
                <button
                  className="kds-item-status preparing"
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => updateItemStatus(order.id, item.id, 'ready')}
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
            if (i.status === 'pending') updateItemStatus(order.id, i.id, 'preparing');
          })}
        >
          <Fire size={14} /> Fire All
        </button>
        {allReady && (
          <button
            className="btn btn-sm btn-success"
            style={{ flex: 1 }}
            onClick={() => {
              order.items.forEach((i) => updateItemStatus(order.id, i.id, 'served'));
              updateOrderStatus(order.id, 'ready');
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
  const { getActiveKitchenOrders } = useOrderStore();
  const orders = useOrderStore((s) => s.orders);
  const activeOrders = orders.filter((o) => ['kot_sent', 'preparing'].includes(o.status));

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <TopBar
        title="Kitchen Display System"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge badge-accent"><Clock size={12} /> Live</span>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {activeOrders.length} active order{activeOrders.length !== 1 ? 's' : ''}
            </span>
          </div>
        }
      />
      <div className="page-body">
        {/* Legend */}
        <div style={{ display: 'flex', gap: 'var(--space-5)', marginBottom: 'var(--space-5)', padding: '10px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          {[
            { color: 'var(--timer-fresh)', label: '0–10 min', dot: true },
            { color: 'var(--timer-warn)', label: '10–20 min', dot: true },
            { color: 'var(--timer-urgent)', label: '20+ min', dot: true },
          ].map((l) => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
              {l.label}
            </div>
          ))}
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
              <KDSCard key={order.id} order={order} />
            ))}
          </div>
        )}

      </div>
    </>
  );
}
