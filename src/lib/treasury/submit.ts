"use client";

/**
 * Submit a transaction hash for server-side verification, retrying briefly
 * while the transaction is still being mined. A 409 that reports the record
 * already exists is treated as success, so a double submit is harmless.
 */
export async function submitWithRetry(
  url: string,
  body: unknown,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<unknown> {
  const { attempts = 6, delayMs = 2500 } = options;
  let lastError = "Verification failed";

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);

    if (res.ok) return json?.data ?? null;

    const message: string = json?.error?.message ?? "Verification failed";
    lastError = message;

    if (res.status === 409 && /already recorded/i.test(message)) {
      return null;
    }
    // Not mined or not found yet: wait and try again.
    if (res.status === 400 && /not found|did not succeed/i.test(message)) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    throw new Error(message);
  }

  throw new Error(lastError);
}
