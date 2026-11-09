"use client";

import { http, createConfig } from "wagmi";
import { celo, celoSepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const targetChainId = Number(
  process.env.NEXT_PUBLIC_CELO_CHAIN_ID ?? celoSepolia.id,
);
const chains = targetChainId === celo.id ? ([celo, celoSepolia] as const) : ([celoSepolia, celo] as const);

export const defaultChain = chains[0];

/** Chain ids the wallet can be asked to switch to. */
export type SupportedChainId = (typeof chains)[number]["id"];

export const wagmiConfig = createConfig({
  chains,
  connectors: [injected()],
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
