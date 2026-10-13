export const routePaths = {
  home: '/',
  reports: '/reports',
  scores: '/scores',
  weight: '/weight',
  workouts: '/workouts',
  ai: '/settings/ai',
  usage: '/settings/tokens',
  goal: '/goal',
  settings: '/settings',
  'data-handling': '/settings/data',
  invites: '/invites',
  help: '/help',
};

// Tokens and Data handling used to be their own pages.
export const legacyPaths = { '/usage': 'usage', '/data-handling': 'data-handling' };

export function routeFromPath(pathname) {
  if (legacyPaths[pathname]) return legacyPaths[pathname];
  return Object.keys(routePaths).find((route) => routePaths[route] === pathname) || 'not-found';
}
