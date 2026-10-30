# Vessel Schedule Center Prototype

Interactive front-end prototype aligned with the CMA CGM GBS `rst-web` look (navy/red tokens + AppShell). Components are generated from **shadcn-vue (reka-nova)**.

## Run

```bash
cd vsc-prototype
npm install
npm run dev
```

Default URL: http://127.0.0.1:5174

## Single-file delivery

```bash
npm run build:single
```

This writes `release/VSC-Vessel-Schedule-Center.html`. Open it directly in a browser (no server). Routes use the hash (`#/schedule`).

## Scope

- **Vessel Schedule**: filters, sort, row highlight, Take / Reassign / Release, export, column visibility
- **Vessel Detail**: source vs manual override, volumes, checkpoints, LTK check, RFI draft, SLC/SDC file name, activity log
- **Vessel Search / History / PortLink / My Tasks / Settings**
- Header **role switch**: Post Sailing / Cargo Ops / Transshipment / Logistics / Admin
- **Reset Demo** restores mock data

There is no backend. All interaction stays in browser memory.

The UI is English only.
