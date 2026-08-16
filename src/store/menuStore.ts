import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MenuCategory, MenuItem } from '../types';
import { supabase } from '../lib/supabase';

const INITIAL_CATEGORIES: MenuCategory[] = [
  { id: 'cat1', name: 'Starters', type: 'food', sortOrder: 1, active: true },
  { id: 'cat2', name: 'Main Course', type: 'food', sortOrder: 2, active: true },
  { id: 'cat3', name: 'Breads', type: 'food', sortOrder: 3, active: true },
  { id: 'cat4', name: 'Rice & Biryani', type: 'food', sortOrder: 4, active: true },
  { id: 'cat5', name: 'Chinese', type: 'food', sortOrder: 5, active: true },
  { id: 'cat6', name: 'Soups', type: 'food', sortOrder: 6, active: true },
  { id: 'cat7', name: 'Desserts', type: 'dessert', sortOrder: 7, active: true },
  { id: 'cat8', name: 'Beverages', type: 'beverage', sortOrder: 8, active: true },
  { id: 'cat9', name: 'Bakery', type: 'bakery', sortOrder: 9, active: true },
  { id: 'cat10', name: 'Cakes & Pastries', type: 'bakery', sortOrder: 10, active: true },
  // Juice Counter categories
  { id: 'cat11', name: 'Fresh Juices', type: 'juice', sortOrder: 11, active: true },
  { id: 'cat12', name: 'Milkshakes', type: 'juice', sortOrder: 12, active: true },
  { id: 'cat13', name: 'Mocktails', type: 'juice', sortOrder: 13, active: true },
  { id: 'cat14', name: 'Other (Cosmetics etc.)', type: 'other', sortOrder: 14, active: true },
];

