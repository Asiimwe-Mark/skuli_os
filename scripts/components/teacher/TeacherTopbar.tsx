"use client";

import { Menu, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

interface TeacherTopbarProps {
  onMenuClick: () => void;
  onSearchClick?: () => void;
}

export function TeacherTopbar({ onMenuClick, onSearchClick }: TeacherTopbarProps) {
  return (
    <header className="lg:hidden sticky top-0 z-30 h-16 bg-bg border-b border-border flex items-center px-4 gap-2">
      <button
        onClick={onMenuClick}
        className="p-2 rounded-xl text-muted hover:text-heading hover:bg-card-hover transition-colors"
        aria-label="Open navigation"
      >
        <Menu className="w-5 h-5" />
      </button>

      <Link href="/teacher" className="flex-1 flex items-center gap-1.5">
        <div className="relative w-7 h-7 rounded-lg flex items-center justify-center shadow-card">
          <span className="text-white font-display font-bold text-xs">S</span>
          <div className="absolute -inset-0.5 rounded-lg opacity-30 blur-md -z-10" />
        </div>
        <span className="font-display text-base font-bold">SKULI</span>
        <Sparkles className="h-3.5 w-3.5 text-primary ml-0.5" />
      </Link>

      {onSearchClick && (
        <button
          onClick={onSearchClick}
          className="p-2 rounded-xl text-muted hover:text-heading hover:bg-card-hover transition-colors"
          aria-label="Search"
        >
          <Search className="w-4 h-4" />
        </button>
      )}
      <ThemeToggle className="h-10 w-10" />
    </header>
  );
}
