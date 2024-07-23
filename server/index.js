const express = require('express');
const { Server } = require('ws');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const cors = require('cors');
require('dotenv').config();
const xml2js = require('xml2js');

const app = express();
const PORT = 3001;

const API_TOKEN = process.env.API_TOKEN;

if (!API_TOKEN) {
    throw new Error('API_TOKEN is not defined in the environment variables');
}

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const wss = new Server({ server });

const initialAppState = {
    stake: 1,
    initialStake: 1,
    MartingaleFactor: 2,
    targetProfit: 10,
    totalProfit: 0,
    lowestBalance: null,
    lowestLoss: null,
    lastTick: null,
    sma: null,
    currentContractId: null,
    smaHistory: [],
    balance: null,
    running: false
};

let appState = { ...initialAppState };

const botSymbols = {
    'bot1': 'R_100',
    'bot2': 'R_50',
    'bot3': 'R_75',
    // Adicione mais mapeamentos de bots para símbolos conforme necessário
};

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        console.log(`Received message => ${message}`);
        const messageStr = message.toString();

        // Parar o bot
        if (messageStr === 'stop') {
            appState.running = false;
            ws.send(JSON.stringify({ type: 'status', message: 'Bot stopped' }));
            return;
        }

        // Reiniciar o estado e iniciar o bot novamente
        appState = { ...initialAppState, running: true };
        runBotLogic(messageStr, ws);
    });

    ws.on('close', () => {
        console.log('Client has disconnected');
    });
});

const runBotLogic = async (botName, ws) => {
    const xmlFilePath = path.join(__dirname, 'bot', `${botName}.xml`);

    try {
        const xml = fs.readFileSync(xmlFilePath, 'utf-8');
        const xmlData = await xml2js.parseStringPromise(xml);

        initializeVariables(xmlData.xml.variables[0].variable);

        // Inicie a transmissão de ticks e lógica do bot
        const symbol = botSymbols[botName] || 'R_100'; // Padrão para 'R_100' se o bot não estiver no mapeamento
        startTickStream(ws, symbol);

    } catch (err) {
        handleError(ws, err.message);
    }
};

const startTickStream = (ws, symbol) => {
    const derivWs = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');

    derivWs.on('open', () => {
        derivWs.send(JSON.stringify({ authorize: API_TOKEN }));
    });

    derivWs.on('message', async (data) => {
        if (!appState.running) {
            derivWs.close();
            return;
        }

        const response = JSON.parse(data);

        if (response.error) {
            handleError(ws, response.error.message);
            return;
        }

        if (response.msg_type === 'authorize') {
            derivWs.send(JSON.stringify({
                "ticks_history": symbol,
                "end": "latest",
                "count": 100
            }));

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
        }

        if (response.msg_type === 'history') {
            updateAppState(response);
            ws.send(JSON.stringify({
                type: 'history',
                prices: appState.smaHistory
            }));
            startTickSubscription(derivWs, ws, symbol); // Inicie a subscrição de ticks
        }

        if (response.msg_type === 'tick') {
            updateAppState(response);
            ws.send(JSON.stringify({
                type: 'tick',
                tick: appState.lastTick
            }));

            // Lógica de compra
            if (shouldBuy(appState.lastTick, appState.sma)) {
                requestProposal(derivWs, appState.stake, symbol);
            }
        }

        if (response.msg_type === 'proposal') {
            if (shouldBuy(appState.lastTick, appState.sma)) {
                buyContract(derivWs, response.proposal.id, appState.stake, ws);
            }
        }

        if (response.msg_type === 'buy') {
            appState.currentContractId = response.buy.contract_id;
            ws.send(JSON.stringify({
                type: 'buy',
                contract_id: appState.currentContractId
            }));
        }

        if (response.msg_type === 'sell') {
            const profit = parseFloat(response.sell.sold_for) - appState.stake;
            appState.totalProfit += profit;
            ws.send(JSON.stringify({
                type: 'transaction',
                profit: profit.toFixed(2),
                balance: appState.balance.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')
            }));
            ws.send(JSON.stringify({
                type: 'contract_finalizado',
                message: 'Contrato finalizado'
            }));
        }
    });

    derivWs.on('error', (error) => {
        handleError(ws, error.message);
    });
};

