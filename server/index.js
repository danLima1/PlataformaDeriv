const express = require('express');
const { Server } = require('ws');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const cors = require('cors');
const axios = require('axios');
const session = require('express-session');
require('dotenv').config();
const xml2js = require('xml2js');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'EHKWcfhhfs1eaKw',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // secure should be true in production
}));

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
    running: false,
    symbol: 'R_100'
};

let appState = { ...initialAppState };

const botSymbols = {
    'bot1': 'R_100',
    'bot2': 'R_50',
    'bot3': 'R_75',
    // Add more bot-to-symbol mappings as needed
};

// OAuth configuration
const CLIENT_ID = '63028'; // Your app_id
const REDIRECT_URI = `http://localhost:${PORT}`;

app.get('/auth/login', (req, res) => {
    const authUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=read`;
    res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;

    try {
        const response = await axios.post('https://oauth.deriv.com/oauth2', null, {
            params: {
                grant_type: 'authorization_code',
                code,
                client_id: CLIENT_ID,
          
                redirect_uri: REDIRECT_URI
            }
        });

        req.session.token = response.data.access_token;
        res.redirect('/');
    } catch (error) {
        console.error('Error during token exchange:', error);
        res.status(500).send('Authentication failed');
    }
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/api/token', (req, res) => {
    if (req.session.token) {
        res.json({ token: req.session.token });
    } else {
        res.status(401).json({ error: 'User not authenticated' });
    }
});

wss.on('connection', (ws, req) => {
    console.log('New client connected');

    if (!req.session || !req.session.token) {
        ws.send(JSON.stringify({ type: 'error', message: 'User not authenticated' }));
        ws.close();
        return;
    }

    const symbol = 'R_100'; // Default symbol or it can be configured
    startTickStream(ws, symbol, req.session.token);

    ws.on('message', (message) => {
        console.log(`Received message => ${message}`);
        const messageStr = message.toString();

        if (messageStr === 'stop') {
            appState.running = false;
            ws.send(JSON.stringify({ type: 'status', message: 'Bot stopped' }));
            return;
        }

        appState = { ...initialAppState, running: true };
        runBotLogic(messageStr, ws, req.session.token);
    });

    ws.on('close', () => {
        console.log('Client has disconnected');
    });
});

const runBotLogic = async (botName, ws, token) => {
    const xmlFilePath = path.join(__dirname, 'bot', `${botName}.xml`);

    try {
        const xml = fs.readFileSync(xmlFilePath, 'utf-8');
        const xmlData = await xml2js.parseStringPromise(xml);

        initializeVariables(xmlData.xml.variables[0].variable, botName);

        const symbol = botSymbols[botName] || 'R_100'; // Default to 'R_100' if bot is not mapped
        appState.symbol = symbol;
        startTickStream(ws, symbol, token);

    } catch (err) {
        handleError(ws, err.message);
    }
};

const startTickStream = (ws, symbol, token) => {
    const derivWs = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${CLIENT_ID}`);

    derivWs.on('open', () => {
        derivWs.send(JSON.stringify({ authorize: token }));
    });

    derivWs.on('message', async (data) => {
        const response = JSON.parse(data);

        if (response.error) {
            handleError(ws, response.error.message);
            return;
        }

        switch (response.msg_type) {
            case 'authorize':
                derivWs.send(JSON.stringify({
                    "ticks_history": symbol,
                    "end": "latest",
                    "count": 100
                }));

                derivWs.send(JSON.stringify({
                    "balance": 1,
                    "subscribe": 1
                }));
                break;
            case 'balance':
                appState.balance = response.balance.balance;
                ws.send(JSON.stringify({
                    type: 'balance',
                    balance: appState.balance.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')
                }));
                break;
            case 'history':
                updateAppState(response);
                ws.send(JSON.stringify({
                    type: 'history',
                    prices: appState.smaHistory
                }));
                startTickSubscription(derivWs, ws, symbol);
                break;
            case 'tick':
                updateAppState(response);
                ws.send(JSON.stringify({
                    type: 'tick',
                    tick: appState.lastTick
                }));

                if (appState.running && shouldBuy(appState.lastTick, appState.sma)) {
                    requestProposal(derivWs, appState.stake, symbol);
                }
                break;
            case 'proposal':
                handleProposalResponse(derivWs, response, ws);
                break;
            case 'buy':
                appState.currentContractId = response.buy.contract_id;
                ws.send(JSON.stringify({
                    type: 'buy',
                    contract_id: appState.currentContractId
                }));
                break;
            case 'sell':
                const profit = parseFloat(response.sell.sold_for) - appState.stake;
                appState.totalProfit += profit;

                let message = `Contrato finalizado com ${profit >= 0 ? 'lucro' : 'prejuízo'} de $${profit.toFixed(2)}`;
                ws.send(JSON.stringify({
                    type: 'contract_finalizado',
                    message: message,
                    profit: profit.toFixed(2),
                    balance: appState.balance.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')
                }));
                break;
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

const handleProposalResponse = (derivWs, response, ws) => {
    if (response.error) {
        if (response.error.code === 'RateLimitExceeded') {
            console.warn('Rate limit exceeded. Retrying after delay...');
            setTimeout(() => requestProposal(derivWs, appState.stake, appState.symbol), 1000); // Wait 1 second before retrying
        } else {
            handleError(ws, response.error.message);
        }
        return;
    }

    if (appState.running && shouldBuy(appState.lastTick, appState.sma)) {
        buyContract(derivWs, response.proposal.id, appState.stake, ws);
    }
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
            // Add more mappings as needed
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
