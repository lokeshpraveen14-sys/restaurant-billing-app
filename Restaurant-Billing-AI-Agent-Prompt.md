# AI Agent Prompt: Build a Production-Grade Restaurant Billing System

Copy everything below into your AI coding agent (Claude Code, Cursor, etc.) to scaffold the project from scratch.

---

## ROLE

You are a senior full-stack engineer building a production-ready **Restaurant Billing & Management System** for an Indian restaurant/resort business. Build incrementally, explain architectural decisions briefly, and always produce working, copy-paste-ready code — no placeholders like `// TODO: implement this`.

## OBJECTIVE

Build a modern, offline-resilient restaurant billing platform that runs on a **100% free-tier stack** and handles: table management, order taking, kitchen display, GST-compliant billing, inventory, and analytics — with a clean, fast UI usable by waiters on tablets and admins on desktop.

---

## 1. TECH STACK (fixed — do not substitute)

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript | Deployed on Vercel (Hobby tier) |
| UI | Tailwind CSS + shadcn/ui + lucide-react icons | Clean, modern, accessible components |
| State | Zustand | Lightweight, no boilerplate |
| Offline DB | Dexie.js (IndexedDB wrapper) | Local-first order storage |
| Backend | Node.js + Express.js + TypeScript | Deployed on SnapDeploy (free tier, cold-start ~10–30s) |
| Database | MongoDB Atlas (M0 free cluster) | 512MB, Mongoose ODM |
| Auth | JWT (access + refresh tokens) | httpOnly cookies |
| Realtime | Socket.io | Kitchen Display live order push |
| PDF/Print | ESC/POS via `node-thermal-printer` or browser print (`react-to-print`) | Thermal printer support for bills/KOT |
| Validation | Zod (shared schema, frontend + backend) | |
| Charts | Recharts | Sales/analytics dashboard |

**Cost constraint:** everything must run on free tiers. Flag anywhere a feature would exceed free-tier limits and suggest the lightest workaround.

---

## 2. ARCHITECTURE — OFFLINE-FIRST BY DESIGN

This is the most important constraint. The backend sleeps when idle (free tier), so the UI must **never block on the network**:

1. Waiter takes an order → written to Dexie.js (IndexedDB) **instantly**, order appears in UI immediately with a "syncing" badge.
2. A background sync worker retries pushing queued orders to the Express API every few seconds using exponential backoff.
3. Once synced, the badge updates to "confirmed." If SnapDeploy is asleep, the wait is invisible to the waiter — the local order is already usable (can be sent to kitchen printer locally).
4. Conflict resolution: server is source of truth once synced; use `localId` (UUID generated client-side) mapped to `serverId` after sync to prevent duplicates on retry.
5. Menu, table layout, and pricing are cached locally on load and refreshed opportunistically (stale-while-revalidate) so the app works even if opened while offline.

Build a `syncQueue` table in Dexie for: new orders, order edits, payment confirmations. Each item: `{ id, type, payload, status: 'pending'|'synced'|'failed', retryCount, createdAt }`.

---

## 3. CORE FEATURES

### 3.1 Authentication & Roles
- Roles: **Admin, Manager, Cashier, Waiter, Kitchen**
- JWT-based login, role-based route/UI guards
- Admin can create/deactivate staff accounts, assign roles per outlet (support multi-outlet from day one, even if only one is used initially)

### 3.2 Table Management
- Visual floor-plan view (drag-to-arrange tables, grid layout, saved positions)
- Table states: Free (green), Occupied (red), Reserved (amber), Billing (blue) — color-coded, real-time via Socket.io
- Tap a table → opens order screen for that table
- Merge/split tables for large groups

### 3.3 Menu Management
- Categories → Items → Variants (size/portion) → Add-ons
- Veg/non-veg indicator (colored dot per Indian convention), spice level tags
- Item image upload, availability toggle ("86" an item instantly across all devices via Socket.io)
- Price history log

### 3.4 Order Taking (Waiter App — tablet-optimized)
- Dine-in / Takeaway / Delivery order types
- Large touch targets, category tabs, search-as-you-type
- Item notes (e.g., "no onion"), quantity stepper
- Auto-generates **KOT (Kitchen Order Ticket)** on submit, printed or pushed to KDS
- Order edit/void with reason logging (audit trail)

### 3.5 Kitchen Display System (KDS)
- Real-time order queue screen for kitchen staff (Socket.io push, no manual refresh)
- Color-coded by wait time (green → amber → red the longer it sits)
- Mark items "preparing" → "ready" → "served"

