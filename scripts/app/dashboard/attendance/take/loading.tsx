export default function TakeAttendanceLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-56 bg-bg-tertiary rounded-lg" />
      <div className="h-12 w-full bg-bg-tertiary rounded-lg" />
      <div className="space-y-2">
        {[...Array(20)].map((_, i) => (
          <div key={i} className="h-14 bg-bg-tertiary rounded-lg" />
        ))}
      </div>
    </div>
  );
}
