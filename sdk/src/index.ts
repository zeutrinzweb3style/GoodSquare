import { GoodSquareError } from "./error.js";
import type {
  ApiKey,
  Community,
  CommunityMember,
  Page,
  Payment,
  Profile,
  Proposal,
  Quest,
  QuestSubmission,
  ReputationSummary,
  Treasury,
  WebhookDelivery,
  WebhookEndpoint,
} from "./types.js";

export { GoodSquareError } from "./error.js";
export { verifyWebhookSignature } from "./verify.js";
export type { VerifyWebhookInput } from "./verify.js";
export * from "./types.js";
export * from "./contracts.js";

export interface GoodSquareOptions {
  /**
   * API key (`gs_live_...` or `gs_test_...`). Sent as a bearer token. Create
   * one from the Developer Portal. Omit only for endpoints that are public.
   */
  apiKey?: string;
  /** Base URL of the API. Defaults to the public deployment. */
  baseUrl?: string;
  /** Override the fetch implementation (useful for tests or proxies). */
  fetch?: typeof fetch;
  /** Max automatic retries on 429/5xx. Defaults to 2. */
  maxRetries?: number;
}

const DEFAULT_BASE_URL = "https://goodsquare.xyz";

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** When false, skip the Authorization header even if a key is configured. */
  auth?: boolean;
}

/** Envelope the API wraps successful responses in. */
interface ApiEnvelope<T> {
  data: T;
}

interface ApiErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

