class Bot {
    constructor(ws, config, wss) {
      this.ws = ws;
      this.config = config; 
      this.wss = wss;
  
      // Extraindo valores do XML (ajuste os IDs se necessário)
      this.currentStake = parseFloat(this.config.variables.variable.find(v => v.$.id === 'lYiM*piK9-V2grXL54fF')._.trim());
      this.winStake = parseFloat(this.config.variables.variable.find(v => v.$.id === '%,+`d`.^ti}mdB4_)q)1')._.trim());
      this.profitTarget = parseFloat(this.config.variables.variable.find(v => v.$.id === '$D%IW{HpgN+sN4f6rvel')._.trim());
      this.stopLoss = parseFloat(this.config.variables.variable.find(v => v.$.id === 'jMrlt](cH]-4m@}UVMF=')._.trim());
      this.maxMartingale = parseInt(this.config.variables.variable.find(v => v.$.id === 'ZXqGmn,Bc|3e3lQ-yL3f')._.trim(), 10);
      this.waitingTime = parseInt(this.config.variables.variable.find(v => v.$.id === 'FeO].i5#H`#UQ1?Nc+jO')._.trim(), 10);
      this.tradeTick = parseInt(this.config.variables.variable.find(v => v.$.id === '.OhcJP}0-8iC)1fil4ZU')._.trim(), 10);
  
      // Variáveis para controle do bot
      this.ticks = [];  // Histórico de ticks
      this.tickCounter = 0; // Contador de ticks (para aguardar momentos de compra)
      this.martingaleLevel = 0; 
      this.isTrading = false;
      this.totalProfit = 0;  
      
      this.waitingTime =  parseInt(this.config.variables.variable.find(v => v.$.id === 'FeO].i5#H`#UQ1?Nc+jO')._.trim());
      
      console.log('Configurações do bot:', this); // Para debug
    }
  
    // Função chamada para cada novo tick
    onTick(tick) {
          // Sua lógica para negociar com base nos ticks
          // O código do seu arquivo XML deve ser adaptado para este formato.
      
      this.ticks.push(parseFloat(tick.quote)); 
      
      // Limite do histórico de ticks (ajuste se necessário)
      if (this.ticks.length > 10) {
        this.ticks.shift();
      }
    
      this.tickCounter++;
  
      if (!this.isTrading && this.shouldTrade()) {
        this.executeTrade(); 
      }
    }
  
    // Função que determina se o bot deve realizar uma operação
      shouldTrade() {
  
          // Exemplo de lógica (simples, para demonstração):
          if (this.ticks.length < 2 || this.tickCounter < 2) {
            return false; 
          }
        
          const lastTick = this.ticks[this.ticks.length - 1];
          const secondLastTick = this.ticks[this.ticks.length - 2];
        
          if (lastTick > secondLastTick) {
            // Coloque sua lógica aqui para decidir se deve comprar (Digit Over)
            return true; 
          } else if (lastTick < secondLastTick) {
            // Coloque sua lógica aqui para decidir se deve vender (Digit Under)
            return true;
          }
        
          // Se não houver uma condição de compra ou venda clara, não negocie
          return false;
        }
      
    // Função para executar a ordem na Deriv
      executeTrade() {
          this.isTrading = true;
  
          const prediction =  2;  // Sua lógica para determinar a previsão (over/under)
  
          const tradeOptions = {
              "buy": 1,
              "subscribe": 1,
              "amount": this.currentStake,
              "symbol": "R_100", // Ativo que você está negociando
              "duration": this.tradeTick,
              "duration_unit": "t",
              "basis": "stake", 
              "currency": "USD",
              "prediction": prediction
          };
  
          this.ws.send(JSON.stringify(tradeOptions));
  
          console.log('Enviando ordem de negociação:', tradeOptions);
  
          // Reinicia o contador de ticks
          this.tickCounter = 0;
      }
  
    start() {
      console.log("Bot iniciado!");
      this.isTrading = true; 
      // this.ticks = []; // Reinicia o histórico de ticks ao iniciar? 
    }
  
    stop() {
      console.log("Bot parado!");
      this.isTrading = false;
    }
  
    onTradeResult(contract) {
      this.isTrading = false; // Define que pode negociar novamente
  
      if (contract.status === 'won') {
          console.log('Negociação vencedora!'); 
          this.currentStake = this.winStake;
          this.martingaleLevel = 0; 
        } else { 
          console.log('Negociação perdida!'); 
          this.martingaleLevel++; 
      
          if (this.martingaleLevel <= this.maxMartingale) {
            this.currentStake *= 2; // Dobra a aposta
          } else {
            this.martingaleLevel = 0; 
            this.currentStake = this.winStake;
          }
        }
  
      this.totalProfit += parseFloat(contract.profit_loss); // parseFloat converte string para número
      
      // Envia os dados da transação (incluindo o saldo) para o frontend
      this.wss.clients.forEach(client => {
        client.send(JSON.stringify({ 
          type: 'transaction',
          profit: this.totalProfit.toFixed(2), // Envia o lucro total (formatado)
          balance: parseFloat(contract.balance_after).toFixed(2)  // Saldo após a negociação (formatado)
        }));
      });
  
      if (this.totalProfit >= this.profitTarget) {
        console.log("Lucro total atingido. Parando o bot.");
        this.stop(); 
      } else if (this.totalProfit <= -this.stopLoss) {
        console.log("Stop Loss atingido. Parando o bot.");
        this.stop();
      }
  
      // Aguarda o tempo definido antes da próxima negociação
      setTimeout(() => {
        this.isTrading = false;
      }, this.waitingTime * 1000);
    }
  }
  
  module.exports = { Bot };