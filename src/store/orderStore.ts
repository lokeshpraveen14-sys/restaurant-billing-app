import { create } from 'zustand';
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
    kot_printed_at: order.kotPrintedAt?.toISOString() || null
  });
  if (error) {
    console.error('Failed to sync order to DB:', error);
  }
};

export const useOrderStore = create<OrderState>((set, get) => ({
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
        o.id === orderId ? { ...o, status: 'void', items: o.items.map((i) => ({ ...i, status: 'void' as const })) } : o
      ),
    }));
    const order = get().orders.find((o) => o.id === orderId);
    if (order) syncOrderToDB(order);
  },

  getOrderByTable: (tableId) => {
    return get().orders.find((o) => o.tableId === tableId && ['open', 'kot_sent', 'preparing', 'ready'].includes(o.status));
  },

  getActiveKitchenOrders: () => {
    return get().orders.filter((o) => ['kot_sent', 'preparing', 'ready'].includes(o.status));
  },

  fetchActiveOrders: async () => {
    const { data, error } = await supabase.from('orders')
      .select('*')
      .in('status', ['open', 'kot_sent', 'preparing', 'ready']);
    if (!error && data) {
      const dbOrders = data.map(o => ({
        id: o.id,
        localId: o.local_id,
        tableId: o.table_id || undefined,
        tableNumber: o.table_number || undefined,
        orderType: o.order_type as OrderType,
        status: o.status as OrderStatus,
        staffId: o.staff_id,
        staffName: o.staff_name,
        items: o.items as OrderItem[],
        syncStatus: 'synced' as const,
        guestCount: o.guest_count || undefined,
        coverCharge: o.cover_charge || undefined,
        createdAt: new Date(o.created_at),
        updatedAt: new Date(o.updated_at),
        kotPrintedAt: o.kot_printed_at ? new Date(o.kot_printed_at) : undefined
      }));
      set({ orders: dbOrders, ordersLoaded: true });
    } else {
      // Even on error, mark as loaded so the UI doesn't wait forever
      set({ ordersLoaded: true });
    }
  },

  initOrderSync: () => {
    get().fetchActiveOrders();

    // Prevent multiple subscriptions
    const existingChannel = supabase.getChannels().find(c => c.topic === 'realtime:public:orders');
    if (existingChannel) return;

    supabase.channel('public:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          const dbOrder = payload.new;
          set((state) => {
            const mappedOrder = {
              id: dbOrder.id,
              localId: dbOrder.local_id,
              tableId: dbOrder.table_id || undefined,
              tableNumber: dbOrder.table_number || undefined,
              orderType: dbOrder.order_type as OrderType,
              status: dbOrder.status as OrderStatus,
              staffId: dbOrder.staff_id,
              staffName: dbOrder.staff_name,
              items: dbOrder.items as OrderItem[],
              syncStatus: 'synced' as const,
              guestCount: dbOrder.guest_count || undefined,
              coverCharge: dbOrder.cover_charge || undefined,
              createdAt: new Date(dbOrder.created_at),
              updatedAt: new Date(dbOrder.updated_at),
              kotPrintedAt: dbOrder.kot_printed_at ? new Date(dbOrder.kot_printed_at) : undefined
            };
            const newOrders = [...state.orders];
            const idx = newOrders.findIndex(o => o.id === dbOrder.id);
            if (idx >= 0) newOrders[idx] = mappedOrder;
            else newOrders.push(mappedOrder);
            
            return {
              orders: newOrders,
              activeOrder: state.activeOrder?.id === dbOrder.id ? mappedOrder : state.activeOrder
            };
          });
        }
      })
      .subscribe();
  }
}));
