import {
  userId,
  base,
  quote,
  market,
  fee,
  ORDER_SIDE_BID,
  ORDER_SIDE_ASK,
  ORDER_TYPE_MARKET,
  ORDER_TYPE_LIMIT,
  accountId
} from "../config"; // dotenv
import { getTestAccount } from "../accounts";
import { defaultClient as client } from "../client";
import { sleep, assertDecimalEqual } from "../util";
import { depositAssets } from "../exchange_helper";
import { KafkaConsumer } from "../kafka_client";

import { Account } from "fluidex.js";
import Decimal from "decimal.js";
import { strict as assert } from "assert";
import whynoderun from "why-is-node-running";
import ID from "./ids";

const askUser = ID.userID.slice(0,6);
const askBrokerId = ID.brokerID.slice(0,6);
const askAccountId = ID.accountID.slice(0,6);
const bidUser =ID.userID.slice(6, 11);
const bidBrokerId =ID.brokerID.slice(6, 11);
const bidAccountId =ID.accountID.slice(6, 11);

async function infoList() {
  console.log(await client.assetList());
  console.log(await client.marketList());
  console.log(await client.marketSummary(market));
}

async function initAccounts() {
  await client.connect();
  for (let i = 1; i < bidUser.length; i++) {
    let acc = Account.fromMnemonic(getTestAccount(bidUser[i]).mnemonic);
    client.addAccount(bidUser[i], acc);
    await client.client.RegisterUser({
      user_id:bidUser[i],
      broker_id: bidBrokerId[i],
      account_id: bidAccountId[i],
      l1_address: acc.ethAddr,
      l2_pubkey: acc.bjjPubKey,
    });
  }
}

async function setupAsset() {
  // check balance is zero
  const balance1 = await client.balanceQuery(askUser[0], askBrokerId[0], askAccountId[0]);
  let usdtBalance = balance1.get("USDT");
  let ethBalance = balance1.get("ETH");
  assertDecimalEqual(usdtBalance.available, "0");
  assertDecimalEqual(usdtBalance.frozen, "0");
  assertDecimalEqual(ethBalance.available, "0");
  assertDecimalEqual(ethBalance.frozen, "0");

  await depositAssets({ USDT: "100.0", ETH: "50.0" }, askUser[0], askBrokerId[0], askAccountId[0]);

  // check deposit success
  const balance2 = await client.balanceQuery(askUser[0], askBrokerId[0], askAccountId[0]);
  usdtBalance = balance2.get("USDT");
  ethBalance = balance2.get("ETH");
  console.log(usdtBalance);
  assertDecimalEqual(usdtBalance.available, "100");
  assertDecimalEqual(usdtBalance.frozen, "0");
  assertDecimalEqual(ethBalance.available, "50");
  assertDecimalEqual(ethBalance.frozen, "0");

  await depositAssets({ USDT: "100.0", ETH: "50.0" }, bidUser[0], bidBrokerId[0], bidAccountId[0]);
}

// Test order put and cancel
async function orderTest() {
  const order = await client.orderPut(
    askUser[0],
    askBrokerId[0],
    askAccountId[0],
    market,
    ORDER_SIDE_BID,
    ORDER_TYPE_LIMIT,
    /*amount*/ "10",
    /*price*/ "1.1",
    fee,
    fee
  );
  console.log(order);
  const balance3 = await client.balanceQueryByAsset(askUser[0], askBrokerId[0], askAccountId[0], "USDT");
  assertDecimalEqual(balance3.available, "89");
  assertDecimalEqual(balance3.frozen, "11");

  const orderPending = await client.orderDetail(market, order.id);
  assert.deepEqual(orderPending, order);

  const summary = await client.marketSummary(market);
  assertDecimalEqual(summary.bid_amount, "10");
  assert.equal(summary.bid_count, 1);

  const depth = await client.orderDepth(market, 100, /*not merge*/ "0");
  assert.deepEqual(depth, {
    asks: [],
    bids: [{ price: "1.10", amount: "10.0000" }],
  });

  await client.orderCancel(askUser[0], askBrokerId[0], askAccountId[0], market, 1);
  const balance4 = await client.balanceQueryByAsset(askUser[0],askBrokerId[0], askAccountId[0], "USDT");
  assertDecimalEqual(balance4.available, "100");
  assertDecimalEqual(balance4.frozen, "0");

  console.log("orderTest passed");
}

