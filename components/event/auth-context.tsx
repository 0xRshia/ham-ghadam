"use client";
import { createContext, useContext } from "react";
import type { User } from "@/lib/types";

export type Auth = {
  user: User | null;
  loading: boolean;
  smsReady: boolean;
  // TODO(PRODUCTION): REMOVE_TEMP_LOGIN — remove this flag and its initial values.
  temporaryLoginEnabled: boolean;
  paymentReady: boolean;
  skipPayDevEnabled: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  loggingOut: boolean;
};
export const AuthContext = createContext<Auth>({
  user: null,
  loading: true,
  smsReady: false,
  temporaryLoginEnabled: false,
  paymentReady: false,
  skipPayDevEnabled: false,
  refresh: async () => {},
  logout: async () => {},
  loggingOut: false,
});
export const useAuth = () => useContext(AuthContext);
