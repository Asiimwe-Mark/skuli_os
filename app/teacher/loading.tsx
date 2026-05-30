export default function TeacherLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-navy-50 rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-navy-100 rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-navy-100 rounded-xl" />
    </div>
  );
}