// Test order trading
async function tradeTest() {
  const askOrder = await client.orderPut(
    askUser[0],
    askBrokerId[0],
    askAccountId[0],
    market,
    ORDER_SIDE_ASK,
    ORDER_TYPE_LIMIT,
    /*amount*/ "4",
    /*price*/ "1.1",
    fee,
    fee
  );
  const bidOrder = await client.orderPut(
    bidUser[0],
    bidBrokerId[0],
    bidAccountId[0],
    market,
    ORDER_SIDE_BID,
    ORDER_TYPE_LIMIT,
    /*amount*/ "10",
    /*price*/ "1.1",
    fee,
    fee
  );
  console.log("ask order id", askOrder.id);
  console.log("bid order id", bidOrder.id);
  await testStatusAfterTrade(askOrder.id, bidOrder.id);

  const testReload = false;
  if (testReload) {
    await client.debugReload();
    await testStatusAfterTrade(askOrder.id, bidOrder.id);
  }

  console.log("tradeTest passed!");
  return [askOrder.id, bidOrder.id];
}

async function testStatusAfterTrade(askOrderId, bidOrderId) {
  const bidOrderPending = await client.orderDetail(market, bidOrderId);
  assertDecimalEqual(bidOrderPending.remain, "6");

  // Now, the `askOrder` will be matched and traded
  // So it will not be kept by the match engine
  await assert.rejects(async () => {
    const askOrderPending = await client.orderDetail(market, askOrderId);
    console.log(askOrderPending);
  }, /invalid order_id/);

  // should check trade price is 1.1 rather than 1.0 here.
  const summary = await client.marketSummary(market);
  assertDecimalEqual(summary.bid_amount, "6");
  assert.equal(summary.bid_count, 1);

  const depth = await client.orderDepth(market, 100, /*not merge*/ "0");
  //assert.deepEqual(depth, { asks: [], bids: [{ price: "1.1", amount: "6" }] });
  //assert.deepEqual(depth, { asks: [], bids: [{ price: "1.1", amount: "6" }] });
  // 4 * 1.1 sell, filled 4
  const balance1 = await client.balanceQuery(askUser[0], askBrokerId[0], askAccountId[0]);
  let usdtBalance = balance1.get("USDT");
  let ethBalance = balance1.get("ETH");
  assertDecimalEqual(usdtBalance.available, "104.4");
  assertDecimalEqual(usdtBalance.frozen, "0");
  assertDecimalEqual(ethBalance.available, "46");
  assertDecimalEqual(ethBalance.frozen, "0");
  // 10 * 1.1 buy, filled 4
  const balance2 = await client.balanceQuery(bidUser[0], bidBrokerId[0], bidAccountId[0]);
  usdtBalance = balance2.get("USDT");
  ethBalance = balance2.get("ETH");
  assertDecimalEqual(usdtBalance.available, "89");
  assertDecimalEqual(usdtBalance.frozen, "6.6");
  assertDecimalEqual(ethBalance.available, "54");
  assertDecimalEqual(ethBalance.frozen, "0");
}

async function simpleTest() {
  await initAccounts();
  await setupAsset();
  await orderTest();
  return await tradeTest();
}

function checkMessages(messages) {
  // TODO: more careful check
  assert.equal(messages.get("orders").length, 5);
  assert.equal(messages.get("balances").length, 8);
  assert.equal(messages.get("trades").length, 1);
}

async function mainTest(withMQ) {
  await client.debugReset();

  let kafkaConsumer: KafkaConsumer;
  if (withMQ) {
    kafkaConsumer = new KafkaConsumer();
    kafkaConsumer.Init();
  }
  const [askOrderId, bidOrderId] = await simpleTest();
  if (withMQ) {
    await sleep(3 * 1000);
    const messages = kafkaConsumer.GetAllMessages();
    console.log(messages);
    await kafkaConsumer.Stop();
    checkMessages(messages);
  }
}

async function main() {
  try {
    await mainTest(!!process.env.TEST_MQ || false);
  } catch (error) {
    console.error("Caught error:", error);
    process.exit(1);
  }
}
main();
