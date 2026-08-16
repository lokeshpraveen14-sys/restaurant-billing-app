/**
 * printer.ts
 * -----------
 * Unified multi-printer utility for the Restaurant Billing app.
 *
 * Architecture:
 *   Browser/Android  →  Bridge Server (laptop LAN IP:7878)  →  Printer IP:9100
 *
 * Each counter has its own PrinterProfile with a role:
 *   billing   → Cashier receipt printer
 *   kot       → Kitchen KOT printer
 *   bakery    → Bakery counter printer
 *   juice     → Juice counter printer
 *   shawarma  → Shawarma counter printer
 */

import { useSettingsStore } from '../store/settingsStore';
import { PrinterRole, PrinterProfile } from '../types';
import { supabase } from './supabase';

// ─── ESC/POS byte helpers ─────────────────────────────────────────────────────

const ESC  = '\x1b';
const GS   = '\x1d';
const INIT = ESC + '@';
const CUT  = GS  + 'V' + '\x00';
const LF   = '\n';
const BOLD_ON  = ESC + 'E' + '\x01';
const BOLD_OFF = ESC + 'E' + '\x00';
const ALIGN_L  = ESC + 'a' + '\x00';
const ALIGN_C  = ESC + 'a' + '\x01';
const SIZE_NORMAL = GS + '!' + '\x00';
const SIZE_DOUBLE = GS + '!' + '\x11';

function padRight(s: string, w: number) { return s.padEnd(w, ' '); }

function twoCol(left: string, right: string, width: number): string {
  const maxLeft = width - right.length - 1;
  return padRight(left.slice(0, maxLeft), maxLeft) + ' ' + right;
}

function strToBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

// ─── Receipt line types ───────────────────────────────────────────────────────

export interface ReceiptLine {
  type: 'text' | 'divider' | 'item' | 'total' | 'spacer';
  bold?: boolean;
  center?: boolean;
  size?: 'normal' | 'double';
  text?: string;
  left?: string;
  leftVal?: string;
}

function buildEscPos(lines: ReceiptLine[], charWidth = 48): string {
  let buf = INIT;
  for (const line of lines) {
    if (line.type === 'spacer')   { buf += LF; continue; }
    if (line.type === 'divider')  { buf += ALIGN_L + '-'.repeat(charWidth) + LF; continue; }
    
    if (line.size === 'double') buf += SIZE_DOUBLE;
    if (line.bold)   buf += BOLD_ON;
    if (line.center) buf += ALIGN_C; else buf += ALIGN_L;
    
    if (line.type === 'item' || line.type === 'total') {
      buf += twoCol(line.left!, line.leftVal!, charWidth) + LF;
    } else {
      buf += (line.text || '') + LF;
    }
    
    if (line.bold) buf += BOLD_OFF;
    if (line.size === 'double') buf += SIZE_NORMAL;
  }
  buf += LF + LF + LF + LF + CUT;
  return buf;
}

// ─── Bill receipt builder ─────────────────────────────────────────────────────

export interface BillPrintData {
  restaurantName: string;
  address:        string;
  gstin:          string;
  invoiceNumber:  string;
  tableNumber?:   string;
  orderType:      string;
  staffName?:     string;
  items:          Array<{ menuItemName: string; quantity: number; totalPrice: number }>;
  subtotal:       number;
  totalGST:       number;
  serviceCharge:  number;
  discountAmount: number;
  roundOff:       number;
  totalAmount:    number;
  paymentMode:    string;
  amountPaid?:    number;
  changeDue?:     number;
}

