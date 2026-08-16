import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Ingredient, PurchaseEntry } from '../types';

const INITIAL_INGREDIENTS: (Ingredient & { category: string })[] = [
  { id: 'ing1', name: 'Chicken', unit: 'kg', currentStock: 15, reorderLevel: 5, costPerUnit: 220, vendorName: 'Fresh Farms', category: 'Meat' },
  { id: 'ing2', name: 'Mutton', unit: 'kg', currentStock: 8, reorderLevel: 3, costPerUnit: 680, vendorName: 'Fresh Farms', category: 'Meat' },
  { id: 'ing3', name: 'Paneer', unit: 'kg', currentStock: 6, reorderLevel: 4, costPerUnit: 320, vendorName: 'Dairy Hub', category: 'Dairy' },
  { id: 'ing4', name: 'Onion', unit: 'kg', currentStock: 25, reorderLevel: 10, costPerUnit: 30, vendorName: 'Veggie Market', category: 'Vegetables' },
  { id: 'ing5', name: 'Tomato', unit: 'kg', currentStock: 18, reorderLevel: 8, costPerUnit: 25, vendorName: 'Veggie Market', category: 'Vegetables' },
  { id: 'ing6', name: 'Basmati Rice', unit: 'kg', currentStock: 40, reorderLevel: 20, costPerUnit: 80, vendorName: 'Grain Store', category: 'Grains' },
  { id: 'ing7', name: 'Butter', unit: 'kg', currentStock: 3, reorderLevel: 2, costPerUnit: 450, vendorName: 'Dairy Hub', category: 'Dairy' },
  { id: 'ing8', name: 'All Purpose Flour (Maida)', unit: 'kg', currentStock: 20, reorderLevel: 10, costPerUnit: 40, vendorName: 'Grain Store', category: 'Grains' },
  { id: 'ing9', name: 'Milk', unit: 'L', currentStock: 12, reorderLevel: 5, costPerUnit: 60, vendorName: 'Dairy Hub', category: 'Dairy' },
  { id: 'ing10', name: 'Cooking Oil', unit: 'L', currentStock: 8, reorderLevel: 3, costPerUnit: 160, vendorName: 'Oil Trader', category: 'Pantry' },
  { id: 'ing11', name: 'Cream', unit: 'L', currentStock: 2, reorderLevel: 2, costPerUnit: 200, vendorName: 'Dairy Hub', category: 'Dairy' },
  { id: 'ing12', name: 'Fresh Prawns', unit: 'kg', currentStock: 5, reorderLevel: 2, costPerUnit: 480, vendorName: 'Sea Fresh', category: 'Seafood' },
  { id: 'ing13', name: 'Orange', unit: 'kg', currentStock: 10, reorderLevel: 4, costPerUnit: 80, vendorName: 'Fruit Market', category: 'Fruits' },
  { id: 'ing14', name: 'Mango Pulp', unit: 'L', currentStock: 5, reorderLevel: 2, costPerUnit: 150, vendorName: 'Agro Foods', category: 'Fruits' },
  { id: 'ing15', name: 'Sugar', unit: 'kg', currentStock: 15, reorderLevel: 5, costPerUnit: 45, vendorName: 'Grain Store', category: 'Pantry' },
];

interface InventoryState {
  ingredients: (Ingredient & { category: string })[];
  purchaseEntries: PurchaseEntry[];
  addIngredient: (ingredient: Omit<Ingredient & { category: string }, 'id'>) => void;
  updateIngredient: (id: string, updates: Partial<Ingredient & { category: string }>) => void;
  deleteIngredient: (id: string) => void;
  addPurchaseEntry: (entry: Omit<PurchaseEntry, 'id'>) => void;
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set) => ({
      ingredients: INITIAL_INGREDIENTS,
      purchaseEntries: [],

      addIngredient: (ingredient) =>
        set((state) => ({
          ingredients: [...state.ingredients, { ...ingredient, id: crypto.randomUUID() }],
        })),

      updateIngredient: (id, updates) =>
        set((state) => ({
          ingredients: state.ingredients.map((i) => (i.id === id ? { ...i, ...updates } : i)),
        })),

      deleteIngredient: (id) =>
        set((state) => ({
          ingredients: state.ingredients.filter((i) => i.id !== id),
        })),

      addPurchaseEntry: (entry) => {
        const newEntry: PurchaseEntry = { ...entry, id: crypto.randomUUID() };
        set((state) => ({
          purchaseEntries: [newEntry, ...state.purchaseEntries],
          // Update stock
          ingredients: state.ingredients.map((ing) =>
            ing.id === entry.ingredientId
              ? { ...ing, currentStock: ing.currentStock + entry.quantity }
              : ing
          ),
        }));
      },
    }),
    { name: 'restaurant-inventory' }
  )
);
