import { lazy, Suspense } from 'react';
import Loading from '../components/Loading';
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
import BodyForm from '../features/progress/BodyForm';
import SettingsScreen from '../features/settings/SettingsScreen';
import type { Route } from './routes';

// The charts library is the largest dependency by far. Loading it only when
// Progress opens keeps it out of the startup path of the screens used in the gym.
const ProgressScreen = lazy(() => import('../features/progress/ProgressScreen'));
const ExerciseDetail = lazy(() => import('../features/progress/ExerciseDetail'));

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
      return (
        <Suspense fallback={<Loading />}>
          <ProgressScreen view={route.view} range={route.range} />
        </Suspense>
      );
    case 'progress-exercise':
      return (
        <Suspense fallback={<Loading />}>
          <ExerciseDetail key={route.id} id={route.id} range={route.range} />
        </Suspense>
      );
    case 'body':
      return <BodyForm key={route.id} id={route.id} />;
    case 'log':
      return <HistoryScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}
