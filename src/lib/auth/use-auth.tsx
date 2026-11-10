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

interface AuthResponse {
  data?: {
    authenticated?: boolean;
    address?: string;
    profile?: Profile | null;
    message?: string;
  };
  error?: { message?: string };
}

/** Reads auth responses safely when a proxy/server failure has an empty body. */
async function readAuthResponse(response: Response): Promise<AuthResponse | null> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as AuthResponse;
  } catch {
    return null;
  }
}

function responseError(
  response: Response,
  json: AuthResponse | null,
  fallback: string,
): Error {
  const message = json?.error?.message || json?.data?.message;
  return new Error(message || `${fallback} (HTTP ${response.status})`);
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
    const res = await fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) {
      setProfileState(null);
      return;
    }

    const json = await readAuthResponse(res);
    if (!json) {
      setProfileState(null);
      return;
    }
    const session = json?.data;
    if (
      session?.authenticated === true &&
      typeof session.address === "string" &&
      session.address.toLowerCase() === checksum.toLowerCase()
    ) {
      setProfileState(session.profile ?? null);
      return;
    }

    // A public profile is not proof of ownership. Mutating API routes require
    // the signed gs_session cookie returned by /api/auth/verify.
    setProfileState(null);
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
      const nonceJson = await readAuthResponse(nonceRes);
      if (!nonceRes.ok) {
        throw responseError(nonceRes, nonceJson, "Could not start sign-in");
      }
      const message = nonceJson?.data?.message;
      if (!message) {
        throw responseError(nonceRes, nonceJson, "Could not start sign-in");
      }

      const signature = await signMessageAsync({ message });

      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: checksum, message, signature }),
      });
      const verifyJson = await readAuthResponse(verifyRes);
      if (!verifyRes.ok) {
        throw responseError(verifyRes, verifyJson, "Sign-in failed");
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
