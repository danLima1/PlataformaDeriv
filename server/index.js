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
  throw new Error('API_TOKEN não está definida nas variáveis de ambiente. Crie um arquivo .env e defina a variável API_TOKEN.');
}

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const server = app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

const wss = new Server({ server });

const initialAppState = {
  stake: 1,
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
  buyQueue: [], 
  NextTradeCondition: 'Even',
}; 

let appState = { ...initialAppState };

const botSymbols = {
  'bot1': 'R_100',
  'bot2': 'R_50', 
  'bot3': 'R_75',
}; 

wss.on('connection', (ws) => {
  console.log('Novo cliente conectado'); 

  ws.on('message', (message) => {
    console.log(`Mensagem recebida do frontend: ${message}`);
    const messageStr = message.toString(); 

    if (messageStr === 'stop') {
      appState.running = false;
      ws.send(JSON.stringify({ type: 'status', message: 'Bot parado' }));
      return; 
    } 

    if (messageStr === 'CALL' || messageStr === 'PUT') { 
      console.log(`Compra solicitada pelo bot: ${messageStr}`);
      appState.buyQueue.push({ stake: appState.stake, symbol: appState.symbol, type: messageStr }); 
    } else { 
      if (!appState.stake || isNaN(appState.stake)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Por favor, defina um valor válido para a stake.' }));
        return; 
      } 

      if (!appState.targetProfit || !appState.stopLoss) { 
        ws.send(JSON.stringify({ type: 'error', message: 'Configure a stake, o lucro alvo e o stop loss antes de iniciar o bot.' })); 
        return;
      } 

      console.log(`Stake: ${appState.stake}, Lucro Alvo: ${appState.targetProfit}, Stop Loss: ${appState.stopLoss}`); 

      appState = { 
        ...initialAppState,
        running: true,
        stake: appState.stake, 
        initialStake: appState.stake, 
        MartingaleFactor: appState.MartingaleFactor,
        targetProfit: parseFloat(appState.targetProfit),
        stopLoss: parseFloat(appState.stopLoss),
        balance: appState.balance, 
        initialBalance: appState.balance,
        botName: messageStr, 
        symbol: botSymbols[messageStr] || 'R_100', 
        buyQueue: [], 
        NextTradeCondition: 'Even', 
      };

      runBotLogic(ws);
    }
  }); 

  ws.on('close', () => {
    console.log('Cliente desconectado');
  }); 
});

const variableMappings = { 
  'stake': 'gsQah}04l(VNTYJ`*;{Y',
  'initialStake': 'gsQah}04l(VNTYJ`*;{Y', 
  'MartingaleFactor': '...',        
  'targetProfit': 'oQ~TQa?Dq78]MM},5;*l', 
  'stopLoss': 'ITiw_xSBxuYP6qNF)F|h',    
};

