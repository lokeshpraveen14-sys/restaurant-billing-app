import Dexie, { Table } from 'dexie';
import { Order, Bill } from '../types';

export interface SyncQueue {
  id?: number;
  localId: string;
  type: 'new_order' | 'edit_order' | 'payment' | 'void_order';
  payload: unknown;
  status: 'pending' | 'synced' | 'failed';
  retryCount: number;
  createdAt: Date;
  error?: string;
}

export class BillingDatabase extends Dexie {
  orders!: Table<Order & { id: string }, string>;
  bills!: Table<Bill & { id: string }, string>;
  syncQueue!: Table<SyncQueue, number>;

  constructor() {
    super('RailwayCoachDB');

    this.version(1).stores({
      orders: 'id, localId, tableId, status, syncStatus, createdAt, orderType',
      bills: 'id, invoiceNumber, orderId, createdAt',
      syncQueue: '++id, localId, type, status, createdAt',
    });
  }
}

export const db = new BillingDatabase();

/** Add order to sync queue */
export async function queueSync(
  localId: string,
  type: SyncQueue['type'],
  payload: unknown
) {
  await db.syncQueue.add({
    localId,
    type,
    payload,
    status: 'pending',
    retryCount: 0,
    createdAt: new Date(),
  });
}

/** Get all pending sync items */
export async function getPendingSyncs(): Promise<SyncQueue[]> {
  return db.syncQueue.where('status').equals('pending').toArray();
}

/** Mark sync item as synced */
export async function markSynced(id: number) {
  await db.syncQueue.update(id, { status: 'synced' });
}

/** Mark sync item as failed */
export async function markFailed(id: number, error: string, retryCount: number) {
  await db.syncQueue.update(id, {
    status: retryCount >= 5 ? 'failed' : 'pending',
    retryCount,
    error,
  });
}
