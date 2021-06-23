import { ORDER_SIDE_BID, ORDER_SIDE_ASK } from "./config";
import { defaultClient as client } from "./client";
import {
  sleep,
  putLimitOrder,
  getRandomFloatAround,
  getRandomElem,
  depositAssets
} from "./util";
import axios from "axios";

const verbose = true;
const botsIds = [10, 11, 12, 13, 14];
let markets: Array<string> = [];
let prices = new Map<string, number>();

async function initAssets() {
  await client.connect();
  markets = Array.from(client.markets.keys());
  for (const u of botsIds) {
    await depositAssets({ USDT: "500000.0" }, u);
    for (const [name, info] of client.markets) {
      const base = info.base;
      const depositReq = {};
      depositReq[base] = "10";
      await depositAssets(depositReq, u);
    }
  }
}
function randUser() {
  return getRandomElem(botsIds);
}
async function updatePrices(backend) {
  try {
    if (backend == "coinstats") {
      const url =
        "https://api.coinstats.app/public/v1/coins?skip=0&limit=100&currency=USD";
      const data = await axios.get(url);
      for (const elem of data.data.coins) {
        prices.set(elem.symbol, elem.price);
      }
    } else if (backend == "cryptocompare") {
      const url =
        "https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD";
      // TODO
    }
  } catch (e) {
    console.log("update price err", e);
  }
}

function getPrice(token: string): number {
  const price = prices.get(token);
  if (verbose) {
    console.log("price", token, price);
  }
  return price;
}

async function run() {
  let cnt = 0;
  while (true) {
    try {
      await sleep(1000);
      if (cnt % 300 == 0) {
        await client.orderCancelAll(randUser(), getRandomElem(markets));
      }
      if (cnt % 60 == 0) {
        await updatePrices("coinstats");
      }

      const market = getRandomElem(markets);
      const price = getPrice(market.split("_")[0]);
      await putLimitOrder(
        randUser(),
        market,
        getRandomElem([ORDER_SIDE_BID, ORDER_SIDE_ASK]),
        getRandomFloatAround(3, 0.5),
        getRandomFloatAround(price)
      );
      cnt += 1;
    } catch (e) {
      console.log(e);
    }
  }
}
async function main() {
  await client.debugReset();
  await initAssets();
  await run();
}
main().catch(console.log);
