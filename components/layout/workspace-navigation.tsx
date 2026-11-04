"use client";

import { createContext, useContext, useEffect } from "react";

export const WorkspaceNavigation = createContext<(href: string | null) => void>(() => {});
export function useWorkspaceNavigation(href: string | null) {
  const setNavigation = useContext(WorkspaceNavigation);
  useEffect(() => { setNavigation(href); return () => setNavigation(null); }, [href, setNavigation]);
}
