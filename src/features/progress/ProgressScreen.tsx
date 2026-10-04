import ScreenHeader from '../../components/ScreenHeader';

export default function ProgressScreen() {
  return (
    <section>
      <ScreenHeader title="Progress" />
      <p className="text-muted">
        Charts arrive with the next build: estimated 1RM and PRs per exercise, weekly volume, RPE trends and the
        fatigue flag, and running distance and pace. Everything you log now feeds them.
      </p>
    </section>
  );
}
