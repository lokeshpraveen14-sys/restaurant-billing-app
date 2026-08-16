import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Order, OrderItem, OrderType, OrderStatus } from '../types';
import { supabase } from '../lib/supabase';

interface OrderState {
  orders: Order[];
  activeOrder: Order | null;
  ordersLoaded: boolean;

  createOrder: (tableId: string | undefined, tableNumber: string | undefined, orderType: OrderType, staffId: string, staffName: string, guestCount?: number, coverCharge?: number) => Order;
  setActiveOrder: (order: Order | null) => void;
  addItemToOrder: (orderId: string, item: Omit<OrderItem, 'id' | 'status'>) => void;
  removeItemFromOrder: (orderId: string, itemId: string) => void;
  updateItemQty: (orderId: string, itemId: string, qty: number) => void;
  updateItemNote: (orderId: string, itemId: string, note: string) => void;
  submitKOT: (orderId: string) => void;
  updateItemStatus: (orderId: string, itemId: string, status: OrderItem['status']) => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  voidOrder: (orderId: string, reason: string) => void;
  getOrderByTable: (tableId: string) => Order | undefined;
  getActiveKitchenOrders: () => Order[];
  fetchActiveOrders: () => Promise<void>;
  initOrderSync: () => void;
}

// Map a raw DB row to an Order object
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
    syncStatus: 'synced' as const,
    guestCount: o.guest_count || undefined,
    coverCharge: o.cover_charge || undefined,
    createdAt: new Date(o.created_at),
    updatedAt: new Date(o.updated_at),
    kotPrintedAt: o.kot_printed_at ? new Date(o.kot_printed_at) : undefined,
  };
}

const syncOrderToDB = async (order: Order) => {
  const { error } = await supabase.from('orders').upsert({
    id: order.id,
    local_id: order.localId,
    table_id: order.tableId || null,
    table_number: order.tableNumber || null,
    order_type: order.orderType,
    status: order.status,
    staff_id: order.staffId,
    staff_name: order.staffName,
    items: order.items,
    guest_count: order.guestCount || null,
    cover_charge: order.coverCharge || null,
    created_at: order.createdAt.toISOString(),
    updated_at: new Date().toISOString(),
    kot_printed_at: order.kotPrintedAt?.toISOString() || null,
  });
  if (error) {
    console.error('Failed to sync order to DB:', error);
  }
};

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: [],
      activeOrder: null,
      ordersLoaded: false,

      createOrder: (tableId, tableNumber, orderType, staffId, staffName, guestCount, coverCharge) => {
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
          coverCharge,
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
            return { ...o, items: [...o.items, newItem], updatedAt: new Date() };
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
              ? { ...o, items: o.items.filter((i) => i.id !== itemId), updatedAt: new Date() }
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
              ? { ...o, items: o.items.map((i) => (i.id === itemId ? { ...i, note } : i)) }
              : o
          ),
        }));
        const order = get().orders.find((o) => o.id === orderId);
        if (order) syncOrderToDB(order);
      },

      submitKOT: (orderId) => {
        const order = get().orders.find((o) => o.id === orderId);
        if (!order) return;
        const updated = { ...order, status: 'kot_sent' as OrderStatus, kotPrintedAt: new Date() };
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
        set((state) => ({
          orders: state.orders.map((o) => (o.id === orderId ? { ...o, status } : o)),
        }));
        const order = get().orders.find((o) => o.id === orderId);
        if (order) syncOrderToDB(order);
      },

      voidOrder: (orderId, _reason) => {
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === orderId
              ? { ...o, status: 'void', items: o.items.map((i) => ({ ...i, status: 'void' as const })) }
              : o
          ),
        }));
        const order = get().orders.find((o) => o.id === orderId);
        if (order) syncOrderToDB(order);
      },

      getOrderByTable: (tableId) => {
        return get().orders.find(
          (o) => o.tableId === tableId && ['open', 'kot_sent', 'preparing', 'ready'].includes(o.status)
        );
      },

      getActiveKitchenOrders: () => {
        return get().orders.filter((o) => ['kot_sent', 'preparing', 'ready'].includes(o.status));
      },

      fetchActiveOrders: async () => {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .in('status', ['open', 'kot_sent', 'preparing', 'ready']);

        if (!error && data) {
          const dbOrders = data.map(mapDbOrder);
          // Merge: DB is authoritative for status. Preserve local orders not yet in DB.
          set((state) => {
            const dbIds = new Set(dbOrders.map(o => o.id));
            // Keep local-only orders that haven't made it to DB yet
            const localOnly = state.orders.filter(
              o => !dbIds.has(o.id) && ['open', 'kot_sent', 'preparing', 'ready'].includes(o.status)
            );
            return { orders: [...dbOrders, ...localOnly], ordersLoaded: true };
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
                    newOrders[idx] = mappedOrder;
                  } else {
                    newOrders.push(mappedOrder);
                  }

                  return {
                    orders: newOrders,
                    activeOrder: state.activeOrder?.id === mappedOrder.id ? mappedOrder : state.activeOrder,
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
      // Only persist orders and activeOrder — NOT ordersLoaded (always starts false)
      partialize: (state) => ({
        orders: state.orders,
        activeOrder: state.activeOrder,
      }),
    }
  )
);
