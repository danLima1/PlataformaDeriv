const express = require('express');
const { Server } = require('ws');
const fs = require('fs');
const xml2js = require('xml2js');
const path = require('path');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const PORT = 3001;

const API_TOKEN = process.env.API_TOKEN;

if (!API_TOKEN) {
    throw new Error('API_TOKEN is not defined in the environment variables');
}

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const wss = new Server({ server });

// Estado da aplicação
const appState = {
    stake: null,
    initialStake: null,
    MartingaleFactor: null,
    targetProfit: null,
    totalProfit: 0,
    lowestBalance: null,
    lowestLoss: null,
    lastTick: null,
    sma: null,
    currentContractId: null,
    smaHistory: [],
    balance: null
};

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        console.log(`Received message => ${message}`);
        const messageStr = message.toString();
        runBotLogic(messageStr, ws);
    });

    ws.on('close', () => {
        console.log('Client has disconnected');
    });
});

const runBotLogic = async (message, ws) => {
    const xmlFilePath = path.join(__dirname, 'bot', 'bot.xml');

    try {
        const xml = fs.readFileSync(xmlFilePath, 'utf-8');
        console.log("XML content:", xml);
        const xmlData = await xml2js.parseStringPromise(xml);
        console.log("Parsed XML Data:", xmlData);

        initializeVariables(xmlData.xml.variables[0].variable);

        if (message === 'execute_trade') {
            const derivWs = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');

            derivWs.on('open', () => {
                derivWs.send(JSON.stringify({ authorize: API_TOKEN }));
            });

            derivWs.on('message', async (data) => {
                const response = JSON.parse(data);

                if (response.error) {
                    handleError(ws, response.error.message);
                    return;
                }

                if (response.msg_type === 'authorize') {
                    console.log("Autorizado na API da Deriv");
                    derivWs.send(JSON.stringify({
                        "ticks_history": "1HZ10V",
                        "end": "latest",
                        "count": 100
                    }));

                    // Solicita o saldo após a autorização
                    derivWs.send(JSON.stringify({
                        "balance": 1,
                        "subscribe": 1
                    }));
                }

                if (response.msg_type === 'balance') {
                    appState.balance = response.balance.balance;
                    ws.send(JSON.stringify({
                        type: 'balance',
                        balance: appState.balance.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')
                    }));
                    console.log(`Saldo da conta: ${appState.balance}`);
                }

                if (response.msg_type === 'history') {
                    updateAppState(response);
                    console.log(`Último tick: ${appState.lastTick}, SMA: ${appState.sma}`);
                    startTrading(derivWs, ws);
                }

                if (response.msg_type === 'proposal') {
                    if (shouldBuy(appState.lastTick, appState.sma)) {
                        buyContract(derivWs, response.proposal.id, appState.stake.toFixed(2), ws);
                    } else {
                        console.log("Condição de compra não satisfeita. Aguardando...");
                    }
                }

                if (response.msg_type === 'buy') {
                    appState.currentContractId = response.buy.contract_id;
                    console.log(`Compra realizada com sucesso. ID do contrato: ${appState.currentContractId}`);

                    appState.totalProfit += parseFloat(response.buy.profit);
                    ws.send(JSON.stringify({
                        type: 'transaction',
                        profit: response.buy.profit.toFixed(2)
                    }));
                    if (appState.totalProfit >= appState.targetProfit) {
                        ws.send(JSON.stringify({
                            type: 'target_reached',
                            totalProfit: appState.totalProfit.toFixed(2)
                        }));
                        derivWs.close();
                    }
                }

                if (response.msg_type === 'tick') {
                    updateAppState(response);
                    console.log(`Último tick: ${appState.lastTick}, SMA: ${appState.sma}`);
                    ws.send(JSON.stringify({
                        type: 'tick',
                        tick: appState.lastTick
                    }));

                    if (appState.currentContractId && shouldSell(response)) {
                        sellContract(derivWs, appState.currentContractId, ws);
                    }
                }

                if (response.msg_type === 'sell') {
                    const profit = parseFloat(response.sell.sold_for) - appState.stake;
                    appState.totalProfit += profit;
                    ws.send(JSON.stringify({
                        type: 'transaction',
                        profit: profit.toFixed(2),
                        balance: appState.balance.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')
                    }));
                }
            });

        } else {
            ws.send(`Unknown command: ${message}`);
        }

    } catch (err) {
        ws.send(`Error processing request: ${err.message}`);
    }
};

// ===================== Funções Auxiliares =====================

function initializeVariables(variables) {
    appState.stake = parseFloat(getVariableValue(variables, 'b.8A=Z%v|?!R]8swby2J', true));
    appState.initialStake = parseFloat(getVariableValue(variables, '[JQ:6ujo0P~5.c48sN/n', true));
    appState.MartingaleFactor = parseFloat(getVariableValue(variables, 'Qs!p}1o9ynq+8,VB=Oq.', true));
    appState.targetProfit = parseFloat(getVariableValue(variables, 'z(47tS:MB6xXj~Sa3R7j', true));
    console.log("Variáveis do bot inicializadas:", appState);
}

function getVariableValue(variables, id, isNumeric = false) {
    const variable = variables.find(v => v.$.id === id);
    if (!variable) {
        throw new Error(`Variável com ID ${id} não encontrada no XML`);
    }
    const value = variable._;
    console.log(`ID: ${id}, Value: ${value}`);
    return isNumeric ? parseFloat(value) : value;
}

function handleError(ws, errorMessage) {
    console.error("Erro:", errorMessage);
    ws.send(`Erro: ${errorMessage}`);
}

function startTrading(derivWs, ws) {
    derivWs.send(JSON.stringify({
        "ticks": "1HZ10V",
        "subscribe": 1
    }));
}

function shouldBuy(lastTick, sma) {
    return lastTick > sma;
}

async function buyContract(derivWs, proposalId, stake, ws) {
    derivWs.send(JSON.stringify({
        "buy": proposalId,
        "price": stake
    }));
}

function shouldSell(response) {
    return parseFloat(response.tick.quote) > 1.20000;
}

function sellContract(derivWs, contractId, ws) {
    derivWs.send(JSON.stringify({ sell: contractId }));
}

function calculateSMA(prices, period) {
    if (prices.length < period) return null;
    const sum = prices.slice(-period).reduce((acc, val) => acc + val, 0);
    return sum / period;
}

function updateAppState(data) {
    if (data.msg_type === 'history') {
        appState.smaHistory = data.history.prices.map(parseFloat);
        appState.lastTick = parseFloat(appState.smaHistory.slice(-1)[0]);
        appState.sma = calculateSMA(appState.smaHistory, 8);
    } else if (data.msg_type === 'tick') {
        appState.lastTick = parseFloat(data.tick.quote);
        appState.smaHistory.push(appState.lastTick);
        appState.smaHistory = appState.smaHistory.slice(-8);
        appState.sma = calculateSMA(appState.smaHistory, 8);
    }

    // ***IMPLEMENTE A LÓGICA PARA ATUALIZAR:***
    // -  appState.lowestBalance 
    // -  appState.lowestLoss
}
