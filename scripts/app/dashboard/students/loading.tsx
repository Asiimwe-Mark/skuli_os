export default function StudentsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="h-8 w-36 bg-bg-tertiary rounded-lg" />
        <div className="h-10 w-32 bg-bg-tertiary rounded-lg" />
      </div>
      <div className="h-12 w-full bg-bg-tertiary rounded-lg" />
      <div className="space-y-2">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-14 bg-bg-tertiary rounded-lg" />
        ))}
      </div>
    </div>
  );
}
