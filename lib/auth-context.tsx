"use client";

import React, { createContext, useContext, useState } from "react";

export type OfficerUser = {
  id: string;
  username: string;
  name: string;
  role: "officer" | "admin";
  badge_number?: string;
  zone?: string;
};

export const DEMO_OFFICERS: OfficerUser[] = [
  {
    id: "OFF-001",
    username: "officer.sharma",
    name: "Inspector Rajesh Sharma",
    role: "officer",
    badge_number: "LM-DL-8821",
    zone: "North Zone (Delhi)",
  },
  {
    id: "OFF-002",
    username: "officer.verma",
    name: "Inspector Priya Verma",
    role: "officer",
    badge_number: "LM-MH-4402",
    zone: "West Zone (Mumbai)",
  },
  {
    id: "OFF-003",
    username: "officer.patel",
    name: "Inspector Anand Patel",
    role: "officer",
    badge_number: "LM-KA-7190",
    zone: "South Zone (Bengaluru)",
  },
  {
    id: "ADM-001",
    username: "admin",
    name: "Dr. S. Nair (Chief Controller)",
    role: "admin",
    badge_number: "CLM-HQ-001",
    zone: "Central Directorate (HQ)",
  },
];

interface AuthContextType {
  user: OfficerUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (
    username: string,
    password: string
  ) => Promise<{ success: boolean; error?: string }>;
  loginAsDemo: (userId: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_USER_KEY = "legal_metrology_officer_user";
const STORAGE_TOKEN_KEY = "legal_metrology_officer_token";
const API_BASE = "http://127.0.0.1:8000";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<OfficerUser | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const savedUserStr = localStorage.getItem(STORAGE_USER_KEY);
      return savedUserStr ? JSON.parse(savedUserStr) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(STORAGE_TOKEN_KEY);
    } catch {
      return null;
    }
  });

  const [isLoading] = useState<boolean>(false);

  const saveSession = (newUser: OfficerUser, newToken: string) => {
    setUser(newUser);
    setToken(newToken);
    try {
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newUser));
      localStorage.setItem(STORAGE_TOKEN_KEY, newToken);
    } catch (e) {
      console.warn("Failed to write user to localStorage", e);
    }
  };

  const login = async (
    username: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername, password: cleanPassword }),
      });

      if (res.ok) {
        const data = await res.json();
        saveSession(data.user, data.token);
        return { success: true };
      }

      if (res.status === 401) {
        const err = await res.json().catch(() => ({}));
        return {
          success: false,
          error: err.detail || "Invalid credentials. Please verify username and password.",
        };
      }
    } catch {
      // Offline fallback for local prototype resilience
      console.info("Backend login unreachable, falling back to local credentials");
    }

    // Local fallback check
    const match = DEMO_OFFICERS.find(
      (o) =>
        (o.username.toLowerCase() === cleanUsername ||
          o.id.toLowerCase() === cleanUsername) &&
        (cleanPassword === "officer123" ||
          (o.role === "admin" && cleanPassword === "admin123"))
    );

    if (match) {
      saveSession(match, `local_token_${match.id}_${Date.now()}`);
      return { success: true };
    }

    return {
      success: false,
      error:
        "Invalid credentials. Please use demo credentials: officer.sharma / officer123 or admin / admin123.",
    };
  };

  const loginAsDemo = async (userId: string): Promise<boolean> => {
    const target = DEMO_OFFICERS.find((o) => o.id === userId);
    if (!target) return false;

    const password = target.role === "admin" ? "admin123" : "officer123";
    const res = await login(target.username, password);
    return res.success;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem(STORAGE_USER_KEY);
      localStorage.removeItem(STORAGE_TOKEN_KEY);
    } catch (e) {
      console.warn("Failed to clear user from localStorage", e);
    }
  };

  const isAuthenticated = !!user;
  const isAdmin = user?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated,
        isAdmin,
        login,
        loginAsDemo,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
