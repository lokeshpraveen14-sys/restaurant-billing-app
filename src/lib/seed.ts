import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

const INITIAL_ITEMS = [
  // Starters
  { id: '550e8400-e29b-41d4-a716-446655440001', categoryId: 'cat1', name: 'Paneer Tikka', description: 'Marinated cottage cheese grilled in tandoor', isVeg: true, spiceLevel: 'medium', variants: [{ id: 'v1', name: 'Half', price: 180 }, { id: 'v2', name: 'Full', price: 320 }], addons: [{ id: 'a1', name: 'Extra Chutney', price: 20 }], basePrice: 180, gstRate: 5, available: true, isSpecial: true },
  { id: '550e8400-e29b-41d4-a716-446655440002', categoryId: 'cat1', name: 'Chicken 65', description: 'Spicy fried chicken, South Indian style', isVeg: false, spiceLevel: 'hot', variants: [{ id: 'v3', name: 'Half', price: 220 }, { id: 'v4', name: 'Full', price: 380 }], addons: [], basePrice: 220, gstRate: 5, available: true },
  { id: '550e8400-e29b-41d4-a716-446655440003', categoryId: 'cat1', name: 'Veg Spring Roll', description: 'Crispy rolls with mixed vegetable filling', isVeg: true, spiceLevel: 'mild', variants: [], addons: [], basePrice: 150, gstRate: 5, available: true },
  { id: '550e8400-e29b-41d4-a716-446655440004', categoryId: 'cat1', name: 'Tandoori Prawns', description: 'Jumbo prawns with tandoori spices', isVeg: false, spiceLevel: 'medium', variants: [{ id: 'v5', name: '6 pcs', price: 480 }, { id: 'v6', name: '12 pcs', price: 880 }], addons: [], basePrice: 480, gstRate: 12, available: true, isSpecial: true },
  { id: '550e8400-e29b-41d4-a716-446655440005', categoryId: 'cat1', name: 'Mushroom Crispy', description: 'Battered and fried mushrooms with sauces', isVeg: true, spiceLevel: 'medium', variants: [], addons: [], basePrice: 160, gstRate: 5, available: true },

  // Main Course
  { id: '550e8400-e29b-41d4-a716-446655440006', categoryId: 'cat2', name: 'Butter Chicken', description: 'Creamy tomato-based chicken curry', isVeg: false, spiceLevel: 'mild', variants: [{ id: 'v7', name: 'Regular', price: 320 }, { id: 'v8', name: 'Jumbo', price: 520 }], addons: [], basePrice: 320, gstRate: 5, available: true, isSpecial: true },
  { id: '550e8400-e29b-41d4-a716-446655440007', categoryId: 'cat2', name: 'Dal Makhani', description: 'Slow-cooked black lentils with butter and cream', isVeg: true, spiceLevel: 'mild', variants: [], addons: [], basePrice: 220, gstRate: 5, available: true },
  { id: '550e8400-e29b-41d4-a716-446655440008', categoryId: 'cat2', name: 'Mutton Rogan Josh', description: 'Kashmiri style mutton curry', isVeg: false, spiceLevel: 'hot', variants: [{ id: 'v9', name: 'Regular', price: 420 }], addons: [], basePrice: 420, gstRate: 5, available: true },
  { id: '550e8400-e29b-41d4-a716-446655440009', categoryId: 'cat2', name: 'Paneer Butter Masala', description: 'Cottage cheese in rich tomato gravy', isVeg: true, spiceLevel: 'medium', variants: [], addons: [], basePrice: 280, gstRate: 5, available: true },
  { id: '550e8400-e29b-41d4-a716-446655440010', categoryId: 'cat2', name: 'Fish Curry', description: 'Coastal style fish curry with coconut', isVeg: false, spiceLevel: 'medium', variants: [], addons: [], basePrice: 360, gstRate: 5, available: false },
];

async function seed() {
  console.log('Seeding menu items...');
  const items = INITIAL_ITEMS.map(i => ({
    id: i.id,
    name: i.name,
    category_id: i.categoryId,
    description: i.description,
    base_price: i.basePrice,
    is_veg: i.isVeg,
    is_special: i.isSpecial || false,
    available: i.available,
    gst_rate: i.gstRate,
    price_per_kg: null,
    variants: i.variants || []
  }));

  const { data, error } = await supabase.from('menu_items').upsert(items);
  if (error) {
    console.error('Error seeding:', error);
  } else {
    console.log('Successfully seeded items');
  }
}

seed();
