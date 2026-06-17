export default function DefaultersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-44 bg-bg-tertiary rounded-lg" />
      <div className="h-12 w-full bg-bg-tertiary rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-bg-tertiary rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(15)].map((_, i) => (
          <div key={i} className="h-12 bg-bg-tertiary rounded-lg" />
        ))}
      </div>
    </div>
  );
}