export function buildBillReceipt(data: BillPrintData): ReceiptLine[] {
  const fmt = (n: number) => `Rs.${n.toFixed(2)}`;
  
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  return [
    { type: 'text', bold: true, center: true, size: 'double' as const, text: data.restaurantName },
    { type: 'text', center: true, text: data.address },
    { type: 'text', center: true, text: `GSTIN: ${data.gstin}` },
    { type: 'divider' },
    { type: 'item', bold: true, left: 'Invoice', leftVal: data.invoiceNumber },
    { type: 'item', left: 'Date', leftVal: `${dateStr} ${timeStr}` },
    data.tableNumber
      ? { type: 'item', left: 'Table', leftVal: data.tableNumber }
      : { type: 'item', left: 'Type',  leftVal: data.orderType },
    ...(data.staffName ? [{ type: 'item' as const, left: 'Waiter', leftVal: data.staffName }] : []),
    { type: 'divider' },
    { type: 'item', bold: true, left: 'Item', leftVal: 'Amount' },
    { type: 'divider' },
    ...data.items.map(i => ({ type: 'item' as const, left: `${i.menuItemName} x${i.quantity}`, leftVal: fmt(i.totalPrice) })),
    { type: 'divider' },
    { type: 'item', left: 'Subtotal',  leftVal: fmt(data.subtotal) },
    ...(data.serviceCharge  ? [{ type: 'item' as const, left: 'Service Charge', leftVal: fmt(data.serviceCharge)  }] : []),
    ...(data.discountAmount ? [{ type: 'item' as const, left: 'Discount',       leftVal: `-${fmt(data.discountAmount)}` }] : []),
    ...(data.totalGST       ? [{ type: 'item' as const, left: 'GST',            leftVal: fmt(data.totalGST) }] : []),
    ...(data.roundOff       ? [{ type: 'item' as const, left: 'Round Off',      leftVal: fmt(data.roundOff) }] : []),
    { type: 'divider' },
    { type: 'item', bold: true, left: 'TOTAL', leftVal: fmt(data.totalAmount) },
    { type: 'divider' },
    { type: 'item', left: 'Payment', leftVal: data.paymentMode.toUpperCase() },
    ...(data.amountPaid ? [{ type: 'item' as const, left: 'Cash Tendered', leftVal: fmt(data.amountPaid) }] : []),
    ...(data.changeDue  ? [{ type: 'item' as const, left: 'Change Due',    leftVal: fmt(data.changeDue)  }] : []),
    { type: 'divider' },
    { type: 'text', center: true, bold: true, text: 'Thank you! Visit again.' },
    { type: 'spacer' },
    { type: 'text', center: true, text: 'Software by www.appricots.in' },
    { type: 'spacer' },
  ];
}

// ─── KOT receipt builder ──────────────────────────────────────────────────────

export interface KotPrintData {
  tableNumber?: string;
  orderType:    string;
  staffName?:   string;
  items:        Array<{ menuItemName: string; quantity: number; note?: string }>;
  kotTime:      string;
}

export function buildKotReceipt(data: KotPrintData): ReceiptLine[] {
  return [
    { type: 'text', bold: true, center: true, text: '-- KITCHEN ORDER TICKET --' },
    { type: 'divider' },
    data.tableNumber
      ? { type: 'item', bold: true, left: 'Table',  leftVal: data.tableNumber }
      : { type: 'item', bold: true, left: 'Type',   leftVal: data.orderType },
    { type: 'item', left: 'Time',   leftVal: data.kotTime },
    ...(data.staffName ? [{ type: 'item' as const, left: 'Waiter', leftVal: data.staffName }] : []),
    { type: 'divider' },
    ...data.items.flatMap(i => [
      { type: 'item' as const, bold: true, size: 'double' as const, left: i.menuItemName, leftVal: `x${i.quantity}` },
      ...(i.note ? [{ type: 'text' as const, text: `  Note: ${i.note}` }] : []),
    ]),
    { type: 'divider' },
    { type: 'spacer' },
    { type: 'text', center: true, text: 'Software by www.appricots.in' },
    { type: 'spacer' },
  ];
}

// ─── Core print function ──────────────────────────────────────────────────────

/**
 * Find the printer profile for a given role.
 * Returns the first enabled profile matching the role, or undefined.
 */
export function getPrinterForRole(role: PrinterRole): PrinterProfile | undefined {
  const { settings } = useSettingsStore.getState();
  return (settings.printers || []).find(p => p.role === role && p.enabled && p.ip);
}

/**
 * printReceipt – the single entry point for all printing.
 * @param lines     - Array of ReceiptLine (built by buildBillReceipt / buildKotReceipt)
 * @param role      - Printer role to look up (billing, kot, bakery, etc.)
 * @param htmlFallback - Called if no LAN printer is configured
 */
export async function printReceipt(
  lines: ReceiptLine[],
  role: PrinterRole,
  htmlFallback: () => void,
): Promise<{ method: 'bridge' | 'browser'; error?: string }> {
  const printer = getPrinterForRole(role);

  if (!printer) {
    // No printer profile configured for this role → use browser print
    htmlFallback();
    return { method: 'browser', error: `No ${role} printer configured. Add one in Settings → Printing.` };
  }

  const charWidth = printer.width === '58mm' ? 32 : 48;
  const escData   = buildEscPos(lines, charWidth);
  const b64       = strToBase64(escData);

  try {
    const { error } = await supabase.from('print_jobs').insert({
      printer_ip: printer.ip,
      printer_port: printer.port || 9100,
      receipt_data: b64,
      status: 'pending'
    });

    if (error) {
      console.error('Supabase print insert error:', error);
      htmlFallback();
      return { method: 'browser', error: 'Cloud print failed: ' + error.message };
    }

    return { method: 'bridge' };
  } catch (e: any) {
    console.error('Print queue exception:', e);
    htmlFallback();
    return { method: 'browser', error: e.message };
  }
}
