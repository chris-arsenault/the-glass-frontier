import { createContext, useContext } from "react";

const SessionContext = createContext(null);

export function SessionProvider({ value, children }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSessionContext must be used within a SessionProvider.");
  }
  return context;
}

