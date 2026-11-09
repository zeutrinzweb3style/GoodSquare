"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { getAddress } from "viem";
import type { Profile } from "@/lib/types";

interface AuthState {
  address: string | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSigningIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: Profile) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [profile, setProfileState] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checksum = address ? getAddress(address) : null;

  const refreshProfile = useCallback(async () => {
    if (!checksum) {
      setProfileState(null);
      return;
    }
    const res = await fetch(`/api/v1/profiles/${checksum}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const json = await res.json();
      setProfileState(json.data ?? null);
    } else {
      setProfileState(null);
    }
  }, [checksum]);

  useEffect(() => {
    let active = true;
    (async () => {
      setIsLoading(true);
      try {
        await refreshProfile();
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshProfile]);

  const signIn = useCallback(async () => {
    if (!checksum) {
      setError("Connect a wallet first");
      return;
    }
    setError(null);
    setIsSigningIn(true);
    try {
      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: checksum }),
      });
      const nonceJson = await nonceRes.json();
      if (!nonceRes.ok) {
        throw new Error(nonceJson?.error?.message ?? "Could not start sign-in");
      }
      const message: string = nonceJson.data.message;

      const signature = await signMessageAsync({ message });

      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: checksum, message, signature }),
      });
      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyJson?.error?.message ?? "Sign-in failed");
      }
      await refreshProfile();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      setError(msg);
      throw err;
    } finally {
      setIsSigningIn(false);
    }
  }, [checksum, signMessageAsync, refreshProfile]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setProfileState(null);
  }, []);

  const setProfile = useCallback((next: Profile) => {
    setProfileState(next);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        address: checksum,
        profile,
        isAuthenticated: Boolean(profile),
        isLoading,
        isSigningIn,
        error,
        signIn,
        signOut,
        refreshProfile,
        setProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
