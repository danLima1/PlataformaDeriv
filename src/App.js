import React, { useEffect, useState } from 'react';
import {
  Container,
  TextField,
  Button,
  Typography,
  List,
  ListItem,
  ListItemText,
  Paper,
  Box,
  CircularProgress
} from '@mui/material';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import axios from 'axios';

function App() {
  const [ws, setWs] = useState(null);
  const [balance, setBalance] = useState(null); 
  const [ticks, setTicks] = useState([]);
  const [profit, setProfit] = useState(0); 
  const [botStatus, setBotStatus] = useState('offline'); 

  useEffect(() => {
    const connectToWebSocket = () => {
      const websocket = new WebSocket(`ws://localhost:${process.env.REACT_APP_WEBSOCKET_PORT || 3001}`);

      websocket.onopen = () => {
        console.log("Conectado ao WebSocket!");
        setBotStatus('online'); 
      };

      websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'balance') {
          setBalance(parseFloat(data.balance).toFixed(2));
        } else if (data.type === 'tick') {
          setTicks(prev => [...prev, { date: new Date(), value: parseFloat(data.tick) }]);
        } else if (data.type === 'transaction') {
          setProfit(parseFloat(data.profit).toFixed(2));
          setBalance(parseFloat(data.balance).toFixed(2));
        } else if (data.type === 'error') {
          console.error("Erro recebido do servidor:", data.message);
        } 
      };

      websocket.onclose = () => {
        console.log("Conexão WebSocket fechada. Reconectando em 3 segundos...");
        setBotStatus('offline'); 
        setTimeout(connectToWebSocket, 3000);
      };

      setWs(websocket);
    };

    connectToWebSocket();

    return () => { 
      if (ws) {
        ws.close();
      }
    };
  }, []);

  const startBot = async () => {
    try {
      const response = await axios.post('/bot/start');
      console.log(response.data); 
      setBotStatus('iniciando'); 
    } catch (error) {
      console.error("Erro ao iniciar o bot:", error);
    }
  };

  const stopBot = async () => {
    try {
      const response = await axios.post('/bot/stop');
      console.log(response.data);
      setBotStatus('parando');
    } catch (error) {
      console.error("Erro ao parar o bot:", error);
    }
  };

  const tickData = {
    labels: ticks.map((tick) => new Date(tick.date).toLocaleTimeString()),
    datasets: [{
      label: 'Valor do Tick',
      data: ticks.map(d => d.value),
      borderColor: 'rgba(75, 192, 192, 1)',
      borderWidth: 1,
      fill: false,
      tension: 0.1,
      pointBackgroundColor: ticks.map((d, index) => {
        if (index === 0) return 'rgba(0, 0, 0, 0)';
        return d.value > ticks[index - 1].value ? 'green' : 'red'; 
      }),
      pointRadius: 5 
    }],
  };

  return (
    <Container maxWidth="md">
      <Box my={4} p={4} component={Paper} elevation={3}>
        <Typography variant="h4" component="h1" gutterBottom>
          Trading Bot Interface
        </Typography>

        <Box display="flex" alignItems="center" mb={2}>
            <Typography variant="h6" mr={2}>
                Status do Bot:
            </Typography>
            {botStatus === 'online' && <span style={{ color: 'green' }}>Online</span>}
            {botStatus === 'offline' && <span style={{ color: 'red' }}>Offline</span>}
            {botStatus === 'iniciando' && <CircularProgress size={20} />} {/* Ícone de carregamento */}
            {botStatus === 'parando' && <CircularProgress size={20} />} {/* Ícone de carregamento */}
        </Box>

        <TextField
          fullWidth
          variant="outlined"
          label="Enter Command"
          disabled={botStatus !== 'online'} 
          margin="normal"
        />
        <Button variant="contained" color="primary" fullWidth disabled={botStatus !== 'online'}>
          Send 
        </Button>

        <Box my={4}>
          <Typography variant="h5" component="h2" gutterBottom>
            Saldo: {balance !== null ? `$${balance}` : <CircularProgress size={20} />} 
          </Typography>
          <Typography variant="h5" component="h2" gutterBottom>
            Lucro/Prejuízo: $ {profit}
          </Typography>
        </Box>

        <Box my={4}>
          <Typography variant="h5" component="h2" gutterBottom>
            Gráfico de Ticks:
          </Typography>
          <Line data={tickData} />
        </Box>

        <Button
          variant="contained"
          color="primary"
          onClick={startBot}
          fullWidth
          disabled={botStatus !== 'online'}
          sx={{ mt: 2 }}
        >
          Iniciar Bot
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={stopBot}
          fullWidth
          disabled={botStatus !== 'online'} 
          sx={{ mt: 2 }}
        >
          Parar Bot
        </Button>

      </Box>
    </Container>
  );
}

export default App;