export default function PortalLoading() {
  return (
    <div className="p-4 space-y-4 animate-pulse">
      <div className="h-8 w-40 bg-bg-tertiary rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-bg-tertiary rounded-xl" />
        ))}
      </div>
    </div>
  );
}
