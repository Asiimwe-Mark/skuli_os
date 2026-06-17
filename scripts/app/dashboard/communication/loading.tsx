export default function CommunicationLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-44 bg-bg-tertiary rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-32 bg-bg-tertiary rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-16 bg-bg-tertiary rounded-lg" />
        ))}
      </div>
    </div>
  );
}
