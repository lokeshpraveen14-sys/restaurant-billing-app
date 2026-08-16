// Types for the Restaurant Billing System

export type UserRole = 'admin' | 'manager' | 'cashier' | 'waiter' | 'kitchen';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  pin?: string; // 4-digit PIN for quick login
  active: boolean;
  outlet?: string;
  createdAt: Date;
}

export type TableStatus = 'free' | 'occupied' | 'reserved' | 'billing' | 'cleaning';
export type OrderType = 'dine-in' | 'takeaway' | 'counter';

export interface Table {
  id: string;
  number: string;
  capacity: number;
  status: TableStatus;
  section: string;
  posX: number;
  posY: number;
  currentOrderId?: string;
  occupiedSince?: Date;
  reservedFor?: string;
  mergedWith?: string[];
  extraChargePerPerson?: number; // e.g. AC dining cover charge
}

export type ItemCategory = 'food' | 'bakery' | 'beverage' | 'dessert' | 'juice' | 'other';
export interface MenuCategory {
  id: string;
  name: string;
  type: ItemCategory;
  icon?: string;
  sortOrder: number;
  active: boolean;
}

export interface MenuVariant {
  id: string;
  name: string; // e.g., "Half", "Full", "Small", "Large"
  price: number;
}

export interface MenuAddon {
  id: string;
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  isVeg: boolean;
  spiceLevel?: 'mild' | 'medium' | 'hot' | 'extra-hot';
  variants: MenuVariant[];
  addons: MenuAddon[];
  basePrice: number;
  hsnCode?: string;
  gstRate: 0 | 5 | 12 | 18 | 28; // GST slabs in India
  available: boolean;
  stockQuantity?: number;
  imageUrl?: string;
  isSpecial?: boolean; // daily special
  isBakery?: boolean;
  isJuice?: boolean;
  weight?: number; // for weight-based bakery items (in grams)
  pricePerKg?: number; // for weight-based billing
}

export type OrderItemStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'void';

export interface OrderItem {
  id: string;
  menuItemId: string;
  menuItemName: string;
  variantId?: string;
  variantName?: string;
  addons: MenuAddon[];
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  note?: string;
  status: OrderItemStatus;
  isVeg: boolean;
  gstRate: number;
  weight?: number; // for weight items
  kotType?: 'food' | 'juice' | 'bakery'; // which KOT printer to route to
}

export type OrderStatus = 'open' | 'kot_sent' | 'preparing' | 'ready' | 'billed' | 'paid' | 'void' | 'cancelled';
export type SyncStatus = 'local' | 'syncing' | 'synced' | 'failed';

export interface Order {
  id: string;
  localId: string;
  tableId?: string;
  tableNumber?: string;
  orderType: OrderType;
  items: OrderItem[];
  status: OrderStatus;
  syncStatus: SyncStatus;
  staffId: string;
  staffName: string;
  createdAt: Date;
  updatedAt: Date;
  kotPrintedAt?: Date;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  kotNumber?: number;
  guestCount?: number;
  coverCharge?: number;
}

export interface GSTBreakdown {
  rate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export type DiscountType = 'flat' | 'percent';
export type PaymentMode = 'cash' | 'upi' | 'card' | 'split';

export interface Payment {
  mode: PaymentMode;
  amount: number;
  reference?: string; // UPI ref, card last4
}

export interface Bill {
  id: string;
  invoiceNumber: string;
  orderId: string;
  tableId?: string;
  tableNumber?: string;
  orderType: OrderType;
  items: OrderItem[];
  subtotal: number;
  gstBreakdown: GSTBreakdown[];
  totalGST: number;
  serviceCharge: number;
  serviceChargePercent: number;
  discountType?: DiscountType;
  discountValue: number;
  discountAmount: number;
  roundOff: number;
  totalAmount: number;
  payments: Payment[];
  amountPaid: number;
  changeDue: number;
  customerName?: string;
  customerPhone?: string;
  staffName: string;
  status?: 'paid' | 'void';
  guestCount?: number;
  coverCharge?: number;
  createdAt: Date;
  outletName: string;
  outletAddress: string;
  outletGSTIN: string;
  shiftId?: string; // link to shift
}

// Inventory
export interface Ingredient {
  id: string;
  name: string;
  unit: string; // kg, g, L, ml, pcs, dozen
  currentStock: number;
  reorderLevel: number;
  costPerUnit: number;
  vendorName?: string;
  category: string;
}

export interface Recipe {
  menuItemId: string;
  ingredients: { ingredientId: string; quantity: number }[];
}

export interface PurchaseEntry {
  id: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  costPerUnit: number;
  totalCost: number;
  vendorName: string;
  date: Date;
  invoiceRef?: string;
}

// Analytics
export interface DailySales {
  date: string;
  revenue: number;
  orders: number;
  covers: number;
  avgOrderValue: number;
}

// Shift Management
export interface Shift {
  id: string;
  staffName: string;
  staffId: string;
  openedAt: Date;
  closedAt?: Date;
  openingBalance: number;
  closingBalance?: number;
  totalCash: number;
  totalUPI: number;
  totalCard: number;
  totalRevenue: number;
  totalOrders: number;
  totalCovers: number;
  status: 'open' | 'closed';
  notes?: string;
}

export interface Settings {
  restaurantName: string;
  address: string;
  phone: string;
  email?: string;
  gstin: string;
  logoUrl?: string;
  serviceChargePercent: number;
  serviceChargeEnabled: boolean;
  // Printer – Paper
  printerWidth: '58mm' | '80mm' | 'A4';
  // Printer – Connection
  printerType: 'browser' | 'lan' | 'wifi' | 'usb' | 'bluetooth';
  printerIp: string;        // for LAN / WiFi printers
  printerPort: number;      // default 9100
  printerBluetoothName: string; // for BT pairing hint
  autoPrintBill: boolean;
  autoPrintKot: boolean;
  upiId?: string;
  financialYear: string;
  invoicePrefix: string;
  invoiceCounter: number;
  outlet: string;
  currency: string;
  // GST Settings
  gstEnabled: boolean;
  defaultGstRate: 0 | 5 | 12 | 18 | 28;
  categoryGstRates: Record<string, number>;
}

// Toast notification
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

// Bakery
export interface BatchProduction {
  id: string;
  date: string;
  itemId: string;
  itemName: string;
  bakedQty: number;
  soldQty: number;
  wasteQty: number;
  expiryDate?: string;
}
