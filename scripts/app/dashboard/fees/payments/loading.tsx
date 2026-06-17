export default function FeePaymentsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="h-8 w-44 bg-bg-tertiary rounded-lg" />
        <div className="h-10 w-32 bg-bg-tertiary rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-bg-tertiary rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-14 bg-bg-tertiary rounded-lg" />
        ))}
      </div>
    </div>
  );
}
