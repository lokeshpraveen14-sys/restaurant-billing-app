/**
 * printer.ts
 * -----------
 * Unified print utility for the Restaurant Billing app.
 *
 * Two modes:
 *   1. BROWSER  – renders HTML into a new window and calls window.print()
 *   2. LAN/WiFi – sends raw ESC/POS bytes to the local print-bridge server
 *                  (print-server/server.js) which forwards over TCP to the printer
 */

import { useSettingsStore } from '../store/settingsStore';

// ─── ESC/POS byte helpers ─────────────────────────────────────────────────────

const ESC  = '\x1b';
const GS   = '\x1d';
const INIT = ESC + '@';               // Initialize printer
const CUT  = GS  + 'V' + '\x00';     // Full paper cut
const LF   = '\n';
const BOLD_ON  = ESC + 'E' + '\x01';
const BOLD_OFF = ESC + 'E' + '\x00';
const ALIGN_L  = ESC + 'a' + '\x00';
const ALIGN_C  = ESC + 'a' + '\x01';
const ALIGN_R  = ESC + 'a' + '\x02';

function padLeft (s: string, w: number) { return s.padStart(w, ' '); }
function padRight(s: string, w: number) { return s.padEnd(w,   ' '); }

function twoCol(left: string, right: string, width: number): string {
  const maxLeft = width - right.length - 1;
  return padRight(left.slice(0, maxLeft), maxLeft) + ' ' + right;
}

/** Convert a plain string to base64 (works in browser + Node) */
function strToBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

// ─── ESC/POS receipt builder ──────────────────────────────────────────────────

export interface ReceiptLine {
  type: 'text' | 'divider' | 'item' | 'total' | 'spacer';
  bold?: boolean;
  center?: boolean;
  right?: boolean;
  text?: string;
  left?: string;
  leftVal?: string;
}

function buildEscPos(lines: ReceiptLine[], charWidth = 48): string {
  let buf = INIT;

  for (const line of lines) {
    if (line.type === 'spacer') { buf += LF; continue; }
    if (line.type === 'divider') {
      buf += ALIGN_L + '-'.repeat(charWidth) + LF;
      continue;
    }

    if (line.bold)   buf += BOLD_ON;
    if (line.center) buf += ALIGN_C;
    else if (line.right) buf += ALIGN_R;
    else             buf += ALIGN_L;

    if (line.type === 'item' || line.type === 'total') {
      buf += twoCol(line.left!, line.leftVal!, charWidth) + LF;
    } else {
      buf += (line.text || '') + LF;
    }

    if (line.bold) buf += BOLD_OFF;
  }

  buf += LF + LF + LF + LF + CUT;
  return buf;
}

// ─── Bill receipt helper ──────────────────────────────────────────────────────

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
  const fmt = (n: number) => `₹${n.toFixed(2)}`;
  const lines: ReceiptLine[] = [
    { type: 'text', bold: true, center: true, text: data.restaurantName },
    { type: 'text', center: true, text: data.address },
    { type: 'text', center: true, text: `GSTIN: ${data.gstin}` },
    { type: 'divider' },
    { type: 'item', bold: true, left: 'Invoice', leftVal: data.invoiceNumber },
    data.tableNumber
      ? { type: 'item', left: 'Table', leftVal: data.tableNumber }
      : { type: 'item', left: 'Type',  leftVal: data.orderType },
    data.staffName ? { type: 'item', left: 'Waiter', leftVal: data.staffName } : { type: 'spacer' },
    { type: 'divider' },
    { type: 'item', bold: true, left: 'Item', leftVal: 'Amount' },
    { type: 'divider' },
    ...data.items.map(i => ({
      type: 'item' as const,
      left:    `${i.menuItemName} x${i.quantity}`,
      leftVal: fmt(i.totalPrice),
    })),
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
    { type: 'text', center: true, text: 'Thank you! Visit again.' },
    { type: 'spacer' },
  ];
  return lines;
}

// ─── KOT receipt helper ───────────────────────────────────────────────────────

export interface KotPrintData {
  tableNumber?: string;
  orderType:    string;
  staffName?:   string;
  items:        Array<{ menuItemName: string; quantity: number; note?: string }>;
  kotTime:      string;
}

export function buildKotReceipt(data: KotPrintData): ReceiptLine[] {
  const lines: ReceiptLine[] = [
    { type: 'text', bold: true, center: true, text: '-- KITCHEN ORDER TICKET --' },
    { type: 'divider' },
    data.tableNumber
      ? { type: 'item', bold: true, left: 'Table', leftVal: data.tableNumber }
      : { type: 'item', bold: true, left: 'Type',  leftVal: data.orderType },
    { type: 'item', left: 'Time',   leftVal: data.kotTime },
    data.staffName ? { type: 'item', left: 'Waiter', leftVal: data.staffName } : { type: 'spacer' },
    { type: 'divider' },
    ...data.items.flatMap(i => [
      { type: 'item' as const, bold: true, left: i.menuItemName, leftVal: `x${i.quantity}` },
      ...(i.note ? [{ type: 'text' as const, text: `  Note: ${i.note}` }] : []),
    ]),
    { type: 'divider' },
  ];
  return lines;
}

// ─── Core print function ──────────────────────────────────────────────────────

const BRIDGE_URL = 'http://localhost:7878';

async function isBridgeAlive(): Promise<boolean> {
  try {
    const r = await fetch(`${BRIDGE_URL}/ping`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * printReceipt – the single entry point for all printing.
 * Reads printer settings automatically.
 * Falls back to browser print if the bridge is not reachable.
 */
export async function printReceipt(
  lines: ReceiptLine[],
  htmlFallback: () => void,
): Promise<{ method: 'bridge' | 'browser'; error?: string }> {
  const { settings } = useSettingsStore.getState();
  const type = settings.printerType;

  if (type === 'lan' || type === 'wifi') {
    const ip   = settings.printerIp?.trim();
    const port = settings.printerPort || 9100;
    const charWidth = settings.printerWidth === '58mm' ? 32 : 48;

    if (!ip) {
      htmlFallback();
      return { method: 'browser', error: 'No printer IP configured – used browser fallback' };
    }

    const alive = await isBridgeAlive();
    if (!alive) {
      htmlFallback();
      return {
        method: 'browser',
        error: 'Print bridge server not running. Start it with: cd print-server && node server.js',
      };
    }

    const escData   = buildEscPos(lines, charWidth);
    const b64       = strToBase64(escData);

    const resp = await fetch(`${BRIDGE_URL}/print`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ip, port, data: b64, encoding: 'base64' }),
    });

    if (resp.ok) {
      return { method: 'bridge' };
    } else {
      const err = await resp.json().catch(() => ({ error: 'Unknown' }));
      htmlFallback();
      return { method: 'browser', error: err.error };
    }
  }

  // For browser / USB / Bluetooth – fall back to system print dialog
  htmlFallback();
  return { method: 'browser' };
}
