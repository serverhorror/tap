# take_a_pick

take_a_pick is a lightweight, client-side slot machine–style name picker that lets you enter names as chips, spin a visual reel to pick a winner, and optionally remove the winner from the list while persisting your state and preferences in localStorage.

## Prerequisites

- Node.js 22 LTS (recommended)
- npm

## Getting started (dev server)

1. Install dependencies: `npm install`
2. Start dev server with HMR: `npm run dev`
   - Open the URL printed in the terminal (usually `http://localhost:5173`).

## Running tests

- Run once and exit: `npm test`
- Watch mode: `npm run test:watch`

## Build for static hosting

1. Build the production bundle: `npm run build`
   - Output goes to `dist/`
2. Preview the built bundle locally (served): `npm run preview`

## Serve the built bundle from any static server

After `npm run build`, serve the `dist/` folder:

- Python: `python -m http.server -d dist 8080`
- nginx / any static host: point the web root to the `dist/` directory.
