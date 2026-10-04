import { useApp } from '../../app/AppContext';
import { SelectField } from '../../components/Fields';
import Loading from '../../components/Loading';
import ScreenHeader from '../../components/ScreenHeader';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { WEEKDAY_NAMES } from '../../lib/format';
import { defaultPlanId, planDays, setDayTemplate } from './planRepo';

export default function PlanDaysScreen() {
  const { userId } = useApp();
  const data = useLiveQuery(async () => {
    const days = await planDays(defaultPlanId(userId));
    const templates = (await db.workout_templates.toArray()).sort((a, b) => a.name.localeCompare(b.name));
    return { days, templates };
  }, [userId]);

  if (!data) return <Loading />;

  if (data.days.length === 0) {
    return (
      <section>
        <ScreenHeader title="Weekly template" back={{ name: 'plan' }} />
        <p className="text-muted">Your plan appears once the first sync completes.</p>
      </section>
    );
  }

  return (
    <section>
      <ScreenHeader title="Weekly template" back={{ name: 'plan' }} />
      <p className="mb-4 text-sm text-muted">
        Changes apply from today. Past days keep what was planned, and days you have started, edited or removed stay
        as they are.
      </p>
      <div className="space-y-3">
        {data.days.map((day) => {
          const live = data.templates.filter((t) => t._deleted === 0);
          const assigned = data.templates.find((t) => t.id === day.template_id);
          const options = [
            { value: '', label: 'Rest' },
            ...live.map((t) => ({ value: t.id, label: t.name })),
            ...(assigned && assigned._deleted === 1 ? [{ value: assigned.id, label: `${assigned.name} (deleted)` }] : []),
          ];
          return (
            <SelectField
              key={day.id}
              label={WEEKDAY_NAMES[day.weekday - 1]}
              value={day.template_id ?? ''}
              options={options}
              onChange={(value) => void setDayTemplate(day.id, value || null)}
            />
          );
        })}
      </div>
    </section>
  );
}
