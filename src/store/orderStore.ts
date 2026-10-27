import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useUIStore } from './uiStore';
import { useTableStore } from './tableStore';
import { Order, OrderItem, OrderType, OrderStatus } from '../types';
import { supabase } from '../lib/supabase';

interface OrderState {
  orders: Order[];
  activeOrder: Order | null;
  ordersLoaded: boolean;

  createOrder: (tableId: string | undefined, tableNumber: string | undefined, orderType: OrderType, staffId: string, staffName: string, guestCount?: number, seats?: number[]) => Order;
  recreateOrderWithItems: (tableId: string | undefined, tableNumber: string | undefined, orderType: OrderType, staffId: string, staffName: string, guestCount: number | undefined, items: Omit<OrderItem, 'id' | 'status'>[]) => Order;
  setActiveOrder: (order: Order | null) => void;
  addItemToOrder: (orderId: string, item: Omit<OrderItem, 'id' | 'status'>) => void;
  removeItemFromOrder: (orderId: string, itemId: string) => void;
  updateItemQty: (orderId: string, itemId: string, qty: number) => void;
  updateItemNote: (orderId: string, itemId: string, note: string) => void;
  submitKOT: (orderId: string) => void;
  updateItemStatus: (orderId: string, itemId: string, status: OrderItem['status']) => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  voidOrder: (orderId: string, reason: string) => void;
  getOrdersByTable: (tableId: string, tableNumber?: string) => Order[];
  getActiveKitchenOrders: () => Order[];
  fetchActiveOrders: () => Promise<void>;
  initOrderSync: () => void;
}

// Map a raw DB row to an Order object
function mapDbOrder(o: any): Order {
  let tableNumber = o.table_number !== null && o.table_number !== undefined ? String(o.table_number) : undefined;
  if (o.table_id) {
    try {
      const table = useTableStore.getState().tables.find(t => t.id === o.table_id);
      if (table && table.number) {
        tableNumber = table.number;
      }
    } catch (_) {}
  }

  return {
    id: o.id,
    localId: o.local_id,
    tableId: o.table_id || undefined,
    tableNumber,
    orderType: o.order_type as OrderType,
    status: o.status as OrderStatus,
    staffId: o.staff_id,
    staffName: o.staff_name,
    items: (o.items || []) as OrderItem[],
    syncStatus: 'synced' as const,
    guestCount: o.guest_count || undefined,
    seats: o.seats || undefined,
    createdAt: new Date(o.created_at),
    updatedAt: new Date(o.updated_at),
    kotPrintedAt: o.kot_printed_at ? new Date(o.kot_printed_at) : undefined,
  };
}

