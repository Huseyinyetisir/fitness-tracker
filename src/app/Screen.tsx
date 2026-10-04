import ComingSoon from '../components/ComingSoon';
import ExerciseForm from '../features/library/ExerciseForm';
import LibraryScreen from '../features/library/LibraryScreen';
import ProgressScreen from '../features/progress/ProgressScreen';
import SettingsScreen from '../features/settings/SettingsScreen';
import type { Route } from './routes';

export default function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'library':
      return <LibraryScreen />;
    case 'exercise':
      return <ExerciseForm key={route.id} id={route.id} />;
    case 'progress':
      return <ProgressScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <ComingSoon title={route.name} />;
  }
}
