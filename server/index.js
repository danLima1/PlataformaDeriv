const express = require('express');
const { Server } = require('ws');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const cors = require('cors');
const session = require('express-session');
const axios = require('axios');
require('dotenv').config();
const xml2js = require('xml2js');

const app = express();
const PORT = 3001;

const CLIENT_ID = '63030'; // Substitua pelo seu Application ID
const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`; // Deve corresponder à URL configurada no Deriv

app.use(cors({ credentials: true, origin: 'http://localhost:3000' })); // Alterar origin conforme necessário
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'your_secret_key', // Troque por um segredo seguro
    resave: false,
    saveUninitialized: true,
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
    running: false
};

let appState = { ...initialAppState };

const botSymbols = {
    'bot1': 'R_100',
    'bot2': 'R_50',
    'bot3': 'R_75',
    // Adicione mais mapeamentos de bots para símbolos conforme necessário
};

// Middleware para compartilhar sessão com WebSocket
const sessionParser = session({
    secret: 'your_secret_key', // Troque por um segredo seguro
    resave: false,
    saveUninitialized: true,
});

app.use(sessionParser);

// Endpoint para iniciar o processo de autenticação
app.get('/auth/login', (req, res) => {
    const authUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
    res.redirect(authUrl);
});

// Callback para lidar com o retorno da Deriv após login
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.status(400).send('No authorization code provided.');
    }

    try {
        const tokenResponse = await axios.post('https://oauth.deriv.com/oauth2/token', new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            code: code
        }).toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token } = tokenResponse.data;
        req.session.access_token = access_token;
        res.redirect('/'); // Redirecione para a página principal ou onde você quiser
    } catch (error) {
        console.error('Error retrieving access token:', error.message);
        res.status(500).send('Error retrieving access token');
    }
});

// Middleware para verificar se o usuário está autenticado
const isAuthenticated = (req, res, next) => {
    if (req.session.access_token) {
        next();
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
};

// Endpoint para verificar se o usuário está autenticado
app.get('/auth/status', (req, res) => {
    if (req.session.access_token) {
        res.json({ authenticated: true });
    } else {
        res.json({ authenticated: false });
    }
});

// Logout endpoint
app.get('/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error logging out:', err);
            return res.status(500).send('Error logging out');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

// Proteger as rotas que precisam de autenticação
app.use('/api', isAuthenticated);

// Modificar o WebSocket para usar a sessão
wss.on('connection', (ws, req) => {
    sessionParser(req, {}, () => {
        if (!req.session.access_token) {
            ws.close(4001, 'Not authenticated');
            return;
        }

        console.log('New client connected');
        startTickStream(ws, 'R_100', req.session.access_token); // Símbolo padrão ou pode ser configurável

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
            runBotLogic(messageStr, ws, req.session.access_token);
        });

        ws.on('close', () => {
            console.log('Client has disconnected');
        });
    });
});

const runBotLogic = async (botName, ws, token) => {
    const xmlFilePath = path.join(__dirname, 'bot', `${botName}.xml`);

    try {
        const xml = fs.readFileSync(xmlFilePath, 'utf-8');
        const xmlData = await xml2js.parseStringPromise(xml);

        initializeVariables(xmlData.xml.variables[0].variable, botName);

        // Inicie a transmissão de ticks e lógica do bot
        const symbol = botSymbols[botName] || 'R_100'; // Padrão para 'R_100' se o bot não estiver no mapeamento
        startTickStream(ws, symbol, token);

    } catch (err) {
        handleError(ws, err.message);
    }
};

const startTickStream = (ws, symbol, token) => {
    const derivWs = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=63030');

    derivWs.on('open', () => {
        derivWs.send(JSON.stringify({ authorize: token }));
    });

    derivWs.on('message', async (data) => {
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
            if (appState.running && shouldBuy(appState.lastTick, appState.sma)) {
                requestProposal(derivWs, appState.stake, symbol);
            }
        }

        if (response.msg_type === 'proposal') {
            if (appState.running && shouldBuy(appState.lastTick, appState.sma)) {
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

            let message = `Contrato finalizado com ${profit >= 0 ? 'lucro' : 'prejuízo'} de $${profit.toFixed(2)}`;
            ws.send(JSON.stringify({
                type: 'contract_finalizado',
                message: message,
                profit: profit.toFixed(2),
                balance: appState.balance.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')
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

const initializeVariables = (variables, botName) => {
    try {
        console.log("Initializing variables from XML...");

        // Defina o mapeamento para cada tipo de bot
        const idMappings = {
            'bot1': { // Exemplo de bot 1
                stake: 'b.8A=Z%v|?!R]8swby2J',
                initialStake: '[JQ:6ujo0P~5.c48sN/n',
                MartingaleFactor: 'Qs!p}1o9ynq+8,VB=Oq.',
                targetProfit: 'z(47tS:MB6xXj~Sa3R7j'
            },
            'bot2': { // Exemplo de bot 2
                stake: 'W#MDqi;8#K?,S(@3jcX}',
                initialStake: '.#?I=EeXYD}6l!Cf.gZ6',
                MartingaleFactor: 'S%:!W?llAvWoj1`W/LVa',
                targetProfit: 'AwHaJ$uP6%`gBp!D-t!['
            },
            // Adicione mais mapeamentos conforme necessário
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