const syncOrderToDB = async (order: Order) => {
  // Only pass table_id if it's a valid UUID, otherwise pass null to avoid postgres uuid syntax error
  const isValidUUID = (id: string | null | undefined) => Boolean(id && id.length === 36);
  
  const payload: any = {
    id: order.id,
    table_id: isValidUUID(order.tableId) ? order.tableId : null,
    table_number: order.tableNumber || null,
    order_type: order.orderType,
    status: order.status,
    staff_id: order.staffId,
    staff_name: order.staffName,
    guest_count: order.guestCount || 1,
    items: order.items,
    kot_printed: Boolean(order.kotPrintedAt),
    created_at: new Date(order.createdAt).toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('orders').upsert(payload);
  if (error) {
    console.error('Failed to sync order to DB:', error);
    // If postgres table_number column is integer (22P02), fallback by parsing number or setting null
    // so the order and its cart items are STILL successfully saved in DB!
    if (error.code === '22P02' || error.message?.includes('integer')) {
      const numOnly = parseInt(String(order.tableNumber || '').replace(/\D/g, ''), 10);
      payload.table_number = isNaN(numOnly) ? null : numOnly;
      const { error: retryError } = await supabase.from('orders').upsert(payload);
      if (retryError) {
        console.error('Retry syncing order to DB failed:', retryError);
      } else {
        console.log('✅ Order synced to DB with fallback table_number');
      }
    }
  }
};

const deleteOrderFromDB = async (orderId: string) => {
  const { error } = await supabase.from('orders').delete().eq('id', orderId);
  if (error) {
    console.error('Failed to delete order from DB:', error);
  }
};

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: [],
      activeOrder: null,
      ordersLoaded: false,

      createOrder: (tableId, tableNumber, orderType, staffId, staffName, guestCount, seats) => {
        const newOrder: Order = {
          id: crypto.randomUUID(),
          localId: crypto.randomUUID(),
          tableId,
          tableNumber,
          orderType,
          items: [],
          status: 'open',
          syncStatus: 'local',
          staffId,
          staffName,
          guestCount,
          seats,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        set((state) => ({ orders: [...state.orders, newOrder], activeOrder: newOrder }));
        syncOrderToDB(newOrder);
        return newOrder;
      },

      recreateOrderWithItems: (tableId, tableNumber, orderType, staffId, staffName, guestCount, items) => {
        const populatedItems: OrderItem[] = items.map(item => ({
          ...item,
          id: crypto.randomUUID(),
          status: 'pending'
        }));

        const newOrder: Order = {
          id: crypto.randomUUID(),
          localId: crypto.randomUUID(),
          tableId,
          tableNumber,
          orderType,
          items: populatedItems,
          status: 'open',
          syncStatus: 'local',
          staffId,
          staffName,
          guestCount,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        set((state) => ({ orders: [...state.orders, newOrder], activeOrder: newOrder }));
        syncOrderToDB(newOrder);
        return newOrder;
      },

      setActiveOrder: (order) => set({ activeOrder: order }),

      addItemToOrder: (orderId, item) => {
        const newItemId = crypto.randomUUID();
        set((state) => {
          const updatedOrders = state.orders.map((o) => {
            if (o.id !== orderId) return o;
            const newItem: OrderItem = { ...item, id: newItemId, status: 'pending' };
            return { ...o, items: [...o.items, newItem], updatedAt: new Date(), _localUpdatedAt: Date.now() };
          });
          return {
            orders: updatedOrders,
            activeOrder: state.activeOrder?.id === orderId ? updatedOrders.find(o => o.id === orderId) : state.activeOrder,
          };
        });
        const order = get().orders.find((o) => o.id === orderId);
        if (order) syncOrderToDB(order);
      },

      removeItemFromOrder: (orderId, itemId) => {
        set((state) => {
          const updatedOrders = state.orders.map((o) =>
            o.id === orderId
              ? { ...o, items: o.items.filter((i) => i.id !== itemId), updatedAt: new Date(), _localUpdatedAt: Date.now() }
              : o
          );
          return {
            orders: updatedOrders,
            activeOrder: state.activeOrder?.id === orderId ? updatedOrders.find(o => o.id === orderId) : state.activeOrder,
          };
        });
        const order = get().orders.find((o) => o.id === orderId);
        if (order) syncOrderToDB(order);
      },

      updateItemQty: (orderId, itemId, qty) => {
        if (qty <= 0) {
          get().removeItemFromOrder(orderId, itemId);
          return;
        }
        set((state) => {
          const updatedOrders = state.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  items: o.items.map((i) =>
                    i.id === itemId ? { ...i, quantity: qty, totalPrice: i.unitPrice * qty } : i
                  ),
                  updatedAt: new Date(),
                  _localUpdatedAt: Date.now()
                }
              : o
          );
          return {
            orders: updatedOrders,
            activeOrder: state.activeOrder?.id === orderId ? updatedOrders.find(o => o.id === orderId) : state.activeOrder,
          };
        });
        const order = get().orders.find((o) => o.id === orderId);
        if (order) syncOrderToDB(order);
      },

      updateItemNote: (orderId, itemId, note) => {
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === orderId
              ? { ...o, items: o.items.map((i) => (i.id === itemId ? { ...i, note } : i)), _localUpdatedAt: Date.now() }
              : o
          ),
        }));
        const order = get().orders.find((o) => o.id === orderId);
        if (order) syncOrderToDB(order);
      },

      submitKOT: (orderId) => {
        const order = get().orders.find((o) => o.id === orderId);
        if (!order) return;
        
        // Mark current items as printed by setting printedQuantity to current quantity
        const updatedItems = order.items.map(item => ({
          ...item,
          printedQuantity: item.quantity
        }));

        const updated = { 
          ...order, 
          items: updatedItems,
          status: 'kot_sent' as OrderStatus, 
          kotPrintedAt: new Date() 
        };
        
        set((state) => ({
          orders: state.orders.map((o) => (o.id === orderId ? updated : o)),
          activeOrder: state.activeOrder?.id === orderId ? updated : state.activeOrder,
        }));
        syncOrderToDB(updated);
      },

      updateItemStatus: (orderId, itemId, status) => {
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === orderId
              ? { ...o, items: o.items.map((i) => (i.id === itemId ? { ...i, status } : i)) }
              : o
          ),
        }));
        const order = get().orders.find((o) => o.id === orderId);
        if (order) syncOrderToDB(order);
      },

      updateOrderStatus: (orderId, status) => {
        set((state) => {
          // For terminal statuses, remove from active list immediately so UI clears instantly
          if (status === 'paid' || status === 'void') {
            return {
              orders: state.orders.filter(o => o.id !== orderId),
              activeOrder: state.activeOrder?.id === orderId ? null : state.activeOrder,
            };
          }
          return { orders: state.orders.map((o) => (o.id === orderId ? { ...o, status } : o)) };
        });
        // Persist to DB — paid/void triggers delete, others trigger update
        if (status === 'paid' || status === 'void') {
          deleteOrderFromDB(orderId);
        } else {
          const order = get().orders.find((o) => o.id === orderId);
          if (order) syncOrderToDB(order);
        }
      },

      voidOrder: (orderId, _reason) => {
        // Remove from state immediately so it's never persisted in a stale 'void' state.
        // (matching what updateOrderStatus does for 'void' / 'paid')
        set((state) => ({
          orders: state.orders.filter((o) => o.id !== orderId),
          activeOrder: state.activeOrder?.id === orderId ? null : state.activeOrder,
        }));
        deleteOrderFromDB(orderId);
      },

      getOrdersByTable: (tableId, tableNumber) => {
        return get().orders.filter((o) => {
          if (!['open', 'kot_sent', 'preparing', 'ready'].includes(o.status)) return false;

          // If the order has a tableId, ONLY match by tableId (strict — prevents cross-table ghost orders)
          if (o.tableId) {
            return tableId ? o.tableId === tableId : false;
          }

          // Fallback: order was created without a tableId (legacy / offline) — match by tableNumber only
          return (
            tableNumber &&
            o.tableNumber &&
            String(o.tableNumber).trim().toUpperCase() === String(tableNumber).trim().toUpperCase()
          );
        });
      },

      getActiveKitchenOrders: () => {
        return get().orders.filter((o) => ['kot_sent', 'preparing', 'ready'].includes(o.status));
      },

      fetchActiveOrders: async () => {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .in('status', ['open', 'kot_sent', 'preparing', 'ready'])
          .order('created_at', { ascending: false })
          .limit(3000);

        if (!error && data) {
          let dbOrders = data.map(mapDbOrder);

          // ── ORPHAN CLEANUP ───────────────────────────────────────────────────────────
          // Cross-check: if a 'paid' bill already exists for an 'open' order in DB,
          // that order was paid but never closed (crash/race). Delete it from DB now
          // so it never re-appears as an occupied table.
          if (dbOrders.length > 0) {
            const orderIds = dbOrders.map(o => o.id);
            const { data: billRows } = await supabase
              .from('bills')
              .select('order_id')
              .in('order_id', orderIds)
              .not('status', 'eq', 'void');

            if (billRows && billRows.length > 0) {
              const billedOrderIds = new Set(billRows.map((b: any) => b.order_id));
              const orphans = dbOrders.filter(o => billedOrderIds.has(o.id));
              if (orphans.length > 0) {
                console.warn(`[fetchActiveOrders] Purging ${orphans.length} orphan open order(s) that already have bills:`, orphans.map(o => o.id));
                // Delete each orphan from DB (fire-and-forget)
                orphans.forEach(o => deleteOrderFromDB(o.id));
                // Remove from the list we're about to set into state
                dbOrders = dbOrders.filter(o => !billedOrderIds.has(o.id));
              }
            }
          }
          // ────────────────────────────────────────────────────────────────────────────

          set((state) => {
            const dbIds = new Set(dbOrders.map(o => o.id));
            // Keep local-only orders (offline-created, not yet in DB)
            const localOnly = state.orders.filter(
              o => !dbIds.has(o.id) && ['open', 'kot_sent', 'preparing', 'ready'].includes(o.status)
            );

            // Retry syncing any local-only orders to DB now that we're online
            localOnly.forEach(o => syncOrderToDB(o));

            // DB is authoritative for items/status — merge with local fields not stored in DB
            const mergedDbOrders = dbOrders.map(dbO => {
              const localO = state.orders.find(o => o.id === dbO.id);
              if (localO) {
                return {
                  ...dbO,
                  guestCount: dbO.guestCount ?? localO.guestCount,
                  seats: dbO.seats ?? localO.seats,
                };
              }
              return dbO;
            });

            return { orders: [...mergedDbOrders, ...localOnly], ordersLoaded: true };
          });
        } else {
          // On error, mark loaded anyway so UI doesn't freeze
          set({ ordersLoaded: true });
        }
      },

      initOrderSync: () => {
        // Fetch fresh data from DB immediately
        get().fetchActiveOrders();

        // Remove any stale channel before creating a new one
        const stale = supabase.getChannels().find(c => c.topic === 'realtime:public:orders');
        if (stale) {
          supabase.removeChannel(stale);
        }

        // Subscribe to real-time changes from ALL devices
        supabase
          .channel('public:orders')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'orders' },
            (payload) => {
              if (payload.eventType === 'DELETE') {
                // Remove deleted orders
                const deletedId = (payload.old as any).id;
                set((state) => ({
                  orders: state.orders.filter(o => o.id !== deletedId),
                  activeOrder: state.activeOrder?.id === deletedId ? null : state.activeOrder,
                }));
                return;
              }

              if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
                const mappedOrder = mapDbOrder(payload.new);
                
                // Notify if order just became ready
                const existingOrder = get().orders.find(o => o.id === mappedOrder.id);
                if (mappedOrder.status === 'ready' && existingOrder?.status !== 'ready') {
                  const tableText = mappedOrder.tableNumber ? `Table ${mappedOrder.tableNumber}` : 'Takeaway';
                  useUIStore.getState().addToast({
                    type: 'success',
                    title: 'Food Ready! 🔔',
                    message: `Order is ready for ${tableText}`
                  });
                }

                set((state) => {
                  const newOrders = [...state.orders];
                  const idx = newOrders.findIndex(o => o.id === mappedOrder.id);

                  // If order is now void/paid/complete, remove it from active list
                  if (['void', 'paid', 'complete'].includes(mappedOrder.status)) {
                    return {
                      orders: newOrders.filter(o => o.id !== mappedOrder.id),
                      activeOrder: state.activeOrder?.id === mappedOrder.id ? null : state.activeOrder,
                    };
                  }

                  if (idx >= 0) {
                    const existingLocal = newOrders[idx];

                    // PREVENT UI JUMPING / RACE CONDITION
                    // If we locally modified this order within the last 2 seconds, ignore incoming broadcasts
                    // because they are highly likely to be stale echoes of our own rapid clicks.
                    const timeSinceLocalUpdate = Date.now() - (existingLocal._localUpdatedAt || 0);
                    if (timeSinceLocalUpdate < 2000) {
                      return state;
                    }

                    // Merge: DB is authoritative for items. Preserve local fields not in DB.
                    newOrders[idx] = {
                      ...mappedOrder,
                      guestCount: mappedOrder.guestCount ?? existingLocal.guestCount,
                      seats: mappedOrder.seats ?? existingLocal.seats,
                    };
                  } else {
                    newOrders.push(mappedOrder);
                  }

                  return {
                    orders: newOrders,
                    activeOrder: state.activeOrder?.id === mappedOrder.id ? newOrders.find(o => o.id === mappedOrder.id) ?? state.activeOrder : state.activeOrder,
                  };
                });
              }
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('✅ Real-time KOT sync active');
            }
          });
      },
    }),
    {
      name: 'railway-coach-orders', // localStorage key
      // v2: voidOrder now removes from state immediately — bumping version clears stale
      //     void/paid orders that were persisted by the old bug on ALL devices automatically.
      version: 2,
      migrate: (_persistedState, fromVersion) => {
        // Any device on version < 2 gets a clean slate — Supabase is the source of truth.
        console.log(`[orderStore] Migrating localStorage from v${fromVersion} → v2, clearing stale data.`);
        return { orders: [], activeOrder: null, ordersLoaded: false };
      },
      // Only persist active orders and activeOrder — NOT ordersLoaded (always starts false)
      // This prevents the QuotaExceededError caused by closed/voided orders accumulating in localStorage.
      partialize: (state) => ({
        orders: state.orders.filter(o => ['open', 'kot_sent', 'preparing', 'ready'].includes(o.status)),
        activeOrder: state.activeOrder,
      }),
    }
  )
);
