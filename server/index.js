const express = require('express');
const { Server } = require('ws');
const fs = require('fs');
const xml2js = require('xml2js');
const path = require('path');
const WebSocket = require('ws');
const { Bot } = require('./bot');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const wsPort = 3001; // Porta para o WebSocket
const wss = new Server({ port: wsPort });

// Dados da API Deriv (substitua pelos seus dados)
const apiToken = process.env.DERIV_API_TOKEN;
const appId = process.env.DERIV_APP_ID;

let wsDeriv = null;
let bot = null;
let ticks = []; 

function connectToDeriv() {
  wsDeriv = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${appId}`);

  wsDeriv.on('open', () => {
    console.log('Conectado à Deriv!');
    wsDeriv.send(JSON.stringify({ authorize: apiToken }));
    // Solicitar saldo inicial após conectar
    getBalance(); 
  });

  wsDeriv.on('message', (message) => {
    const data = JSON.parse(message);
    
    if (data.error) {
        // Lidar com erros da API Deriv (ex: token inválido)
        console.error("Erro da API Deriv:", data.error);
        wss.clients.forEach(client => {
            client.send(JSON.stringify({ type: 'error', message: data.error.message }));
        });
        return; // Para a execução aqui
    }

    if (data.msg_type === 'balance') {
      sendBalanceToFrontend(data.balance);
    } else if (data.msg_type === 'tick') {
      processTick(data.tick);
    } else if (data.msg_type === 'proposal_open_contract') {
        // Lidar com os resultados da negociação
        if (bot) {
            bot.onTradeResult(data.proposal_open_contract);
        }
    }
  });

  wsDeriv.on('close', () => {
    console.log('Conexão com Deriv fechada. Reconectando...');
    setTimeout(connectToDeriv, 5000);
  });
}

function processTick(tick) {
    ticks.push({ date: new Date(), value: parseFloat(tick.quote) });
  
    // Mantém o histórico limitado (opcional)
    if (ticks.length > 100) {
      ticks.shift();
    }
  
    // Enviar ticks para o frontend
    wss.clients.forEach(client => {
        client.send(JSON.stringify({ type: 'tick', tick: tick.quote })); 
    });

    if (bot) {
        bot.onTick(tick); 
    }
}

// Função para obter saldo da conta
function getBalance() {
  wsDeriv.send(JSON.stringify({ balance: 1 }));
}
  

// Função para enviar o saldo para o frontend via WebSocket
function sendBalanceToFrontend(balance) {
  wss.clients.forEach((client) => {
    client.send(JSON.stringify({ type: 'balance', balance: balance.amount }));
  });
}

// Rota para servir index.html (ajuste o caminho se necessário)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html')); 
});

app.post('/bot/:action', (req, res) => {
    const action = req.params.action;
  
    if (action === 'start' && !bot) { // Inicia somente se o bot não estiver rodando
      const xmlConfig = fs.readFileSync('./config.xml', 'utf-8'); 
      xml2js.parseString(xmlConfig, (err, result) => {
        if (err) {
          console.error('Erro ao ler XML:', err);
          res.status(500).send('Erro ao iniciar o bot.');
          return;
        }
        bot = new Bot(wsDeriv, result, wss); 
        bot.start(); 
        res.send('Bot iniciado!');
      });
    } else if (action === 'stop' && bot) { 
      bot.stop(); 
      bot = null;
      res.send('Bot parado!');
    } else {
      res.status(400).send('Ação inválida ou bot já está em execução.'); 
    }
});

// Inicia o servidor e conecta na Deriv
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
  connectToDeriv();
});

wss.on('connection', (wsClient) => {
  console.log('Novo cliente conectado!');

  // Envia o histórico de ticks e saldo inicial para o novo cliente
  wsClient.send(JSON.stringify({ type: 'ticks', ticks })); 
  getBalance(); // Solicita o saldo da conta para enviar ao novo cliente

  wsClient.on('close', () => {
    console.log('Cliente desconectado!');
  });
});