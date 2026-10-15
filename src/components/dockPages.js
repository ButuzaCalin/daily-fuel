import { BarChart3, CircleHelp, Dumbbell, Home, Medal, Scale, Settings, Target, UserPlus } from 'lucide-react';
import { scoringAvailable } from '../features/score/score.js';

// Today always comes first; the next DOCK_SLOTS available pages fill the dock and the rest go under "More".
export const DOCK_SLOTS = 3;
export const homePage = { route: 'home', label: 'Today', icon: Home };
export const dockPages = [
  { route: 'reports', label: 'Reports', icon: BarChart3 },
  { route: 'workouts', label: 'Workouts', icon: Dumbbell },
  { route: 'goal', label: 'Goal', icon: Target },
  { route: 'scores', label: 'Scores', icon: Medal },
  { route: 'weight', label: 'Weight', icon: Scale },
  { route: 'invites', label: 'My invites', icon: UserPlus },
  { route: 'settings', label: 'Settings', icon: Settings },
  { route: 'help', label: 'How to use', icon: CircleHelp },
];
export const defaultDockOrder = dockPages.map((page) => page.route);

// The saved order with unknown routes dropped and pages added later appended.
export function fullDockOrder(order) {
  const known = (Array.isArray(order) ? order : []).filter((route) => defaultDockOrder.includes(route));
  return [...new Set([...known, ...defaultDockOrder])];
}

export function availableDockPages(order, goal, canInvite) {
  const available = {
    workouts: Boolean(goal?.workouts),
    scores: scoringAvailable(goal),
    weight: Boolean(goal?.weightTracking),
    invites: canInvite,
  };
  return fullDockOrder(order).filter((route) => available[route] ?? true).map((route) => dockPages.find((page) => page.route === route));
}

// Writes a reordered list of the available pages back into the full order, leaving hidden pages where they were.
export function mergeDockOrder(order, reordered) {
  const full = fullDockOrder(order);
  const moved = new Set(reordered);
  const queue = [...reordered];
  return full.map((route) => (moved.has(route) ? queue.shift() : route));
}
