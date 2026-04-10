"use client";

import { createContext, useContext } from "react";

interface SidebarContextValue {
  open: boolean;
  toggle: () => void;
}

export const SidebarContext = createContext<SidebarContextValue>({
  open: true,
  toggle: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}
