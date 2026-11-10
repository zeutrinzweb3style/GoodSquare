/**
 * Example: record a payment after verifying the transfer on-chain.
 *
 * Good Square is non-custodial: the payer sends an ERC-20 transfer from their
 * own wallet, then the hash is recorded here. The server re-verifies the
 * transfer against the approved terms before storing it.
 *
 *   GOODSQUARE_API_KEY=gs_live_... \
 *   node --experimental-strip-types record-payment.ts
 */
import { GoodSquare } from "@goodsquare/sdk";

const gs = new GoodSquare({ apiKey: process.env.GOODSQUARE_API_KEY });

async function main() {
  const payment = await gs.payments.record({
    communityId: process.env.COMMUNITY_ID,
    paymentRequestId: process.env.PAYMENT_REQUEST_ID,
    payeeAddress: "0xPAYEE...",
    tokenSymbol: "USDC",
    // 1.5 USDC, 6 decimals, base units as a string.
    amount: "1500000",
    txHash: "0xTRANSFER_HASH...",
  });

  console.log(`Recorded payment ${payment.id} (${payment.tx_hash})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
