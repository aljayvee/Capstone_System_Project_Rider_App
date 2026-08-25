import { registerRootComponent } from 'expo';

// Must be imported before the app tree mounts so expo-task-manager's headless
// task is defined even on a cold start triggered by the OS (background
// location wake-up), not only when a rider manually opens the app.
import './src/tasks/locationTrackingTask';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
