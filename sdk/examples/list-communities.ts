/**
 * Example: list communities and read one community's reputation leaderboard.
 *
 *   GOODSQUARE_API_KEY=gs_test_... node --experimental-strip-types list-communities.ts
 */
import { GoodSquare, GoodSquareError } from "@goodsquare/sdk";

const gs = new GoodSquare({
  apiKey: process.env.GOODSQUARE_API_KEY,
  // Point at a local or testnet deployment while developing:
  baseUrl: process.env.GOODSQUARE_BASE_URL,
});

async function main() {
  const { communities, total } = await gs.communities.list({ limit: 5 });
  console.log(`${total} public communities`);

  for (const community of communities) {
    console.log(`- ${community.name} (${community.slug})`);

    const { leaderboard } = await gs.communities.leaderboard(community.id, {
      limit: 3,
    });
    console.log(`  top contributors: ${JSON.stringify(leaderboard)}`);
  }
}

main().catch((error) => {
  if (error instanceof GoodSquareError) {
    console.error(`API error ${error.status} (${error.code}): ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