const INITIAL_ITEMS: MenuItem[] = [
  // Starters
  { id: 'i1', categoryId: 'cat1', name: 'Paneer Tikka', description: 'Marinated cottage cheese grilled in tandoor', isVeg: true, spiceLevel: 'medium', variants: [{ id: 'v1', name: 'Half', price: 180 }, { id: 'v2', name: 'Full', price: 320 }], addons: [{ id: 'a1', name: 'Extra Chutney', price: 20 }], basePrice: 180, gstRate: 5, available: true, isSpecial: true },
  { id: 'i2', categoryId: 'cat1', name: 'Chicken 65', description: 'Spicy fried chicken, South Indian style', isVeg: false, spiceLevel: 'hot', variants: [{ id: 'v3', name: 'Half', price: 220 }, { id: 'v4', name: 'Full', price: 380 }], addons: [], basePrice: 220, gstRate: 5, available: true },
  { id: 'i3', categoryId: 'cat1', name: 'Veg Spring Roll', description: 'Crispy rolls with mixed vegetable filling', isVeg: true, spiceLevel: 'mild', variants: [], addons: [], basePrice: 150, gstRate: 5, available: true },
  { id: 'i4', categoryId: 'cat1', name: 'Tandoori Prawns', description: 'Jumbo prawns with tandoori spices', isVeg: false, spiceLevel: 'medium', variants: [{ id: 'v5', name: '6 pcs', price: 480 }, { id: 'v6', name: '12 pcs', price: 880 }], addons: [], basePrice: 480, gstRate: 12, available: true, isSpecial: true },
  { id: 'i5', categoryId: 'cat1', name: 'Mushroom Crispy', description: 'Battered and fried mushrooms with sauces', isVeg: true, spiceLevel: 'medium', variants: [], addons: [], basePrice: 160, gstRate: 5, available: true },

  // Main Course
  { id: 'i6', categoryId: 'cat2', name: 'Butter Chicken', description: 'Creamy tomato-based chicken curry', isVeg: false, spiceLevel: 'mild', variants: [{ id: 'v7', name: 'Regular', price: 320 }, { id: 'v8', name: 'Jumbo', price: 520 }], addons: [], basePrice: 320, gstRate: 5, available: true, isSpecial: true },
  { id: 'i7', categoryId: 'cat2', name: 'Dal Makhani', description: 'Slow-cooked black lentils with butter and cream', isVeg: true, spiceLevel: 'mild', variants: [], addons: [], basePrice: 220, gstRate: 5, available: true },
  { id: 'i8', categoryId: 'cat2', name: 'Mutton Rogan Josh', description: 'Kashmiri style mutton curry', isVeg: false, spiceLevel: 'hot', variants: [{ id: 'v9', name: 'Regular', price: 420 }], addons: [], basePrice: 420, gstRate: 5, available: true },
  { id: 'i9', categoryId: 'cat2', name: 'Paneer Butter Masala', description: 'Cottage cheese in rich tomato gravy', isVeg: true, spiceLevel: 'medium', variants: [], addons: [], basePrice: 280, gstRate: 5, available: true },
  { id: 'i10', categoryId: 'cat2', name: 'Fish Curry', description: 'Coastal style fish curry with coconut', isVeg: false, spiceLevel: 'medium', variants: [], addons: [], basePrice: 360, gstRate: 5, available: false },

  // Breads
  { id: 'i11', categoryId: 'cat3', name: 'Butter Naan', isVeg: true, variants: [], addons: [], basePrice: 40, gstRate: 5, available: true },
  { id: 'i12', categoryId: 'cat3', name: 'Garlic Naan', isVeg: true, variants: [], addons: [], basePrice: 55, gstRate: 5, available: true },
  { id: 'i13', categoryId: 'cat3', name: 'Paratha', isVeg: true, variants: [{ id: 'v10', name: 'Plain', price: 45 }, { id: 'v11', name: 'Stuffed', price: 70 }], addons: [], basePrice: 45, gstRate: 5, available: true },
  { id: 'i14', categoryId: 'cat3', name: 'Chapati', isVeg: true, variants: [], addons: [], basePrice: 25, gstRate: 5, available: true },

  // Rice & Biryani
  { id: 'i15', categoryId: 'cat4', name: 'Chicken Biryani', description: 'Hyderabadi dum biryani with raita', isVeg: false, spiceLevel: 'medium', variants: [{ id: 'v12', name: 'Half', price: 220 }, { id: 'v13', name: 'Full', price: 380 }], addons: [{ id: 'a2', name: 'Extra Raita', price: 40 }], basePrice: 220, gstRate: 5, available: true, isSpecial: true },
  { id: 'i16', categoryId: 'cat4', name: 'Veg Biryani', description: 'Fragrant basmati rice with vegetables', isVeg: true, spiceLevel: 'mild', variants: [{ id: 'v14', name: 'Regular', price: 180 }], addons: [], basePrice: 180, gstRate: 5, available: true },
  { id: 'i17', categoryId: 'cat4', name: 'Mutton Biryani', isVeg: false, spiceLevel: 'hot', variants: [{ id: 'v15', name: 'Full', price: 450 }], addons: [], basePrice: 450, gstRate: 5, available: true },
  { id: 'i18', categoryId: 'cat4', name: 'Jeera Rice', isVeg: true, variants: [], addons: [], basePrice: 120, gstRate: 5, available: true },

  // Chinese
  { id: 'i19', categoryId: 'cat5', name: 'Veg Noodles', isVeg: true, variants: [], addons: [], basePrice: 160, gstRate: 5, available: true },
  { id: 'i20', categoryId: 'cat5', name: 'Chicken Fried Rice', isVeg: false, variants: [], addons: [], basePrice: 200, gstRate: 5, available: true },
  { id: 'i21', categoryId: 'cat5', name: 'Manchurian Gravy', isVeg: true, variants: [{ id: 'v16', name: 'Veg', price: 180 }, { id: 'v17', name: 'Chicken', price: 220 }], addons: [], basePrice: 180, gstRate: 5, available: true },

  // Soups
  { id: 'i22', categoryId: 'cat6', name: 'Tomato Soup', isVeg: true, variants: [], addons: [], basePrice: 90, gstRate: 5, available: true },
  { id: 'i23', categoryId: 'cat6', name: 'Sweet Corn Soup', isVeg: true, variants: [{ id: 'v18', name: 'Veg', price: 100 }, { id: 'v19', name: 'Chicken', price: 130 }], addons: [], basePrice: 100, gstRate: 5, available: true },

  // Desserts
  { id: 'i24', categoryId: 'cat7', name: 'Gulab Jamun', isVeg: true, variants: [{ id: 'v20', name: '2 pcs', price: 80 }, { id: 'v21', name: '4 pcs', price: 140 }], addons: [], basePrice: 80, gstRate: 5, available: true },
  { id: 'i25', categoryId: 'cat7', name: 'Ice Cream', isVeg: true, variants: [{ id: 'v22', name: 'Single Scoop', price: 80 }, { id: 'v23', name: 'Double Scoop', price: 130 }], addons: [], basePrice: 80, gstRate: 18, available: true },
  { id: 'i26', categoryId: 'cat7', name: 'Phirni', isVeg: true, variants: [], addons: [], basePrice: 120, gstRate: 5, available: true },

  // Beverages
  { id: 'i27', categoryId: 'cat8', name: 'Masala Chai', isVeg: true, variants: [], addons: [], basePrice: 30, gstRate: 5, available: true },
  { id: 'i28', categoryId: 'cat8', name: 'Cold Coffee', isVeg: true, variants: [{ id: 'v24', name: 'Regular', price: 120 }, { id: 'v25', name: 'Large', price: 160 }], addons: [], basePrice: 120, gstRate: 12, available: true },
  { id: 'i29', categoryId: 'cat8', name: 'Fresh Lime Soda', isVeg: true, variants: [], addons: [], basePrice: 60, gstRate: 12, available: true },
  { id: 'i30', categoryId: 'cat8', name: 'Lassi', isVeg: true, variants: [{ id: 'v26', name: 'Sweet', price: 80 }, { id: 'v27', name: 'Salted', price: 80 }, { id: 'v28', name: 'Mango', price: 100 }], addons: [], basePrice: 80, gstRate: 5, available: true },

  // Bakery
  { id: 'i31', categoryId: 'cat9', name: 'Croissant', description: 'Buttery flaky pastry', isVeg: true, variants: [], addons: [], basePrice: 65, gstRate: 12, available: true, isBakery: true },
  { id: 'i32', categoryId: 'cat9', name: 'Sandwich', description: 'Freshly made veg/chicken sandwich', isVeg: true, variants: [{ id: 'v29', name: 'Veg', price: 80 }, { id: 'v30', name: 'Chicken', price: 110 }], addons: [], basePrice: 80, gstRate: 12, available: true, isBakery: true },
  { id: 'i33', categoryId: 'cat9', name: 'Bread Loaf (per kg)', description: 'Fresh-baked white/brown bread', isVeg: true, variants: [], addons: [], basePrice: 0, pricePerKg: 80, gstRate: 0, available: true, isBakery: true },
  { id: 'i34', categoryId: 'cat9', name: 'Muffin', isVeg: true, variants: [{ id: 'v31', name: 'Chocolate', price: 60 }, { id: 'v32', name: 'Blueberry', price: 65 }, { id: 'v33', name: 'Vanilla', price: 55 }], addons: [], basePrice: 60, gstRate: 12, available: true, isBakery: true },
  { id: 'i35', categoryId: 'cat9', name: 'Cookies (per 100g)', description: 'Assorted freshly baked cookies', isVeg: true, variants: [], addons: [], basePrice: 0, pricePerKg: 400, gstRate: 12, available: true, isBakery: true },

  // Cakes & Pastries
  { id: 'i36', categoryId: 'cat10', name: 'Black Forest Pastry', isVeg: true, variants: [], addons: [], basePrice: 120, gstRate: 12, available: true, isBakery: true },
  { id: 'i37', categoryId: 'cat10', name: 'Chocolate Truffle Cake (per slice)', isVeg: true, variants: [], addons: [], basePrice: 180, gstRate: 12, available: true, isBakery: true, isSpecial: true },
  { id: 'i38', categoryId: 'cat10', name: 'Red Velvet Pastry', isVeg: true, variants: [], addons: [], basePrice: 130, gstRate: 12, available: true, isBakery: true },
  { id: 'i39', categoryId: 'cat10', name: 'Fruit Tart', isVeg: true, variants: [], addons: [], basePrice: 140, gstRate: 12, available: true, isBakery: true },
  { id: 'i40', categoryId: 'cat10', name: 'Tiramisu', description: 'Classic Italian coffee dessert', isVeg: true, variants: [], addons: [], basePrice: 200, gstRate: 18, available: true, isBakery: true, isSpecial: true },

  // Fresh Juices
  { id: 'j1', categoryId: 'cat11', name: 'Orange Juice', description: 'Freshly squeezed orange juice', isVeg: true, variants: [{ id: 'jv1', name: 'Small', price: 60 }, { id: 'jv2', name: 'Large', price: 100 }], addons: [], basePrice: 60, gstRate: 5, available: true, isJuice: true },
  { id: 'j2', categoryId: 'cat11', name: 'Watermelon Juice', description: 'Cool & refreshing watermelon juice', isVeg: true, variants: [], addons: [], basePrice: 50, gstRate: 5, available: true, isJuice: true, isSpecial: true },
  { id: 'j3', categoryId: 'cat11', name: 'Pineapple Juice', isVeg: true, variants: [], addons: [], basePrice: 70, gstRate: 5, available: true, isJuice: true },
  { id: 'j4', categoryId: 'cat11', name: 'Mixed Fruit Juice', isVeg: true, variants: [], addons: [], basePrice: 80, gstRate: 5, available: true, isJuice: true },
  { id: 'j5', categoryId: 'cat11', name: 'Lemon Juice', isVeg: true, variants: [{ id: 'jv3', name: 'Sweet', price: 40 }, { id: 'jv4', name: 'Salted', price: 40 }], addons: [], basePrice: 40, gstRate: 5, available: true, isJuice: true },
  { id: 'j6', categoryId: 'cat11', name: 'Coconut Water', description: 'Fresh tender coconut', isVeg: true, variants: [], addons: [], basePrice: 60, gstRate: 5, available: true, isJuice: true },
  { id: 'j7', categoryId: 'cat11', name: 'Sugarcane Juice', isVeg: true, variants: [], addons: [], basePrice: 40, gstRate: 5, available: true, isJuice: true },
  { id: 'j8', categoryId: 'cat11', name: 'Pomegranate Juice', isVeg: true, variants: [], addons: [], basePrice: 90, gstRate: 5, available: true, isJuice: true },

  // Milkshakes
  { id: 'j9', categoryId: 'cat12', name: 'Mango Milkshake', isVeg: true, variants: [], addons: [], basePrice: 100, gstRate: 5, available: true, isJuice: true, isSpecial: true },
  { id: 'j10', categoryId: 'cat12', name: 'Strawberry Milkshake', isVeg: true, variants: [], addons: [], basePrice: 110, gstRate: 5, available: true, isJuice: true },
  { id: 'j11', categoryId: 'cat12', name: 'Chocolate Milkshake', isVeg: true, variants: [], addons: [], basePrice: 120, gstRate: 5, available: true, isJuice: true },
  { id: 'j12', categoryId: 'cat12', name: 'Banana Milkshake', isVeg: true, variants: [], addons: [], basePrice: 90, gstRate: 5, available: true, isJuice: true },
  { id: 'j13', categoryId: 'cat12', name: 'Dates Milkshake', isVeg: true, variants: [], addons: [], basePrice: 110, gstRate: 5, available: true, isJuice: true },

  // Mocktails
  { id: 'j14', categoryId: 'cat13', name: 'Virgin Mojito', isVeg: true, variants: [], addons: [], basePrice: 120, gstRate: 5, available: true, isJuice: true },
  { id: 'j15', categoryId: 'cat13', name: 'Blue Lagoon', isVeg: true, variants: [], addons: [], basePrice: 130, gstRate: 5, available: true, isJuice: true, isSpecial: true },
  { id: 'j16', categoryId: 'cat13', name: 'Shirley Temple', isVeg: true, variants: [], addons: [], basePrice: 110, gstRate: 5, available: true, isJuice: true },
  { id: 'j17', categoryId: 'cat13', name: 'Tropical Punch', isVeg: true, variants: [], addons: [], basePrice: 140, gstRate: 5, available: true, isJuice: true },
];