const startTickSubscription = (derivWs, ws, symbol) => {
    derivWs.send(JSON.stringify({
        "ticks": symbol,
        "subscribe": 1
    }));
};

const requestProposal = (derivWs, stake, symbol) => {
    const amount = parseFloat(stake);
    if (isNaN(amount) || amount <= 0) {
        console.error(`Invalid stake amount: ${stake}`);
        return;
    }

    derivWs.send(JSON.stringify({
        "proposal": 1,
        "amount": amount.toFixed(2),
        "basis": "stake",
        "contract_type": "CALL",
        "currency": "USD",
        "duration": 5,
        "duration_unit": "t",
        "symbol": symbol
    }));
};

const shouldBuy = (lastTick, sma) => {
    return lastTick > sma;
};

const buyContract = (derivWs, proposalId, stake, ws) => {
    const amount = parseFloat(stake);
    if (isNaN(amount) || amount <= 0) {
        console.error(`Invalid stake amount: ${stake}`);
        handleError(ws, `Invalid stake amount: ${stake}`);
        return;
    }

    derivWs.send(JSON.stringify({
        "buy": proposalId,
        "price": amount.toFixed(2)
    }));
};

const sellContract = (derivWs, contractId, ws) => {
    derivWs.send(JSON.stringify({ sell: contractId }));
};

app.get('/api/bots', (req, res) => {
    const botDirectory = path.join(__dirname, 'bot');
    console.log(`Listing bots in directory: ${botDirectory}`);
    fs.readdir(botDirectory, (err, files) => {
        if (err) {
            console.error('Failed to list bots:', err);
            return res.status(500).json({ error: 'Failed to list bots' });
        }
        const botFiles = files.filter(file => file.endsWith('.xml')).map(file => path.basename(file, '.xml'));
        console.log('Bots found:', botFiles);
        res.json(botFiles);
    });
});

function initializeVariables(variables) {
    try {
        console.log("Initializing variables from XML...");

        const idsToVariables = {
            stake: 'b.8A=Z%v|?!R]8swby2J',
            initialStake: '[JQ:6ujo0P~5.c48sN/n',
            MartingaleFactor: 'Qs!p}1o9ynq+8,VB=Oq.',
            targetProfit: 'z(47tS:MB6xXj~Sa3R7j'
        };

        for (const [key, id] of Object.entries(idsToVariables)) {
            const value = getVariableValue(variables, id, appState[key]);
            if (value !== undefined) {
                appState[key] = value;
            }
            console.log(`Initialized ${key}: ${appState[key]}`);
        }

    } catch (error) {
        console.error("Error initializing variables:", error.message);
        throw new Error("Failed to initialize variables from XML");
    }
}

function getVariableValue(variables, id, defaultValue) {
    const variable = variables.find(v => v.$.id === id);
    if (variable && variable._) {
        const value = parseFloat(variable._);
        if (!isNaN(value)) {
            return value;
        } else {
            console.warn(`Variable with ID ${id} has an invalid value: ${variable._}. Using default value: ${defaultValue}`);
            return defaultValue;
        }
    } else {
        console.warn(`Variable with ID ${id} not found. Using default value: ${defaultValue}`);
        return defaultValue;
    }
}

function handleError(ws, errorMessage) {
    console.error("Erro:", errorMessage);
    ws.send(JSON.stringify({ type: 'error', message: `Erro: ${errorMessage}` }));
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
}

function calculateSMA(prices, period) {
    if (prices.length < period) return null;
    const sum = prices.slice(-period).reduce((acc, val) => acc + val, 0);
    return sum / period;
}
