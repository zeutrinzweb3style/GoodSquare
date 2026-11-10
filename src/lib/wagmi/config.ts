"use client";

import { http, createConfig } from "wagmi";
import { celo, celoSepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { walletConnectMetadata } from "@/lib/wallet/connectors";

const targetChainId = Number(
  process.env.NEXT_PUBLIC_CELO_CHAIN_ID ?? celoSepolia.id,
);
const chains = targetChainId === celo.id ? ([celo, celoSepolia] as const) : ([celoSepolia, celo] as const);

export const defaultChain = chains[0];

/** Chain ids the wallet can be asked to switch to. */
export type SupportedChainId = (typeof chains)[number]["id"];

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

/**
 * WalletConnect is only added when a Reown project id is configured, so a
 * missing id degrades to the injected wallet instead of crashing the app.
 */
const connectors = [
  injected(),
  ...(projectId
    ? [
        walletConnect({
          projectId,
          showQrModal: true,
          metadata: walletConnectMetadata(
            typeof window !== "undefined" ? window.location.origin : "https://goodsquare.app",
          ),
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains,
  connectors,
  transports: {
    [celo.id]: http(process.env.NEXT_PUBLIC_CELO_RPC_URL || undefined),
    [celoSepolia.id]: http(
      process.env.NEXT_PUBLIC_CELO_SEPOLIA_RPC_URL || undefined,
    ),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