### 3.6 Billing & Invoicing (India-specific — critical)
- GST-compliant tax invoice: CGST + SGST (intra-state) / IGST (inter-state) auto-calculated from HSN/SAC code per item
- Service charge (optional, toggleable), discounts (flat/%, manager approval for override)
- Round-off handling per GST rules
- **Split bill**: by item, equally by person, or custom amounts
- Payment modes: Cash, UPI (QR code generation), Card, Split payment across modes
- Auto-numbered invoice sequence (financial-year-aware, as per Indian invoicing rules)
- Print bill to thermal printer (58mm/80mm) or generate PDF

### 3.7 Inventory Management
- Stock tracking per raw ingredient, recipe-based auto-deduction when items are sold
- Low-stock alerts (dashboard + optional email)
- Purchase entry log with vendor and cost tracking

### 3.8 Reports & Analytics Dashboard
- Daily/weekly/monthly sales, best-selling items, peak hours heatmap
- Staff performance (orders handled, average table turnover time)
- GST summary report (exportable CSV, ready for filing)
- Recharts-based visual dashboard with date-range filters

### 3.9 Customer Management (advanced)
- Optional phone-number capture at billing, order history lookup
- Simple loyalty points system (configurable earn/redeem rate)

### 3.10 Settings
- Restaurant profile, logo, GSTIN, tax rates, printer configuration
- Role/permission matrix editor for Admin

---

## 4. UI/UX DIRECTION

- **Design language**: clean, modern, minimal — generous white space, soft shadows, rounded-lg corners, no visual clutter. Avoid generic "admin template" look.
- **Typography**: one strong sans-serif (e.g., Inter or Geist), clear hierarchy, large legible numerals for prices/totals.
- **Color system**: neutral base (slate/zinc) + one confident accent color for primary actions; status colors (green/amber/red/blue) reserved strictly for table/order states.
- **Layout**: sidebar nav for Admin/Manager desktop views; bottom-tab nav for Waiter tablet view.
- **Dark mode**: fully supported via Tailwind `dark:` classes, toggle in settings.
- **Feedback states**: skeleton loaders (never blank screens), optimistic UI updates, toast notifications for sync status, empty states with helpful illustrations/CTAs.
- **Micro-interactions**: subtle transitions on table status change, order submission, and KOT confirmation — should feel responsive and alive, not static.
- Reference the `frontend-design` best practices for spacing scale, component consistency, and avoiding templated defaults.

---

## 5. FOLDER STRUCTURE (scaffold exactly this)

```
restaurant-billing/
├── frontend/                 # Next.js app → Vercel
│   ├── app/
│   │   ├── (admin)/
│   │   ├── (waiter)/
│   │   ├── (kitchen)/
│   │   └── (auth)/
│   ├── components/ui/        # shadcn components
│   ├── lib/db.ts             # Dexie.js setup
│   ├── lib/sync-engine.ts    # background sync worker
│   └── lib/api.ts
├── backend/                  # Express → SnapDeploy
│   ├── src/
│   │   ├── models/           # Mongoose schemas
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── middleware/       # auth, role-guard, validation
│   │   ├── sockets/
│   │   └── utils/gst.ts      # tax calculation logic
│   └── server.ts
└── shared/
    └── schemas/              # Zod schemas used by both apps
```

---

## 6. BUILD ORDER (execute in this sequence)

1. Scaffold both repos, set up MongoDB Atlas connection, deploy skeleton backend to SnapDeploy and skeleton frontend to Vercel first — validate the free-tier pipeline works end-to-end before building features.
2. Auth + role-based routing
3. Menu management (CRUD)
4. Table management + floor plan
5. Order taking + Dexie offline queue + sync engine
6. KOT generation + Kitchen Display (Socket.io)
7. Billing engine (GST calc, split bill, payment capture, invoice PDF/print)
8. Inventory module
9. Reports/analytics dashboard
10. Customer management + settings
11. Polish: dark mode, empty states, loading skeletons, printer integration testing

At each step, deploy and verify before moving to the next — don't let integration issues compound.

---

## 7. NON-NEGOTIABLE QUALITY BARS

- TypeScript strict mode everywhere, shared Zod schemas between frontend/backend (no type drift)
- Every write operation must work offline for the waiter flow
- All monetary values calculated server-side at sync time (never trust client-computed totals for the final invoice)
- Role guards enforced on both UI and API layers
- No console errors, no unhandled promise rejections
- Mobile/tablet responsive as the primary target for order-taking screens
