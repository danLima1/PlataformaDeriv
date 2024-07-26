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
app.use(express.json());

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const wss = new Server({ server });

const initialAppState = {
    stake: null,
    initialStake: null,
    MartingaleFactor: 2,
    targetProfit: null,
    stopLoss: null,
    totalProfit: 0,
    lowestBalance: null,
    lowestLoss: null,
    lastTick: null,
    sma: null,
    currentContractId: null,
    smaHistory: [],
    balance: null,
    previousBalance: null,
    initialBalance: null,
    running: false,
    botName: null,
    symbol: 'R_100',
    buying: false,
    buyQueue: [], // Fila de compras
};

let appState = { ...initialAppState };

const botSymbols = {
    'bot1': 'R_100',
    'bot2': 'R_50',
    'bot3': 'R_75',
};

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        console.log(`Received message => ${message}`);
        const messageStr = message.toString();

        if (messageStr === 'stop') {
            appState.running = false;
            ws.send(JSON.stringify({ type: 'status', message: 'Bot stopped' }));
            return;
        }

        if (!appState.stake || !appState.targetProfit || !appState.stopLoss) {
            ws.send(JSON.stringify({ type: 'error', message: 'Configure the stake, target profit, and stop loss values before starting the bot.' }));
            return;
        }

        console.log(`Stake: ${appState.stake}, Target Profit: ${appState.targetProfit}, Stop Loss: ${appState.stopLoss}`);

        appState = {
            ...initialAppState,
            running: true,
            stake: appState.stake,
            initialStake: appState.initialStake,
            MartingaleFactor: appState.MartingaleFactor,
            targetProfit: appState.targetProfit,
            stopLoss: appState.stopLoss,
            balance: appState.balance,
            initialBalance: appState.balance,
            botName: messageStr,
            symbol: botSymbols[messageStr] || 'R_100',
            buyQueue: [],
        };

        runBotLogic(ws);
    });

    ws.on('close', () => {
        console.log('Client has disconnected');
    });
});

