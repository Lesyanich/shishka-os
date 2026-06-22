// The cook-facing route (/kitchen/my-tasks) and the manager route (/staff-tasks)
// now render the same unified board. Kept as a thin alias so existing imports and
// the lazy route in App.tsx keep working.
export { KitchenTasksPage as CookTasksPage } from './KitchenTasksPage'
export { default } from './KitchenTasksPage'
