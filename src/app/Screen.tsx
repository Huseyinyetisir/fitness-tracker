import ExerciseForm from '../features/library/ExerciseForm';
import LibraryScreen from '../features/library/LibraryScreen';
import HistoryScreen from '../features/log/HistoryScreen';
import RunLogger from '../features/log/RunLogger';
import SessionLogger from '../features/log/SessionLogger';
import TodayScreen from '../features/log/TodayScreen';
import PlanDaysScreen from '../features/plan/PlanDaysScreen';
import WeekView from '../features/plan/WeekView';
import WorkoutEditor from '../features/plan/WorkoutEditor';
import WorkoutsScreen from '../features/plan/WorkoutsScreen';
import ProgressScreen from '../features/progress/ProgressScreen';
import SettingsScreen from '../features/settings/SettingsScreen';
import type { Route } from './routes';

export default function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'today':
      return <TodayScreen />;
    case 'session':
      return <SessionLogger key={route.id} id={route.id} from={route.from} />;
    case 'run':
      return <RunLogger key={route.id} sessionId={route.id} from={route.from} />;
    case 'run-new':
      return <RunLogger key={`${route.exerciseId}:${route.date}`} exerciseId={route.exerciseId} date={route.date} />;
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
    case 'log':
      return <HistoryScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}
