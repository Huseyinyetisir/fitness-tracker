import ComingSoon from '../components/ComingSoon';
import ProgressScreen from '../features/progress/ProgressScreen';
import SettingsScreen from '../features/settings/SettingsScreen';
import type { Route } from './routes';

export default function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'progress':
      return <ProgressScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <ComingSoon title={route.name} />;
  }
}