const runBotLogic = async (ws) => {
    const xmlFilePath = path.join(__dirname, 'bot', `${appState.botName}.xml`);

    try {
        const xml = fs.readFileSync(xmlFilePath, 'utf-8');
        const xmlData = await xml2js.parseStringPromise(xml);

        initializeVariables(xmlData.xml.variables[0].variable, appState.botName);

        startTickStream(ws, appState.symbol);

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
        const response = JSON.parse(data);

        if (response.error) {
            handleError(ws, response.error.message);
            return;
        }

        if (response.msg_type === 'authorize') {
            console.log('Authorization successful');
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
            appState.previousBalance = appState.balance;
            appState.balance = response.balance.balance;
            console.log(`Saldo anterior: ${appState.previousBalance}`);
            console.log(`Saldo atual: ${appState.balance}`);
            
            if (appState.initialBalance === null) {
                appState.initialBalance = appState.balance;
            }

            const balanceChange = appState.balance - appState.initialBalance;
            const balanceMessage = balanceChange >= 0 
                ? `Lucro: $${balanceChange.toFixed(2)}`
                : `Prejuízo: $${(-balanceChange).toFixed(2)}`;
            
            const profitType = balanceChange >= 0 ? 'profit' : 'loss';

            ws.send(JSON.stringify({
                type: 'balance',
                balance: appState.balance.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,'),
                balanceChange: balanceChange.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,'),
                profitType
            }));
        }
        if (response.msg_type === 'history') {
            updateAppState(response);
            ws.send(JSON.stringify({
                type: 'history',
                prices: appState.smaHistory
            }));
            startTickSubscription(derivWs, ws, symbol);
        }

        if (response.msg_type === 'tick') {
            updateAppState(response);
            ws.send(JSON.stringify({
                type: 'tick',
                tick: appState.lastTick
            }));

            if (appState.balance <= appState.stopLoss) {
                if (appState.running) {
                    appState.running = false;
                    ws.send(JSON.stringify({ type: 'status', message: 'Stop loss reached. Bot stopped.' }));
                }
                return;
            }

            if (appState.totalProfit >= appState.targetProfit) {
                if (appState.running) {
                    appState.running = false;
                    ws.send(JSON.stringify({ type: 'status', message: 'Target profit reached. Bot stopped.' }));
                }
                return;
            }

            if (appState.running && !appState.buying) {
                const decision = await askBotForDecision(appState.lastTick, appState.sma);
                if (decision) {
                    appState.buyQueue.push({ stake: appState.stake, symbol });
                    processBuyQueue(derivWs, ws);
                }
            }
        }

        if (response.msg_type === 'proposal') {
            const decision = await askBotForDecision(appState.lastTick, appState.sma);
            if (appState.running && decision && appState.buying) {
                buyContract(derivWs, response.proposal.id, appState.stake, ws);
            }
        }

        if (response.msg_type === 'buy') {
            appState.previousBalance = appState.balance;
            appState.currentContractId = response.buy.contract_id;
            ws.send(JSON.stringify({
                type: 'buy',
                contract_id: appState.currentContractId
            }));
        }

        if (response.msg_type === 'sell') {
            const soldFor = parseFloat(response.sell.sold_for);
            const profit = soldFor - appState.stake;
            appState.totalProfit += profit;

            const balanceChange = appState.balance - appState.previousBalance;
            const balanceMessage = balanceChange >= 0 
                ? `Lucro: $${balanceChange.toFixed(2)}`
                : `Prejuízo: $${(-balanceChange).toFixed(2)}`;

            console.log(`Enviando mensagem ao frontend: ${balanceMessage}`);
            console.log(`Saldo anterior: ${appState.previousBalance}`);
            console.log(`Saldo atual: ${appState.balance}`);
            console.log(`Diferença de saldo: ${balanceChange.toFixed(2)}`);
            console.log(`Tipo de lucro/prejuízo: ${balanceChange >= 0 ? 'profit' : 'loss'}`);

            ws.send(JSON.stringify({
                type: 'contract_finalizado',
                message: balanceMessage,
                profit: balanceChange.toFixed(2),
                profitType: balanceChange >= 0 ? 'profit' : 'loss',
                balance: appState.balance.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,'),
                balanceChange: balanceMessage
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

const processBuyQueue = (derivWs, ws) => {
    if (appState.buying || appState.buyQueue.length === 0) {
        return;
    }

    appState.buying = true;
    const { stake, symbol } = appState.buyQueue.shift();
    requestProposal(derivWs, stake, symbol);

    // Adiciona um intervalo de tempo garantido entre as compras
    setTimeout(() => {
        appState.buying = false;
        processBuyQueue(derivWs, ws);
    }, 1000); // 1 segundo de intervalo entre as compras
};

const requestProposal = (derivWs, stake, symbol) => {
    const amount = parseFloat(stake);
    if (isNaN(amount) || amount <= 0) {
        console.error(`Invalid stake amount: ${stake}`);
        return;
    }

    console.log(`Requesting proposal for amount: ${amount}, symbol: ${symbol}`);

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

const askBotForDecision = async (lastTick, sma) => {
    const decision = await new Promise(resolve => {
        setTimeout(() => {
            resolve(lastTick > sma);
        }, 100); 
    });
    console.log(`Bot ${appState.botName}: ${decision} (Last tick: ${lastTick}, SMA: ${sma})`);
    return decision;
};

const buyContract = (derivWs, proposalId, stake, ws) => {
    const amount = parseFloat(stake);
    if (isNaN(amount) || amount <= 0) {
        console.error(`Invalid stake amount: ${stake}`);
        handleError(ws, `Invalid stake amount: ${stake}`);
        return;
    }

    console.log(`Buying contract with proposal ID: ${proposalId}, amount: ${amount}`);

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

const initializeVariables = (variables, botName) => {
    try {
        console.log("Initializing variables from XML...");

        const idMappings = {
            'bot1': {
                stake: 'b.8A=Z%v|?!R]8swby2J',
                initialStake: '[JQ:6ujo0P~5.c48sN/n',
                MartingaleFactor: 'Qs!p}1o9ynq+8,VB=Oq.',
                targetProfit: 'z(47tS:MB6xXj~Sa3R7j'
            },
            'bot2': {
                stake: 'W#MDqi;8#K?,S(@3jcX}',
                initialStake: '.#?I=EeXYD}6l!Cf.gZ6',
                MartingaleFactor: 'S%:!W?llAvWoj1W/LVa',
                targetProfit: 'AwHaJ$uP6%gBp!D-t!['
            },
        };

        const mapping = idMappings[botName];
        if (!mapping) {
            console.error(`No variable mapping found for bot: ${botName}`);
            return;
        }

        variables.forEach((variable) => {
            const id = variable.$.id;
            const value = parseFloat(variable.$.value);
            if (id === mapping.stake) {
                appState.stake = value;
            } else if (id === mapping.initialStake) {
                appState.initialStake = value;
            } else if (id === mapping.MartingaleFactor) {
                appState.MartingaleFactor = value;
            } else if (id === mapping.targetProfit) {
                appState.targetProfit = value;
            }
        });

        console.log('Initialized variables:', appState);

    } catch (error) {
        console.error('Failed to initialize variables:', error.message);
    }
};

const updateAppState = (response) => {
    if (response.msg_type === 'history') {
        const history = response.history;
        const prices = history.prices.map(parseFloat);
        appState.smaHistory = calculateSMA(prices, 10);
    } else if (response.msg_type === 'tick') {
        const tick = response.tick;
        appState.lastTick = parseFloat(tick.quote);
        if (appState.smaHistory.length >= 10) {
            appState.sma = calculateSMA([appState.lastTick, ...appState.smaHistory], 10).slice(-1)[0];
        }
    }
};

const calculateSMA = (data, period) => {
    if (data.length < period) return [];

    let sum = 0;
    const sma = [];

    for (let i = 0; i < data.length; i++) {
        sum += data[i];
        if (i >= period - 1) {
            if (i >= period) {
                sum -= data[i - period];
            }
            sma.push(sum / period);
        }
    }

    return sma;
};

const handleError = (ws, message) => {
    console.error(message);
    ws.send(JSON.stringify({ type: 'error', message }));
};

app.post('/api/config/stake', (req, res) => {
    const { stake } = req.body;
    appState.stake = parseFloat(stake);
    console.log(`Stake set to: ${appState.stake}`);
    res.json({ message: 'Stake updated', stake: appState.stake });
});

app.post('/api/config/stopLoss', (req, res) => {
    const { stopLoss } = req.body;
    appState.stopLoss = parseFloat(stopLoss);
    console.log(`Stop Loss set to: ${appState.stopLoss}`);
    res.json({ message: 'Stop loss updated', stopLoss: appState.stopLoss });
});

app.post('/api/config/targetProfit', (req, res) => {
    const { targetProfit } = req.body;
    appState.targetProfit = parseFloat(targetProfit);
    console.log(`Target Profit set to: ${appState.targetProfit}`);
    res.json({ message: 'Target profit updated', targetProfit: appState.targetProfit });
});
