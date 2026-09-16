import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Table, TableStatus } from '../types';
import { supabase } from '../lib/supabase';

const INITIAL_TABLES: Table[] = [
  // Main Hall

];

interface TableState {
  tables: Table[];
  selectedTableId: string | null;
  updateTableStatus: (tableId: string, status: TableStatus, extras?: Partial<Table>) => void;
  updateTable: (tableId: string, data: Partial<Table>) => Promise<void>;
  setSelectedTable: (id: string | null) => void;
  addTable: (table: Omit<Table, 'id' | 'status'>) => Promise<void>;
  deleteTable: (tableId: string) => Promise<void>;
  getTablesBySection: () => Record<string, Table[]>;
  initTableSync: () => void;
}

export const useTableStore = create<TableState>()(
  persist(
    (set, get) => ({
      tables: INITIAL_TABLES,
      selectedTableId: null,

      updateTableStatus: async (tableId, status, extras = {}) => {
        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId
              ? {
                ...t,
                status,
                ...extras,
                ...(status === 'occupied' && !t.occupiedSince
                  ? { occupiedSince: new Date() }
                  : {}),
                ...(status === 'free'
                  ? { occupiedSince: undefined, currentOrderId: undefined, reservedFor: undefined }
                  : {}),
              }
              : t
          ),
        }));

        const updatedTable = get().tables.find(t => t.id === tableId);
        if (updatedTable) {
          await supabase.from('restaurant_tables').update({
            status: updatedTable.status,
            reserved_for: updatedTable.reservedFor || null,
            occupied_since: updatedTable.occupiedSince?.toISOString() || null,
            updated_at: new Date().toISOString()
          }).eq('id', tableId);
        }
      },

      setSelectedTable: (id) => set({ selectedTableId: id }),

      addTable: async (tableData) => {
        const newTable = {
          id: crypto.randomUUID(),
          ...tableData,
          status: 'free' as TableStatus,
        };

        // Optimistic UI update
        set((state) => ({ tables: [...state.tables, newTable] }));

        // Push to Supabase
        try {
          await supabase.from('restaurant_tables').insert([{
            id: newTable.id,
            table_number: newTable.number,
            capacity: newTable.capacity,
            status: newTable.status,
            section: newTable.section
          }]);
        } catch (error) {
          console.error('Failed to sync new table:', error);
        }
      },

      updateTable: async (tableId: string, data: Partial<Table>) => {
        set((state) => ({
          tables: state.tables.map((t) => (t.id === tableId ? { ...t, ...data } : t)),
        }));

        try {
          const updateData: any = {};
          if (data.number !== undefined) updateData.table_number = data.number;
          if (data.capacity !== undefined) updateData.capacity = data.capacity;
          if (data.section !== undefined) updateData.section = data.section;

          if (Object.keys(updateData).length > 0) {
            await supabase.from('restaurant_tables').update(updateData).eq('id', tableId);
          }
        } catch (error) {
          console.error('Failed to sync updated table:', error);
        }
      },

      deleteTable: async (tableId: string) => {
        const previousTables = get().tables;
        set((state) => ({
          tables: state.tables.filter((t) => t.id !== tableId),
        }));

        // Initial default tables use short string IDs (e.g. 't1', 't2'). 
        // Postgres expects UUIDs, so trying to delete 't1' from Supabase throws a syntax error.
        // If it's not a valid UUID, it only exists locally, so we can just return.
        const isValidUUID = tableId.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId);
        if (!isValidUUID) {
          return;
        }

        try {
          // Unlink any existing orders or bills to prevent foreign key constraint errors
          // We keep table_number intact so historical records still show "Table T2" etc.
          await supabase.from('orders').update({ table_id: null }).eq('table_id', tableId);
          await supabase.from('bills').update({ table_id: null }).eq('table_id', tableId);

          const { error } = await supabase.from('restaurant_tables').delete().eq('id', tableId);
          if (error) {
            set({ tables: previousTables });
            console.error('Failed to delete table:', error);
            throw new Error(error.message || 'Failed to delete table');
          }
        } catch (error) {
          set({ tables: previousTables });
          console.error('Failed to delete table:', error);
          throw error;
        }
      },

      getTablesBySection: () => {
        const tables = get().tables;
        return tables.reduce<Record<string, Table[]>>((acc, table) => {
          if (!acc[table.section]) acc[table.section] = [];
          acc[table.section].push(table);
          return acc;
        }, {});
      },

      initTableSync: async () => {
        // Initial fetch
        const { data, error } = await supabase.from('restaurant_tables').select('*');
        if (!error && data) {
          if (data.length > 0) {
            // DB has tables — use them as source of truth
            set((state) => {
              const newTables = data.map((dbTable) => {
                return {
                  id: dbTable.id,
                  number: dbTable.table_number,
                  capacity: dbTable.capacity,
                  section: dbTable.section,
                  status: dbTable.status as TableStatus,
                  reservedFor: dbTable.reserved_for || undefined,
                  occupiedSince: dbTable.occupied_since ? new Date(dbTable.occupied_since) : undefined,
                };
              });
              return { tables: newTables };
            });
          } else {
            // DB is empty — push local persisted tables to DB (first-time seed)
            const localTables = get().tables;
            for (const t of localTables) {
              await supabase.from('restaurant_tables').upsert({
                id: t.id,
                table_number: t.number,
                capacity: t.capacity,
                status: 'free',
                section: t.section
              });
            }
            // Now set all local tables as free
            set((state) => ({
              tables: state.tables.map(t => ({ ...t, status: 'free' as TableStatus, occupiedSince: undefined, reservedFor: undefined }))
            }));
          }
        }

        // Subscribe to real-time changes
        const stale = supabase.getChannels().find(c => c.topic === 'realtime:public:restaurant_tables');
        if (stale) supabase.removeChannel(stale);

        supabase.channel('public:restaurant_tables')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, payload => {
            if (payload.eventType === 'DELETE') {
              const deletedId = (payload.old as any).id;
              set((state) => ({
                tables: state.tables.filter((t) => t.id !== deletedId)
              }));
              return;
            }

            if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
              const dbTable = payload.new;
              set((state) => {
                const newTables = [...state.tables];
                const idx = newTables.findIndex(t => t.id === dbTable.id);
                if (idx >= 0) {
                  newTables[idx] = {
                    ...newTables[idx],
                    number: dbTable.table_number || newTables[idx].number,
                    capacity: dbTable.capacity || newTables[idx].capacity,
                    section: dbTable.section || newTables[idx].section,
                    status: dbTable.status as TableStatus,
                    reservedFor: dbTable.reserved_for || undefined,
                    occupiedSince: dbTable.occupied_since ? new Date(dbTable.occupied_since) : undefined,
                  };
                } else {
                  newTables.push({
                    id: dbTable.id,
                    number: dbTable.table_number,
                    capacity: dbTable.capacity,
                    section: dbTable.section,
                    status: dbTable.status as TableStatus,
                    reservedFor: dbTable.reserved_for || undefined,
                    occupiedSince: dbTable.occupied_since ? new Date(dbTable.occupied_since) : undefined
                  });
                }
                return { tables: newTables };
              });
            }
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('✅ Real-time Table sync active');
            }
          });
      }
    }),
    { name: 'railway-coach-tables' }
  )
);
