# daily-fuel

## Development

```sh
npm install
npm run dev     # API server (server.js) + Vite dev server
npm run build   # production build into dist/
```

## Project structure

```
src/
  main.jsx          entry: service worker, global styles, renders <App />
  App.jsx           app state, routing and the home (meals) screen
  app/              app-level wiring: routes, PWA/service worker helpers
  components/       shared UI used across screens (Menu, Toast, progress bars, …)
  hooks/            generic React hooks (useNow, usePresence, useEscape)
  lib/              framework-free helpers (dates, formatting, localStorage, fetch)
  features/         one folder per area of the app
    ai/             AI estimate clients (direct provider / proxy), settings, token usage
    meals/          meal & nutrition helpers, meal dialog
    barcode/        barcode scanning and product lookup
    score/          daily score algorithm, score dialog, scores calendar
    reports/        reports screen and meal-time insights
    weight/         weight tracking screen
    goal/           goal targets, goal periods and wizard
    workouts/       workout templates, routines and logs
    settings/       settings screen and its panels
    help/           help screen
    install/        "install the app" prompt
    auth/           login view (currently unused)
  styles/app.css    global styles
```

Feature folders keep plain logic in lowercase `.js` files and components in PascalCase `.jsx` files.