const runBotLogic = async (ws) => {
  const xmlFilePath = path.join(__dirname, 'bot', `${appState.botName}.xml`);

  try {
    const xml = fs.readFileSync(xmlFilePath, 'utf-8');
    const xmlData = await xml2js.parseStringPromise(xml);

    initializeVariables(xmlData.xml.variables[0].variable, appState.botName); 

    
    appState.stake = parseFloat(appState.stake);
    appState.stopLoss = parseFloat(appState.stopLoss); 
    appState.targetProfit = parseFloat(appState.targetProfit);

    
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

    // Adicione este console.log para depurar as mensagens recebidas
    // console.log('Mensagem da Deriv:', response);

    if (response.error) { 
      handleError(ws, response.error.message);
      return;
    } 

    if (response.msg_type === 'authorize') { 
      console.log('Autorizado com sucesso na Deriv!');

      
      startTickSubscription(derivWs, ws, appState.symbol);

      // Solicita o saldo da conta
      derivWs.send(JSON.stringify({
        "balance": 1, 
        "subscribe": 1
      }));
    } 

    if (response.msg_type === 'balance') {
      appState.previousBalance = appState.balance; 
      appState.balance = parseFloat(response.balance.balance); 

      if (appState.initialBalance === null) {
        appState.initialBalance = appState.balance;
      }

      const balanceChange = appState.balance - appState.initialBalance;

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
          ws.send(JSON.stringify({ type: 'status', message: 'Stop loss atingido. Bot parado.' })); 
        } 
        return; 
      } 

      if (appState.totalProfit >= appState.targetProfit) {
        if (appState.running) {
          appState.running = false; 
          ws.send(JSON.stringify({ type: 'status', message: 'Lucro alvo atingido. Bot parado.' }));
        }
        return; 
      } 

      
      if (appState.running && !appState.buying) { 
        const decision = askBotForDecision(appState.lastTick, appState.sma); 
        if (decision) { 
          processBuyQueue(derivWs, ws); 
        } 
      } 
    } 

    if (response.msg_type === 'proposal') { 
      //console.log("PROPOSAL RECEBIDA: ", response); // DEBUG
      const decision = askBotForDecision(appState.lastTick, appState.sma); 

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

      ws.send(JSON.stringify({
        type: 'contract_finalizado',
        profit: balanceChange.toFixed(2), 
        profitType: balanceChange >= 0 ? 'profit' : 'loss',
        balance: appState.balance.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,'), 
      })); 

      if (balanceChange > 0) {
        // Reinicia a stake após um lucro
        ws.send(JSON.stringify({
          type: 'new_initialAmount', 
          new_initialAmount: appState.initialStake,
          profitType: balanceChange >= 0 ? 'profit' : 'loss'
        }));
      } else {
        
        appState.stake *= 2.5; 
        console.log(`Incrementando stake para a próxima tentativa: ${appState.stake.toFixed(2)}`); 

        ws.send(JSON.stringify({ 
          type: 'new_initialAmount', 
          new_initialAmount: appState.stake.toFixed(2), 
          profitType: balanceChange >= 0 ? 'profit' : 'loss'
        }));
      }

      if (appState.NextTradeCondition === 'Even') {
        appState.NextTradeCondition = 'Odd';
      } else if (appState.NextTradeCondition === 'Odd') { 
        appState.NextTradeCondition = 'Even'; 
      } 
    }
  }); 

  derivWs.on('error', (error) => { 
    handleError(ws, error.message); 
  }); 

  derivWs.on('close', (code, reason) => { 
    console.log('Conexão com a Deriv fechada. Código:', code, 'Motivo:', reason); 
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
  const { stake, symbol, type } = appState.buyQueue.shift(); 

  // Verifica se o bot ainda quer comprar
  if (askBotForDecision(appState.lastTick, appState.sma)) {
    console.log(`Solicitando proposta para ${type}`); // DEBUG
    requestProposal(derivWs, stake, symbol, type); 
  } else { 
    console.log("Compra cancelada pois o bot não autorizou."); 
    appState.buying = false;
  }

  // Aguarda 1 segundo antes de processar o próximo item da fila
  setTimeout(() => {
    appState.buying = false;
    processBuyQueue(derivWs, ws); 
  }, 1000);
}; 

const requestProposal = (derivWs, stake, symbol, type) => { 
  const amount = parseFloat(stake); 

  if (isNaN(amount) || amount <= 0) { 
    console.error(`Valor de stake inválido: ${stake}`);
    return; 
  }

  // (Removido - lastDigitPrediction não é mais necessário) 

  derivWs.send(JSON.stringify({
    "proposal": 1, 
    "amount": amount.toFixed(2),
    "basis": "stake",
    "contract_type": type === 'CALL' ? 'CALL' : 'PUT',
    "currency": "USD",
    "duration": 7, 
    "duration_unit": "t", 
    "symbol": symbol 
  }));
};


const askBotForDecision = (lastTick, sma) => {
  let buy = appState.buyQueue.length > 0;

  console.log(`Bot ${appState.botName}: ${buy} (Último tick: ${lastTick}, Próxima Condição de Negociação: ${appState.NextTradeCondition})`); 

  return buy; 
}; 


const buyContract = (derivWs, proposalId, stake, ws) => {
  const amount = parseFloat(stake);

  if (isNaN(amount) || amount <= 0) { 
    console.error(`Valor de stake inválido: ${stake}`); 
    handleError(ws, `Valor de stake inválido: ${stake}`); 
    return; 
  } 

  console.log(`Comprando contrato com ID de proposta: ${proposalId}, amount: ${amount}`); 

  derivWs.send(JSON.stringify({ 
    "buy": proposalId,
    "price": amount.toFixed(2)
  })); 
};

app.get('/api/bots', (req, res) => {
  const botDirectory = path.join(__dirname, 'bot');
  console.log(`Listando bots no diretório: ${botDirectory}`);

  fs.readdir(botDirectory, (err, files) => {
    if (err) { 
      console.error('Erro ao listar bots:', err); 
      return res.status(500).json({ error: 'Erro ao listar bots.' }); 
    }

    const botFiles = files
      .filter(file => file.endsWith('.xml')) 
      .map(file => path.basename(file, '.xml'));

    console.log('Bots encontrados:', botFiles); 
    res.json(botFiles);
  });
}); 


const initializeVariables = (variables, botName) => { 
  try { 
    console.log('Inicializando variáveis do XML...');
    variables.forEach(variable => {
      const id = variable.$.id; 
      const value = parseFloat(variable.$.value);

      for (const varName in variableMappings) {
        if (variableMappings[varName] === id) { 
          appState[varName] = value;
          console.log(`Variável "${varName}" definida para ${value}`);
          break;
        } 
      } 
    }); 

    console.log('Variáveis inicializadas:', appState); 

  } catch (error) {
    console.error('Falha ao inicializar variáveis:', error.message); 
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

// Rotas da API para configurar o bot
app.post('/api/config/stake', (req, res) => {
  const parsedStake = parseFloat(req.body.stake);

  if (!isNaN(parsedStake) && parsedStake > 0) { 
    appState.stake = parsedStake; 
    appState.initialStake = parsedStake;
    console.log(`Stake atualizada para: ${appState.stake}`); 
    res.json({ message: 'Stake atualizada', stake: appState.stake });
  } else { 
    res.status(400).json({ message: 'Valor de stake inválido.' });
  } 
});

app.post('/api/config/stopLoss', (req, res) => {
  const parsedStopLoss = parseFloat(req.body.stopLoss); 

  if (!isNaN(parsedStopLoss) && parsedStopLoss > 0) {
    appState.stopLoss = parsedStopLoss;
    console.log(`Stop Loss atualizado para: ${appState.stopLoss}`); 
    res.json({ message: 'Stop Loss atualizado', stopLoss: appState.stopLoss }); 
  } else { 
    res.status(400).json({ message: 'Valor de Stop Loss inválido.' });
  } 
});

app.post('/api/config/targetProfit', (req, res) => { 
  const parsedTargetProfit = parseFloat(req.body.targetProfit);

  if (!isNaN(parsedTargetProfit) && parsedTargetProfit > 0) {
    appState.targetProfit = parsedTargetProfit;
    console.log(`Lucro Alvo atualizado para: ${appState.targetProfit}`);
    res.json({ message: 'Lucro Alvo atualizado', targetProfit: appState.targetProfit }); 
  } else {
    res.status(400).json({ message: 'Valor de Lucro Alvo inválido.' });
  }
}); 