function buildQuery(query?: Record<string, string | number | undefined>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

/**
 * Typed client for the Good Square REST API.
 *
 * ```ts
 * const gs = new GoodSquare({ apiKey: process.env.GOODSQUARE_API_KEY });
 * const { communities } = await gs.communities.list({ limit: 10 });
 * ```
 */
export class GoodSquare {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;

  constructor(options: GoodSquareOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.maxRetries = options.maxRetries ?? 2;
    if (!this.fetchImpl) {
      throw new Error("No fetch implementation available; pass options.fetch");
    }
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}${options.path}${buildQuery(options.query)}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.auth !== false && this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    let attempt = 0;
    for (;;) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: options.method ?? "GET",
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
      } catch (error) {
        if (attempt < this.maxRetries) {
          await delay(backoffMs(attempt));
          attempt += 1;
          continue;
        }
        throw new GoodSquareError(
          error instanceof Error ? error.message : "Network request failed",
          { status: 0, code: "NETWORK_ERROR" },
        );
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt < this.maxRetries) {
          await delay(retryAfterMs(response) ?? backoffMs(attempt));
          attempt += 1;
          continue;
        }
      }

      const text = await response.text();
      const json = text ? (JSON.parse(text) as unknown) : undefined;

      if (!response.ok) {
        const envelope = json as ApiErrorEnvelope | undefined;
        throw new GoodSquareError(
          envelope?.error?.message ?? `Request failed with ${response.status}`,
          {
            status: response.status,
            code: envelope?.error?.code ?? "HTTP_ERROR",
            details: envelope?.error?.details,
          },
        );
      }

      return (json as ApiEnvelope<T>).data;
    }
  }

  // ---- Communities -------------------------------------------------------

  readonly communities = {
    list: (params: { limit?: number; offset?: number } = {}) =>
      this.request<{
        communities: Community[];
        total: number;
        limit: number;
        offset: number;
      }>({ path: "/api/v1/communities", query: params, auth: false }),

    get: (id: string) =>
      this.request<Community>({ path: `/api/v1/communities/${id}` }),

    create: (input: {
      name: string;
      slug: string;
      description?: string;
      visibility?: "public" | "private";
    }) =>
      this.request<Community>({
        method: "POST",
        path: "/api/v1/communities",
        body: input,
      }),

    members: (id: string, params: { limit?: number; offset?: number } = {}) =>
      this.request<{ members: CommunityMember[] }>({
        path: `/api/v1/communities/${id}/members`,
        query: params,
      }),

    join: (id: string) =>
      this.request<{ membership: CommunityMember }>({
        method: "POST",
        path: `/api/v1/communities/${id}/join`,
      }),

    leave: (id: string) =>
      this.request<{ left: boolean }>({
        method: "DELETE",
        path: `/api/v1/communities/${id}/join`,
      }),

    leaderboard: (id: string, params: { limit?: number } = {}) =>
      this.request<{ leaderboard: unknown[] }>({
        path: `/api/v1/communities/${id}/leaderboard`,
        query: params,
      }),

    quests: (id: string, params: { limit?: number; offset?: number } = {}) =>
      this.request<{ quests: Quest[] }>({
        path: `/api/v1/communities/${id}/quests`,
        query: params,
      }),

    proposals: (id: string, params: { limit?: number; offset?: number } = {}) =>
      this.request<{ proposals: Proposal[] }>({
        path: `/api/v1/communities/${id}/proposals`,
        query: params,
      }),

    treasury: (id: string) =>
      this.request<{ treasury: Treasury }>({
        path: `/api/v1/communities/${id}/treasury`,
      }),
  };

  // ---- Quests ------------------------------------------------------------

  readonly quests = {
    get: (id: string) => this.request<Quest>({ path: `/api/v1/quests/${id}` }),

    submissions: (id: string, params: { limit?: number; offset?: number } = {}) =>
      this.request<{ submissions: QuestSubmission[] }>({
        path: `/api/v1/quests/${id}/submissions`,
        query: params,
      }),

    submit: (id: string, input: { proofUrl?: string; proofText?: string }) =>
      this.request<QuestSubmission>({
        method: "POST",
        path: `/api/v1/quests/${id}/submissions`,
        body: input,
      }),
  };

  // ---- Reputation --------------------------------------------------------

  readonly reputation = {
    get: (wallet: string, community?: string) =>
      this.request<{
        summary: ReputationSummary;
        history: unknown[];
        badges: unknown[];
      }>({
        path: `/api/v1/reputation/${wallet}`,
        query: { community },
      }),
  };

  // ---- Proposals ---------------------------------------------------------

  readonly proposals = {
    get: (id: string) =>
      this.request<Proposal>({ path: `/api/v1/proposals/${id}` }),

    results: (id: string) =>
      this.request<{ results: unknown }>({
        path: `/api/v1/proposals/${id}/results`,
      }),

    vote: (id: string, input: { choice: "for" | "against" | "abstain"; reason?: string }) =>
      this.request<{ vote: unknown }>({
        method: "POST",
        path: `/api/v1/proposals/${id}/vote`,
        body: input,
      }),
  };

  // ---- Payments ----------------------------------------------------------

  readonly payments = {
    list: (
      params: { community?: string; limit?: number; offset?: number } = {},
    ) =>
      this.request<{ payments: Payment[] }>({
        path: "/api/v1/payments",
        query: params,
      }),

    record: (input: {
      communityId?: string;
      paymentRequestId?: string;
      payeeAddress: string;
      tokenSymbol: string;
      amount: string;
      txHash: string;
    }) =>
      this.request<Payment>({
        method: "POST",
        path: "/api/v1/payments",
        body: input,
      }),

    requests: {
      list: (params: { limit?: number; offset?: number } = {}) =>
        this.request<{ paymentRequests: unknown[] }>({
          path: "/api/v1/payment-requests",
          query: params,
        }),
      get: (id: string) =>
        this.request<{ paymentRequest: unknown }>({
          path: `/api/v1/payment-requests/${id}`,
        }),
      create: (input: {
        communityId?: string;
        tokenSymbol: string;
        amount: string;
        memo?: string;
      }) =>
        this.request<{ paymentRequest: unknown }>({
          method: "POST",
          path: "/api/v1/payment-requests",
          body: input,
        }),
    },
  };

  // ---- Profiles ----------------------------------------------------------

  readonly profiles = {
    get: (wallet: string) =>
      this.request<Profile>({ path: `/api/v1/profiles/${wallet}`, auth: false }),

    update: (input: {
      username?: string;
      displayName?: string;
      bio?: string;
      avatarUrl?: string;
    }) =>
      this.request<Profile>({
        method: "PATCH",
        path: "/api/v1/profiles/me",
        body: input,
      }),
  };

  // ---- Developer: API keys ----------------------------------------------

  readonly apiKeys = {
    list: () => this.request<{ apiKeys: ApiKey[] }>({ path: "/api/v1/api-keys" }),

    create: (input: {
      name: string;
      scopes?: string[];
      environment?: "live" | "test";
    }) =>
      this.request<{ apiKey: ApiKey; key: string }>({
        method: "POST",
        path: "/api/v1/api-keys",
        body: input,
      }),

    revoke: (id: string) =>
      this.request<{ revoked: boolean }>({
        method: "DELETE",
        path: `/api/v1/api-keys/${id}`,
      }),
  };

  // ---- Developer: webhooks ----------------------------------------------

  readonly webhooks = {
    list: () =>
      this.request<{ endpoints: WebhookEndpoint[] }>({ path: "/api/v1/webhooks" }),

    create: (input: {
      url: string;
      events: string[];
      communityId?: string;
    }) =>
      this.request<{ endpoint: WebhookEndpoint & { secret: string } }>({
        method: "POST",
        path: "/api/v1/webhooks",
        body: input,
      }),

    update: (
      id: string,
      input: { url?: string; events?: string[]; active?: boolean },
    ) =>
      this.request<{ endpoint: WebhookEndpoint }>({
        method: "PATCH",
        path: `/api/v1/webhooks/${id}`,
        body: input,
      }),

    delete: (id: string) =>
      this.request<{ deleted: boolean }>({
        method: "DELETE",
        path: `/api/v1/webhooks/${id}`,
      }),

    deliveries: (id: string) =>
      this.request<{ deliveries: WebhookDelivery[] }>({
        path: `/api/v1/webhooks/${id}/deliveries`,
      }),
  };

  /** Fetches every page of a paginated endpoint. */
  async paginate<T>(
    fetchPage: (offset: number) => Promise<Page<T>>,
    pageSize = 100,
  ): Promise<T[]> {
    const all: T[] = [];
    let offset = 0;
    for (;;) {
      const page = await fetchPage(offset);
      all.push(...page.items);
      if (page.items.length < pageSize) break;
      offset += pageSize;
    }
    return all;
  }
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
