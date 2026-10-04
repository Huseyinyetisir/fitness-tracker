export default function ComingSoon({ title }: { title: string }) {
  return (
    <section className="py-8 text-center">
      <h1 className="mb-2 text-2xl font-semibold">{title}</h1>
      <p className="text-muted">Arrives later in this build.</p>
    </section>
  );
}
