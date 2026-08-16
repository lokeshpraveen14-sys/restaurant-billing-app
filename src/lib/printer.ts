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
  text?: string;
  left?: string;
  leftVal?: string;
}

function buildEscPos(lines: ReceiptLine[], charWidth = 48): string {
  let buf = INIT;
  for (const line of lines) {
    if (line.type === 'spacer')   { buf += LF; continue; }
    if (line.type === 'divider')  { buf += ALIGN_L + '-'.repeat(charWidth) + LF; continue; }
    if (line.bold)   buf += BOLD_ON;
    if (line.center) buf += ALIGN_C; else buf += ALIGN_L;
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
  return [
    { type: 'text', bold: true, center: true, text: data.restaurantName },
    { type: 'text', center: true, text: data.address },
    { type: 'text', center: true, text: `GSTIN: ${data.gstin}` },
    { type: 'divider' },
    { type: 'item', bold: true, left: 'Invoice', leftVal: data.invoiceNumber },
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
    { type: 'text', center: true, text: 'Thank you! Visit again.' },
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
      { type: 'item' as const, bold: true, left: i.menuItemName, leftVal: `x${i.quantity}` },
      ...(i.note ? [{ type: 'text' as const, text: `  Note: ${i.note}` }] : []),
    ]),
    { type: 'divider' },
  ];
}

// ─── Core print function ──────────────────────────────────────────────────────

/**
 * Get the bridge server base URL.
 * On the laptop itself: localhost:7878
 * On Android tablets/phones: <bridgeServerIp>:<bridgeServerPort>
 * We always use the configured bridgeServerIp if set; otherwise fallback to localhost.
 */
function getBridgeUrl(): string {
  const { settings } = useSettingsStore.getState();
  const ip   = settings.bridgeServerIp?.trim();
  const port = settings.bridgeServerPort || 7878;
  
  if (!ip) return `http://localhost:${port}`;
  
  if (ip.startsWith('http://') || ip.startsWith('https://')) {
    // If it's a full URL (like ngrok/localtunnel), return it directly (ignores port field)
    // Strip trailing slash if any
    return ip.endsWith('/') ? ip.slice(0, -1) : ip;
  }
  
  if (ip !== 'localhost' && ip !== '127.0.0.1') {
    return `http://${ip}:${port}`;
  }
  return `http://localhost:${port}`;
}

export async function isBridgeAlive(): Promise<boolean> {
  try {
    const r = await fetch(`${getBridgeUrl()}/ping`, { 
      signal: AbortSignal.timeout(3000),
      headers: { 'Bypass-Tunnel-Reminder': 'true' }
    });
    return r.ok;
  } catch {
    return false;
  }
}

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
 * @param htmlFallback - Called if no LAN printer is configured or bridge is down
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

  const bridgeUrl = getBridgeUrl();
  const alive = await isBridgeAlive();

  if (!alive) {
    htmlFallback();
    return {
      method: 'browser',
      error: 'Print bridge not reachable. Make sure the laptop is running "node server.js" and the Bridge Server IP is correct in Settings.',
    };
  }

  const charWidth = printer.width === '58mm' ? 32 : 48;
  const escData   = buildEscPos(lines, charWidth);
  const b64       = strToBase64(escData);

  try {
    const resp = await fetch(`${bridgeUrl}/print`, {
      method:  'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Bypass-Tunnel-Reminder': 'true'
      },
      body:    JSON.stringify({ ip: printer.ip, port: printer.port || 9100, data: b64, encoding: 'base64' }),
    });
    if (resp.ok) return { method: 'bridge' };
    const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
    htmlFallback();
    return { method: 'browser', error: err.error };
  } catch (e: any) {
    htmlFallback();
    return { method: 'browser', error: e.message };
  }
}
