const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');
let axios = require('axios');
let moment = require("moment")

import config from "~/lib/config/config.js";
import {
  promisify,
  throw_err
} from '~/lib/utils'

const TradePairHash = "0x71cd36736269e1f0a3bf6b5680c87f0a696a894869f480f65fea09c72c58caf6";
const quoteTokenHash = "0x29c56c214d9881ba8aea441bb9b9a7bcdf2895ad41c66e26ed7c5e2bdb3de890"; // 1.3.0
const baseTokenHash = "0x019cf55f5b89f0b663cce868264016ece24485ebef35e1d03b58aa74c854412b"; // 1.3.27
const AccountId = "5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy";
//5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy
//5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY
const accountName = "Dave"; // Dave Alice

let api;
let account;
async function init() {
  const wsProvider = new WsProvider(config.cybexDotServer);

  api = await ApiPromise.create({
        provider: wsProvider,
        types: config.cybexDotCustomTypes
  });

  const keyring = new Keyring({ type: 'sr25519' });
  account = keyring.addFromUri(`//${accountName}`, { name: 'default' });
}

// Read

async function getBalance(tokenHash) {
  const params = { tokenHash: tokenHash};
  const result = await axios.get(`${config.cybexDotExplorerApiServer}account/${AccountId}`, { params });
  if (result.status === 200) {
    return result.data;
  } else {
    throw_err("cybexDot get balance request error");
  }
}

async function getOrderBook(pairHash) {
  const result = await axios.get(`${config.cybexDotExplorerApiServer}orderbook/${pairHash}`);

  if (result.status === 200) {
    return result.data;
  } else {
    throw_err("cybexDot orderbook request error");
  }
}

async function getMarket(pairHash, period, before) {
  let time = before;
  if (!time) {
    time = moment.utc().format("YYYY-MM-DDTHH:mm:ss.SSS") + "Z"
  }
  console.log("market request:-------", pairHash, period, before);

  const params = {before: time, period: period, limit: 20};
  const result = await axios.get(`${config.cybexDotExplorerApiServer}market/${pairHash}`, { params });
  console.log("market result:-------", result);

  if (result.status === 200) {
    return result.data;
  } else {
    throw_err("cybexDot get market request error");
  }
}

async function getTrades(pairHash, accountId) {
  const params = accountId ? {accountId: accountId, hash: pairHash} : {hash: pairHash};
  const result = await axios.get(`${config.cybexDotExplorerApiServer}trades`, { params });

  if (result.status === 200) {
    return result.data;
  } else {
    throw_err("cybexDot get trades request error");
  }
}

async function getTicker(pairHash) {
  const result = await axios.get(`${config.cybexDotExplorerApiServer}ticker/${pairHash}`);

  if (result.status === 200) {
    return result.data;
  } else {
    throw_err("cybexDot get ticker request error");
  }
}

async function getOrders(pairHash, accountId, isOpened) {
  const params = {accountId: accountId, hash: pairHash, isOpened: isOpened ? 1 : 0};
  const order = await getTicker(pairHash);

  const result = await axios.get(`${config.cybexDotExplorerApiServer}orders`, { params });
  if (result.status === 200) {
    return result.data.filter(o => {
      return (o.base === order.base) && (o.quote === order.quote);
    });
  } else {
    throw_err("cybexDot get orders request error");
  }
}

// Write
async function transfer(tokenHash, toAccountId, amount) {
  return new Promise(resolve => { // Transferd(AccountId, AccountId, Hash, Balance)
        api.tx.tokenModule
        .transfer(tokenHash, toAccountId, amount)
        .signAndSend(account, (result) => {
            if (result.status.isFinalized) {
                const record = result.findRecord("tokenModule", "Transferd");
                if (record) { resolve(record.toJSON().event.data); }
            }
        })
    })
}

async function createLimitOrder(pairHash, isBuy, price, amount) {
  console.log(pairHash, isBuy, parseFloat((price * 10 ** 8).toFixed(2)), amount);
  let realAmount;
  let type;
  if (isBuy) {
    type = 0;
    realAmount = parseFloat((price * amount).toFixed(2));
  } else {
    type = 1;
    realAmount = parseInt(amount);
  }

  const ticker = await getTicker(pairHash);
  return api.tx.tradeModule
        .createLimitOrder(ticker.base, ticker.quote, type, parseFloat((price * 10 ** 8).toFixed(2)), realAmount) // price need * 10 ** 8
        .signAndSend(account);
  return new Promise(resolve => { // OrderCreated (accountId, baseTokenHash, quoteTokenHash, orderHash, LimitOrder)
        api.tx.tradeModule
        .createLimitOrder(ticker.base, ticker.quote, type, parseFloat((price * 10 ** 8).toFixed(2)), realAmount) // price need * 10 ** 8
        .signAndSend(account, (result) => {
            if (result.status.isFinalized) {
                const record = result.findRecord("tradeModule", "OrderCreated");
                if (record) { resolve(record.toJSON().event.data); }
            }
        })
    });
}

async function cancelLimitOrder(orderHash) {
  return api.tx.tradeModule
        .cancelLimitOrder(orderHash)
        .signAndSend(account);
  return new Promise(resolve => { // OrderCanceled(accountId, orderHash,
        api.tx.tradeModule
        .cancelLimitOrder(orderHash)
        .signAndSend(account, (result) => {
            if (result.status.isFinalized) {
                const record = result.findRecord("tradeModule", "OrderCanceled");
                if (record) { resolve(record.toJSON().event.data); }
            }
        })
    });
}

async function createToken(symbol, amount) {
  return new Promise(resolve => {
      api.tx.tokenModule.issue(symbol, amount).signAndSend(account, (result) => {
          if (result.status.isFinalized) {
              const record = result.findRecord("tokenModule", "Issued");
              if (record) { resolve(record.toJSON().event.data); }
          }
      });
  });
}

async function createTradePair(baseTokenHash, quoteTokenHash) {
  return new Promise(resolve => { // TradePairCreated(AccountId, Hash, TradePair),
        api.tx.tradeModule
        .createTradePair(baseTokenHash, quoteTokenHash)
        .signAndSend(account, (result) => {
            if (result.status.isFinalized) {
                const record = result.findRecord("tradeModule", "TradePairCreated");
                if (record) { resolve(record.toJSON().event.data); }
            }
        })
    });
}

export default {
  TradePairHash,
  baseTokenHash,
  quoteTokenHash,
  AccountId,
  accountName,

  init,
  getBalance,
  getOrderBook,
  getMarket,
  getTicker,
  getTrades,
  getOrders,

  transfer,
  createLimitOrder,
  cancelLimitOrder,
  createToken,
  createTradePair
}
