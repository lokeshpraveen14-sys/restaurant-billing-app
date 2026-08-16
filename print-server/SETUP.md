# Restaurant Billing – Thermal Printer Setup Guide

## Your Setup
- Thermal printer connected via **Ethernet to JioFiber router**
- Billing software running on a laptop (browser)

## Why Direct Printing is Hard From a Browser
Browsers block raw TCP socket connections for security. To print to a network printer you need a small **local bridge server** that runs on your laptop and forwards print jobs to the printer.

## One-Time Setup Steps

### Step 1 – Install Node.js
Download from https://nodejs.org (LTS version) and install on your laptop.

### Step 2 – Start the Print Bridge Server
Open **Command Prompt** (Windows) or **Terminal** (Mac) and run:

```bash
# Navigate to the print-server folder
cd /path/to/Restaurant_Billing/print-server

# Start the bridge
node server.js
```

You will see:
```
╔══════════════════════════════════════════╗
║   Restaurant Billing – Print Bridge       ║
║   Listening on http://localhost:7878     ║
║   Keep this window open while billing.   ║
╚══════════════════════════════════════════╝
```

**Keep this terminal window open whenever you are billing.**

### Step 3 – Find Your Printer's IP Address
1. Hold the **Feed** button on your thermal printer while switching it on
2. It will print a self-test page showing the IP address (e.g. `192.168.1.100`)
3. If it shows `0.0.0.0`, you need to configure the printer via its web interface:
   - Connect to the printer's IP in a browser
   - Set a static IP in the same range as your JioFiber router (e.g. `192.168.1.X`)

### Step 4 – Configure in Settings
1. Open the Billing App → Settings → Printing
2. Select **LAN (Ethernet)**
3. Enter the printer's IP address
4. Leave port as **9100** (standard for ESC/POS thermal printers)
5. Click **Check** – it should say ✅ Print Bridge: ONLINE
6. Click **Save Settings**

### Step 5 – Print!
Go to Billing → Generate Bill → **Print Bill**
It will print directly to your thermal printer with no dialog!

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Print Bridge: NOT RUNNING" | Run `node server.js` in the print-server folder |
| "Connection timeout" on print | Check printer IP is correct and printer is on the same network |
| Printer prints garbage | Set Paper Width to match your roll (58mm or 80mm) in Settings |
| Windows firewall blocks port | Allow Node.js through Windows Defender Firewall |