interface MenuState {
  categories: MenuCategory[];
  items: MenuItem[];
  searchQuery: string;
  selectedCategoryId: string | null;

  addCategory: (cat: Omit<MenuCategory, 'id'>) => void;
  updateCategory: (id: string, updates: Partial<MenuCategory>) => void;
  addItem: (item: Omit<MenuItem, 'id'>) => void;
  updateItem: (id: string, updates: Partial<MenuItem>) => void;
  toggleAvailability: (id: string) => void;
  setSearch: (q: string) => void;
  setCategory: (id: string | null) => void;
  getFilteredItems: () => MenuItem[];
  initMenuSync: () => void;
}

export const useMenuStore = create<MenuState>()(
  persist(
    (set, get) => ({
      categories: INITIAL_CATEGORIES,
      items: INITIAL_ITEMS,
      searchQuery: '',
      selectedCategoryId: null,

      addCategory: (cat) => {
        set((state) => ({
          categories: [...state.categories, { ...cat, id: crypto.randomUUID() }],
        }));
      },

      updateCategory: (id, updates) => {
        set((state) => ({
          categories: state.categories.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        }));
      },

      addItem: async (item) => {
        const newItem = { ...item, id: crypto.randomUUID() };
        set((state) => ({
          items: [...state.items, newItem],
        }));
        await supabase.from('menu_items').insert({
          id: newItem.id,
          name: newItem.name,
          category_id: newItem.categoryId,
          description: newItem.description || null,
          base_price: newItem.basePrice,
          is_veg: newItem.isVeg,
          is_special: newItem.isSpecial || false,
          available: newItem.available,
          gst_rate: newItem.gstRate,
          price_per_kg: newItem.pricePerKg || null,
          variants: newItem.variants || []
        });
      },

      updateItem: async (id, updates) => {
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
        }));
        
        const updatedItem = get().items.find(i => i.id === id);
        if (updatedItem) {
          await supabase.from('menu_items').update({
            name: updatedItem.name,
            category_id: updatedItem.categoryId,
            description: updatedItem.description || null,
            base_price: updatedItem.basePrice,
            is_veg: updatedItem.isVeg,
            is_special: updatedItem.isSpecial || false,
            available: updatedItem.available,
            gst_rate: updatedItem.gstRate,
            price_per_kg: updatedItem.pricePerKg || null,
            variants: updatedItem.variants || [],
            updated_at: new Date().toISOString()
          }).eq('id', id);
        }
      },

      toggleAvailability: async (id) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, available: !i.available } : i
          ),
        }));
        
        const updatedItem = get().items.find(i => i.id === id);
        if (updatedItem) {
          await supabase.from('menu_items').update({ available: updatedItem.available }).eq('id', id);
        }
      },

      setSearch: (q) => set({ searchQuery: q }),
      setCategory: (id) => set({ selectedCategoryId: id }),

      getFilteredItems: () => {
        const { items, searchQuery, selectedCategoryId } = get();
        return items.filter((item) => {
          const matchCat = !selectedCategoryId || item.categoryId === selectedCategoryId;
          const matchSearch =
            !searchQuery ||
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description?.toLowerCase().includes(searchQuery.toLowerCase());
          return matchCat && matchSearch;
        });
      },

      initMenuSync: async () => {
        // Migration: Ensure all INITIAL_CATEGORIES exist for existing users
        set((state) => {
          const newCategories = [...state.categories];
          let changed = false;
          INITIAL_CATEGORIES.forEach(initCat => {
            if (!newCategories.find(c => c.id === initCat.id)) {
              newCategories.push(initCat);
              changed = true;
            }
          });
          return changed ? { categories: newCategories.sort((a, b) => a.sortOrder - b.sortOrder) } : state;
        });

        const { data, error } = await supabase.from('menu_items').select('*');
        if (!error && data && data.length > 0) {
          set((state) => {
            const newItems = data.map(dbItem => ({
              id: dbItem.id,
              categoryId: dbItem.category_id,
              name: dbItem.name,
              description: dbItem.description || undefined,
              basePrice: dbItem.base_price,
              isVeg: dbItem.is_veg,
              isSpecial: dbItem.is_special,
              available: dbItem.available,
              gstRate: dbItem.gst_rate,
              pricePerKg: dbItem.price_per_kg || undefined,
              variants: dbItem.variants || [],
              addons: state.items.find(i => i.id === dbItem.id)?.addons || [],
              spiceLevel: state.items.find(i => i.id === dbItem.id)?.spiceLevel,
              isBakery: state.items.find(i => i.id === dbItem.id)?.isBakery
            }));
            return { items: newItems };
          });
        }

        supabase.channel('public:menu_items')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, payload => {
            if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
              const dbItem = payload.new;
              set((state) => {
                const newItems = [...state.items];
                const idx = newItems.findIndex(i => i.id === dbItem.id);
                const mappedItem = {
                  id: dbItem.id,
                  categoryId: dbItem.category_id,
                  name: dbItem.name,
                  description: dbItem.description || undefined,
                  basePrice: dbItem.base_price,
                  isVeg: dbItem.is_veg,
                  isSpecial: dbItem.is_special,
                  available: dbItem.available,
                  gstRate: dbItem.gst_rate,
                  pricePerKg: dbItem.price_per_kg || undefined,
                  variants: dbItem.variants || [],
                  addons: idx >= 0 ? newItems[idx].addons : [],
                  spiceLevel: idx >= 0 ? newItems[idx].spiceLevel : undefined,
                  isBakery: idx >= 0 ? newItems[idx].isBakery : undefined
                };
                
                if (idx >= 0) newItems[idx] = mappedItem;
                else newItems.push(mappedItem);
                
                return { items: newItems };
              });
            }
          })
          .subscribe();
      }
    }),
    { name: 'railway-coach-menu' }
  )
);
