export default function TeacherLoading() {
  return (
    <div className="p-4 lg:p-6 space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-bg-tertiary rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-bg-tertiary rounded-xl" />
        ))}
      </div>
    </div>
  );
}
