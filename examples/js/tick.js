import { ORDER_SIDE_BID, ORDER_SIDE_ASK, market, userId } from "./config.mjs";
import { orderCancelAll } from "./client.mjs";
import { sleep, putLimitOrder, getRandomFloatAround } from "./util.mjs";
import axios from "axios";
async function main() {
  const url =
    "https://api.coinstats.app/public/v1/coins?skip=0&limit=5&currency=USD";
  //  const url = 'https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD';
  let cnt = 0;
  while (true) {
    try {
      await sleep(1000);
      if (cnt % 300 == 0) {
        await orderCancelAll(userId, market);
      }
      const data = await axios.get(url);
      const price = data.data.coins.find(item => item.symbol == "ETH").price;
      console.log("price", price);
      await putLimitOrder(
        ORDER_SIDE_BID,
        getRandomFloatAround(3, 0.5),
        getRandomFloatAround(price)
      );
      await sleep(1000);
      await putLimitOrder(
        ORDER_SIDE_ASK,
        getRandomFloatAround(3, 0.5),
        getRandomFloatAround(price)
      );
      cnt += 1;
    } catch (e) {
      console.log(e);
    }
  }
}

main().catch(console.log);
