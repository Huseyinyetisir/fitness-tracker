import ComingSoon from '../components/ComingSoon';
import ExerciseForm from '../features/library/ExerciseForm';
import LibraryScreen from '../features/library/LibraryScreen';
import PlanDaysScreen from '../features/plan/PlanDaysScreen';
import WeekView from '../features/plan/WeekView';
import WorkoutEditor from '../features/plan/WorkoutEditor';
import WorkoutsScreen from '../features/plan/WorkoutsScreen';
import ProgressScreen from '../features/progress/ProgressScreen';
import SettingsScreen from '../features/settings/SettingsScreen';
import type { Route } from './routes';

export default function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'plan':
      return <WeekView key={route.week ?? 'this-week'} week={route.week} />;
    case 'plan-days':
      return <PlanDaysScreen />;
    case 'workouts':
      return <WorkoutsScreen />;
    case 'workout':
      return <WorkoutEditor key={route.id} id={route.id} />;
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
