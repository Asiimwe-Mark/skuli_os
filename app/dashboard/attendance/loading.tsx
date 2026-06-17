export default function AttendanceLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-40 bg-bg-tertiary rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-bg-tertiary rounded-xl" />
        ))}
      </div>
      <div className="h-12 w-full bg-bg-tertiary rounded-lg" />
      <div className="space-y-2">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="h-12 bg-bg-tertiary rounded-lg" />
        ))}
      </div>
    </div>
  );
}
