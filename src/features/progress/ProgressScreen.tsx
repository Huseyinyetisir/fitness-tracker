import type { ProgressView } from '../../app/routes';
import Loading from '../../components/Loading';
import ScreenHeader from '../../components/ScreenHeader';
import { useLiveQuery } from '../../db/useLiveQuery';
import { DEFAULT_RANGE, rangeStart, type RangeKey } from '../../lib/ranges';
import { today } from '../../lib/time';
import BodyView from './BodyView';
import ExercisesView from './ExercisesView';
import { loadProgressData, type ProgressData } from './progressData';
import { RangePicker, ViewTabs } from './ProgressNav';
import RpeView from './RpeView';
import RunningView from './RunningView';
import StrengthView from './StrengthView';

/** What every view receives: the data, and the range already resolved to dates. */
export interface ViewProps {
  data: ProgressData;
  start: string;
  todayDate: string;
  range: RangeKey;
}

export default function ProgressScreen({ view = 'strength', range = DEFAULT_RANGE }: { view?: ProgressView; range?: RangeKey }) {
  const todayDate = today();
  const data = useLiveQuery(() => loadProgressData(todayDate), [todayDate]);

  return (
    <section>
      <ScreenHeader title="Progress" />
      <ViewTabs view={view} range={range} />
      <RangePicker value={range} route={(r) => ({ name: 'progress', view, range: r })} />
      {data ? (
        <View view={view} props={{ data, start: rangeStart(range, todayDate, data.earliest), todayDate, range }} />
      ) : (
        <Loading />
      )}
    </section>
  );
}

function View({ view, props }: { view: ProgressView; props: ViewProps }) {
  switch (view) {
    case 'strength':
      return <StrengthView {...props} />;
    case 'exercises':
      return <ExercisesView {...props} />;
    case 'rpe':
      return <RpeView {...props} />;
    case 'running':
      return <RunningView {...props} />;
    case 'body':
      return <BodyView {...props} />;
  }
}
