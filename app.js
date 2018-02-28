'use strict';

require('dotenv').config();

const binance = require('node-binance-api');
const Telegraf = require('telegraf');
const Twitter = require('twitter');
const Sentiment = require('node-sentiment');
const Chalk = require('chalk');
const fs = require('fs');

binance.options({
    APIKEY: process.env.BINANCE_API_KEY,
    APISECRET: process.env.BINANCE_API_SECRET,
    useServerTime: true,
});

const twitterClient = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});

let twitterStream = undefined;

const telegram = new Telegraf(process.env.TELEGRAM_BOT);

const startTime = Date.now();

const coins = [];
let watchlist = 'BTC';

function getPrices() {
    return new Promise((resolve, reject) => binance.prices((error, ticker) => {
        if (error) return reject(error);
        resolve(ticker);
    }));
}

function loop() {
    getPrices().then(data => {
        for (let i = 0; i < coins.length; i++) {

            const price = parseFloat(data[coins[i].ticker]);
            const growth = parseFloat(((price / coins[i].price - 1) * 100).toFixed(2))


            if(growth > 1) {
                sendNotification(coins[i].coin, price, growth, coins[i].sentiment);
            }

            coins[i].price = price;
            coins[i].sentiment = 0;
        }
        setTimeout(loop, 60000);
    }).catch(err => {
        errorLog(err);
        throw err;
    });
}

function sendNotification(coin, price, growth, sentiment) {
    const _price = price.toFixed(8);
    const _growth = growth.toFixed(2);
    const _sentiment = sentiment.toFixed(2);

    notLog(coin, _price, _growth, _sentiment);
    telegram.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, '[' + coin + '] 💰 ' + _price + ' BTC | ' + _growth + '% | ' + _sentiment + ' ❤️');
}

function parseSentiment(text) {

    const textToLower = text.toLowerCase();
    for (let i = 0; i < coins.length; i++) {
        if (textToLower.indexOf(coins[i].coin.toLowerCase()) !== -1) {
            const sentiment = Sentiment(text);
            coins[i].sentiment = (coins[i].sentiment + sentiment.score)/2;
        }
    }

}

function notLog(coin, price, growth, sentiment) {

    const padLen = 10 - coin.length;
    let padding = '';
    for (let i = 0; i < padLen; i++) {
        padding += ' ';
    }

    const time = new Date;
    console.log(Chalk.white('[' + time + '][' + Chalk.bold(coin) + '] ' + padding +' @ ' + Chalk.bgBlue(price + ' BTC') + ' | ' + Chalk.bgGreen(growth + '%') + ' | ' + Chalk.bgRed(sentiment + ' <3')));
    fs.appendFile(process.env.LOG_PATH, '[' + time + '][' + coin + '] ' + padding +' @ ' + price + ' | ' + growth + '% | ' + sentiment + ' <3' + '\n', err => {
        if (err) {
            errorLog(err);
            throw err;
        }
    });
}

function errorLog(err) {
    const errorLog = '[' + new Date + ']Error: ' + err;
    console.log(Chalk.red(errorLog));
    fs.appendFile(process.env.LOG_PATH, errorLog + '\n', err => {
        if (err) {
            errorLog(err);
            throw err;
        }
    });
}

(function init() {
    getPrices().then(data => {
        for (let x in data) {
            if (data.hasOwnProperty(x) && x.endsWith('BTC')) {
                const coinName = x.replace('BTC', '');

                coins.push({
                    ticker: x,
                    coin: coinName,
                    price: parseFloat(data[x]),
                    sentiment: 0,
                });

                watchlist += ',' + coinName;
            }
        }

        twitterStream = twitterClient.stream('statuses/filter', {track: watchlist})
        twitterStream.on('error', err => {
            if (err) {
                errorLog(err);
                throw err;
            }
        });
        twitterStream.on('data', ev => {
            if (ev.extended_tweet) {
                parseSentiment(ev.extended_tweet.full_text);
            }
        });

        telegram.hears(/active/i, (ctx) => ctx.reply('I\'ve been active for ' + ((Date.now() - startTime) / 60000).toFixed(0) + ' minutes.'));
        telegram.startPolling()

        const startingLog = '[' + new Date + ']Bot started...';
        console.log(Chalk.green(startingLog));
        fs.appendFile(process.env.LOG_PATH, startingLog + '\n', err => {
            if(err) {
                errorLog(err);
                throw err;
            }
        });

        setTimeout(loop, 1000);
    });
})()
