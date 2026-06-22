# Sentosa CMS

Content Management System for SDC IIS (Incident Information System) — managing faults, incidents, cases, and occurrences across the Sentosa network.

## Tech Stack

- **Next.js 16** (App Router) with TypeScript
- **MongoDB** for data persistence
- **Tailwind CSS v4** for styling
- **Leaflet** for map views

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Key Modules

- **Faults** — track and manage network faults
- **Incidents** — lifecycle management from detection to resolution
- **Cases** — group related incidents for investigation
- **Occurrences** — log discrete events tied to incidents or cases

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## Database

Uses MongoDB. Set the connection string in `.env.local`:

```
MONGODB_URI=mongodb://...
```
