// Manager route (/staff-tasks) — renders the same unified board as the cook
// route (/kitchen/my-tasks). Kept as a thin alias so existing imports and the
// lazy route in App.tsx keep working.
export { KitchenTasksPage as StaffTasksPage } from './KitchenTasksPage'
export { default } from './KitchenTasksPage'
