import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIStore {
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;
  commandPaletteOpen: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleMobileSidebar: () => void;
  setSidebarMobileOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      commandPaletteOpen: false,

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleMobileSidebar: () =>
        set((state) => ({ sidebarMobileOpen: !state.sidebarMobileOpen })),
      setSidebarMobileOpen: (sidebarMobileOpen) => set({ sidebarMobileOpen }),
      toggleCommandPalette: () =>
        set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
    }),
    {
      name: "skuli-ui-preferences",
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    }
  )
);
