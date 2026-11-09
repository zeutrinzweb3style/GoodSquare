/**
 * Example: a webhook receiver that verifies the signature before trusting the
 * payload. Runs on any Web-standard runtime (Node 18+, Deno, Bun, Workers).
 *
 *   GOODSQUARE_WEBHOOK_SECRET=whsec_... \
 *   node --experimental-strip-types webhook-receiver.ts
 */
import { createServer } from "node:http";
import { verifyWebhookSignature } from "@goodsquare/sdk";

const secret = process.env.GOODSQUARE_WEBHOOK_SECRET;
if (!secret) throw new Error("Set GOODSQUARE_WEBHOOK_SECRET");

const server = createServer((request, response) => {
  if (request.method !== "POST") {
    response.writeHead(405).end();
    return;
  }

  const chunks: Buffer[] = [];
  request.on("data", (chunk) => chunks.push(chunk as Buffer));
  request.on("end", async () => {
    const raw = Buffer.concat(chunks).toString("utf8");

    const ok = await verifyWebhookSignature({
      secret,
      header: request.headers["x-goodsquare-signature"] as string | undefined,
      rawBody: raw,
    });
    if (!ok) {
      response.writeHead(400).end("invalid signature");
      return;
    }

    const event = JSON.parse(raw);
    console.log(`received ${event.event} (${event.id})`);

    switch (event.event) {
      case "payment.received":
        console.log(`  paid ${event.data.amount} ${event.data.tokenSymbol}`);
        break;
      case "treasury.spending.approved":
        console.log(`  spending approved: ${event.data.title}`);
        break;
      case "reward.paid":
        console.log(`  reward paid to ${event.data.address}`);
        break;
      default:
        break;
    }

    // Respond 2xx fast; the sender retries non-2xx responses with backoff.
    response.writeHead(204).end();
  });
});

server.listen(3000, () => console.log("listening on http://localhost:3000"));
