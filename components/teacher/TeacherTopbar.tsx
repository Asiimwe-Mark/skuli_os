"use client";

import { Menu } from "lucide-react";

export function TeacherTopbar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="lg:hidden sticky top-0 z-30 h-14 bg-navy border-b border-white/10 flex items-center px-4 gap-3">
      <button onClick={onMenuClick} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
        <Menu className="w-5 h-5" />
      </button>
      <span className="font-bold text-lg">
        SK<span className="text-amber">U</span>LI
      </span>
    </header>
  );
}
