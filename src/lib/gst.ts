// GST Calculation Engine — India Compliant

import { GSTBreakdown, OrderItem } from '../types';

/**
 * Calculate GST based on transaction type
 * Intra-state: CGST + SGST (each = rate/2)
 * Inter-state: IGST (= rate)
 * Default: intra-state for restaurant use
 */
export function calculateGSTBreakdown(
  items: OrderItem[],
  isInterState = false
): GSTBreakdown[] {
  const rateMap = new Map<number, { taxable: number; items: OrderItem[] }>();

  items.forEach((item) => {
    if (item.status === 'void') return;
    const rate = item.gstRate;
    if (!rateMap.has(rate)) {
      rateMap.set(rate, { taxable: 0, items: [] });
    }
    const entry = rateMap.get(rate)!;
    entry.taxable += item.totalPrice;
    entry.items.push(item);
  });

  const breakdown: GSTBreakdown[] = [];

  rateMap.forEach((value, rate) => {
    if (rate === 0) {
      breakdown.push({
        rate: 0,
        taxableAmount: value.taxable,
        cgst: 0,
        sgst: 0,
        igst: 0,
        total: value.taxable,
      });
      return;
    }

    // GST-inclusive pricing (tax already in price)
    // taxable = price / (1 + rate/100)
    const taxable = value.taxable / (1 + rate / 100);
    const tax = value.taxable - taxable;

    if (isInterState) {
      breakdown.push({
        rate,
        taxableAmount: roundTo2(taxable),
        cgst: 0,
        sgst: 0,
        igst: roundTo2(tax),
        total: value.taxable,
      });
    } else {
      const half = roundTo2(tax / 2);
      breakdown.push({
        rate,
        taxableAmount: roundTo2(taxable),
        cgst: half,
        sgst: half,
        igst: 0,
        total: value.taxable,
      });
    }
  });

  return breakdown.sort((a, b) => a.rate - b.rate);
}

/** Round to 2 decimal places */
export function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * GST Round-off per Indian GST rules
 * Round to nearest rupee
 */
export function gstRoundOff(amount: number): { rounded: number; roundOff: number } {
  const rounded = Math.round(amount);
  const roundOff = roundTo2(rounded - amount);
  return { rounded, roundOff };
}

/** Format currency in Indian style */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format compact amount e.g. 1250.50 -> ₹1,250.50 */
export function formatAmount(amount: number): string {
  return '₹' + amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

/** 
 * Generate invoice number: INV/2025-26/0001
 * Financial year starts April 1
 */
export function generateInvoiceNumber(
  prefix: string,
  counter: number,
  date = new Date()
): string {
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = (fyStart + 1).toString().slice(2);
  const fy = `${fyStart}-${fyEnd}`;
  const seq = String(counter).padStart(4, '0');
  return `${prefix}/${fy}/${seq}`;
}

/** HSN Code for common food items */
export const HSN_CODES: Record<string, string> = {
  'restaurant': '9963',
  'takeaway': '9963',
  'bakery': '1905',
  'beverage': '2202',
  'sweets': '1704',
  'ice_cream': '2105',
};

/** Common GST rates for Indian food business */
export const GST_RATES = {
  EXEMPT: 0,      // Fresh vegetables, milk, eggs, bread
  FIVE: 5,        // Restaurant services (non-AC), takeaway
  TWELVE: 12,     // AC restaurants, hotels
  EIGHTEEN: 18,   // Packaged foods, premium restaurants
} as const;

/** Calculate service charge */
export function calculateServiceCharge(subtotal: number, percent: number): number {
  return roundTo2((subtotal * percent) / 100);
}

/** Calculate discount */
export function calculateDiscount(
  subtotal: number,
  type: 'flat' | 'percent',
  value: number
): number {
  if (type === 'flat') return Math.min(value, subtotal);
  return roundTo2((subtotal * value) / 100);
}
