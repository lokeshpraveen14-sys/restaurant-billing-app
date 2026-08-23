import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Table, TableStatus } from '../types';
import { supabase } from '../lib/supabase';

const INITIAL_TABLES: Table[] = [
  // Main Hall
  { id: 't1', number: 'T1', capacity: 2, status: 'free', section: 'Main Hall', posX: 0, posY: 0 },
  { id: 't2', number: 'T2', capacity: 2, status: 'free', section: 'Main Hall', posX: 1, posY: 0 },
  { id: 't3', number: 'T3', capacity: 4, status: 'free', section: 'Main Hall', posX: 2, posY: 0 },
  { id: 't4', number: 'T4', capacity: 4, status: 'free', section: 'Main Hall', posX: 3, posY: 0 },
  { id: 't5', number: 'T5', capacity: 6, status: 'free', section: 'Main Hall', posX: 0, posY: 1 },
  { id: 't6', number: 'T6', capacity: 4, status: 'free', section: 'Main Hall', posX: 1, posY: 1 },
  { id: 't7', number: 'T7', capacity: 2, status: 'free', section: 'Main Hall', posX: 2, posY: 1 },
  { id: 't8', number: 'T8', capacity: 4, status: 'free', section: 'Main Hall', posX: 3, posY: 1 },
  // Garden
  { id: 't9', number: 'G1', capacity: 4, status: 'free', section: 'Garden', posX: 0, posY: 2 },
  { id: 't10', number: 'G2', capacity: 4, status: 'free', section: 'Garden', posX: 1, posY: 2 },
  { id: 't11', number: 'G3', capacity: 6, status: 'free', section: 'Garden', posX: 2, posY: 2 },
  { id: 't12', number: 'G4', capacity: 8, status: 'free', section: 'Garden', posX: 3, posY: 2 },
  // AC Dining
  { id: 't13', number: 'A1', capacity: 2, status: 'free', section: 'AC Dining', posX: 0, posY: 3 },
  { id: 't14', number: 'A2', capacity: 4, status: 'free', section: 'AC Dining', posX: 1, posY: 3 },
  { id: 't15', number: 'A3', capacity: 4, status: 'free', section: 'AC Dining', posX: 2, posY: 3 },
  { id: 't16', number: 'A4', capacity: 6, status: 'free', section: 'AC Dining', posX: 3, posY: 3 },
];

interface TableState {
  tables: Table[];
  selectedTableId: string | null;
  updateTableStatus: (tableId: string, status: TableStatus, extras?: Partial<Table>) => void;
  updateTable: (tableId: string, data: Partial<Table>) => Promise<void>;
  setSelectedTable: (id: string | null) => void;
  addTable: (table: Omit<Table, 'id' | 'status' | 'posX' | 'posY'>) => Promise<void>;
  updateTablePosition: (tableId: string, posX: number, posY: number) => void;
  mergeTables: (tableIds: string[]) => void;
  splitTable: (tableId: string) => void;
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
        
        // Sync to Supabase
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
          posX: 0,
          posY: 0
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
            section: newTable.section,
            pos_x: newTable.posX,
            pos_y: newTable.posY
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
          
          await supabase.from('restaurant_tables').update(updateData).eq('id', tableId);
        } catch (error) {
          console.error('Failed to sync updated table:', error);
        }
      },

      updateTablePosition: (tableId, posX, posY) => {
        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId ? { ...t, posX, posY } : t
          ),
        }));
      },

      mergeTables: (tableIds) => {
        set((state) => ({
          tables: state.tables.map((t) =>
            tableIds.includes(t.id) ? { ...t, mergedWith: tableIds.filter((id) => id !== t.id) } : t
          ),
        }));
      },

      splitTable: (tableId) => {
        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId ? { ...t, mergedWith: undefined } : t
          ),
        }));
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
                const localTable = state.tables.find(t => t.number === dbTable.number);
                return {
                  id: dbTable.id,
                  number: dbTable.number,
                  capacity: dbTable.capacity,
                  section: dbTable.section,
                  posX: localTable?.posX ?? dbTable.pos_x ?? 0,
                  posY: localTable?.posY ?? dbTable.pos_y ?? 0,
                  status: dbTable.status as TableStatus,
                  reservedFor: dbTable.reserved_for || undefined,
                  occupiedSince: dbTable.occupied_since ? new Date(dbTable.occupied_since) : undefined,
                  extraChargePerPerson: localTable?.extraChargePerPerson
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
                section: t.section,
                pos_x: t.posX,
                pos_y: t.posY
              });
            }
            // Now set all local tables as free
            set((state) => ({
              tables: state.tables.map(t => ({ ...t, status: 'free' as TableStatus, occupiedSince: undefined, reservedFor: undefined }))
            }));
          }
        }

        // Subscribe to real-time changes
        const existingChannel = supabase.getChannels().find(c => c.topic === 'realtime:public:restaurant_tables');
        if (existingChannel) return;

        supabase.channel('public:restaurant_tables')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, payload => {
            if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
              const dbTable = payload.new;
              set((state) => {
                const newTables = [...state.tables];
                const idx = newTables.findIndex(t => t.id === dbTable.id);
                if (idx >= 0) {
                  newTables[idx] = {
                    ...newTables[idx],
                    status: dbTable.status as TableStatus,
                    reservedFor: dbTable.reserved_for || undefined,
                    occupiedSince: dbTable.occupied_since ? new Date(dbTable.occupied_since) : undefined
                  };
                } else {
                  newTables.push({
                    id: dbTable.id,
                    number: dbTable.number,
                    capacity: dbTable.capacity,
                    section: dbTable.section,
                    posX: dbTable.pos_x ?? 0,
                    posY: dbTable.pos_y ?? 0,
                    status: dbTable.status as TableStatus,
                    reservedFor: dbTable.reserved_for || undefined,
                    occupiedSince: dbTable.occupied_since ? new Date(dbTable.occupied_since) : undefined
                  });
                }
                return { tables: newTables };
              });
            }
          })
          .subscribe();
      }
    }),
    { name: 'railway-coach-tables' }
  )
);
