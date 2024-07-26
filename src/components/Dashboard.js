import React, { useEffect, useState } from 'react';
import {
  Typography,
  Button,
  Paper,
  List,
  ListItem,
  ListItemText,
  Box,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  DialogActions,
  TextField,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import RobotIcon from '@mui/icons-material/SmartToy';
import SettingsIcon from '@mui/icons-material/Settings';
import 'chart.js/auto';
import { Line } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import '../App.css';

function Dashboard() {
  const [ws, setWs] = useState(null);
  const [responses, setResponses] = useState([]);
  const [balance, setBalance] = useState('10397.02');
  const [profit, setProfit] = useState({
    value: '0.00',
    type: 'profit',
  });
  const [bots, setBots] = useState([]);
  const [selectedBot, setSelectedBot] = useState(null);
  const [open, setOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [botRunning, setBotRunning] = useState(false);
  const [stake, setStake] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [targetProfit, setTargetProfit] = useState('');

  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [{
      label: 'Tick Values',
      data: [],
      borderColor: '#fff',
      borderWidth: 1,
      pointBackgroundColor: [],
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      fill: true,
      backgroundColor: 'rgba(0, 123, 255, 0.1)',
      tension: 0.1,
    }],
  });

  const maxTicks = 25;

  useEffect(() => {
    const websocket = new WebSocket('ws://localhost:3001');
    setWs(websocket);

    websocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log("Received message from backend:", data);

            if (data.type === 'balance') {
                setBalance(data.balance);
                setProfit({
                    value: data.balanceChange,
                    type: data.profitType,
                });
            } else if (data.type === 'contract_finalizado') {
                setProfit({
                    value: data.profit,
                    type: data.profitType, // Define o tipo de profit (profit ou loss)
                });
                setBalance(data.balance);
            } else if (data.type === 'tick') {
                const tickValue = data.tick;
                setChartData(prevChartData => {
                    const newLabels = [...prevChartData.labels, new Date().toLocaleTimeString()];
                    const newData = [...prevChartData.datasets[0].data, tickValue];
                    const newColors = [...prevChartData.datasets[0].pointBackgroundColor];

                    if (newData.length > 1) {
                        const lastValue = newData[newData.length - 2];
                        newColors.push(tickValue > lastValue ? 'green' : 'red');
                    } else {
                        newColors.push('green');
                    }

                    if (newData.length > maxTicks) {
                        newLabels.shift();
                        newData.shift();
                        newColors.shift();
                    }

                    return {
                        labels: newLabels,
                        datasets: [{
                            ...prevChartData.datasets[0],
                            data: newData,
                            pointBackgroundColor: newColors,
                        }],
                    };
                });
            } else if (data.type === 'error') {
                setResponses(prev => [...prev, `Error: ${data.message}`]);
            } else if (data.type === 'status') {
                setResponses(prev => [...prev, data.message]);
            } else {
                setResponses(prev => [...prev, event.data]);
            }
        } catch (e) {
            console.error('Error parsing WebSocket message:', e);
        }
    };

    fetch('http://localhost:3001/api/bots')
        .then(response => response.json())
        .then(data => setBots(data))
        .catch(error => console.error('Error fetching bots:', error));

    return () => websocket.close();
}, []);



  const sendMessage = () => {
    if (ws && selectedBot) {
      ws.send(selectedBot);
      setBotRunning(true);
    }
  };

  const stopBot = () => {
    if (ws) {
      ws.send('stop');
      setBotRunning(false);
    }
  };

  const handleBotClick = (bot) => {
    setSelectedBot(bot);
    setOpen(false);
  };

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleOpenConfig = () => {
    setConfigOpen(true);
  };

  const handleCloseConfig = () => {
    setConfigOpen(false);
  };

  const updateStake = () => {
    fetch('http://localhost:3001/api/config/stake', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stake }),
    })
    .then(response => response.json())
    .then(data => {
      console.log('Stake updated:', data);
      setResponses(prev => [...prev, `Stake updated to: ${stake}`]);
    })
    .catch(error => console.error('Error updating stake:', error));
  };

  const updateStopLoss = () => {
    fetch('http://localhost:3001/api/config/stopLoss', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stopLoss }),
    })
    .then(response => response.json())
    .then(data => {
      console.log('Stop Loss updated:', data);
      setResponses(prev => [...prev, `Stop Loss updated to: ${stopLoss}`]);
    })
    .catch(error => console.error('Error updating stop loss:', error));
  };

  const updateTargetProfit = () => {
    fetch('http://localhost:3001/api/config/targetProfit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ targetProfit }),
    })
    .then(response => response.json())
    .then(data => {
      console.log('Target Profit updated:', data);
      setResponses(prev => [...prev, `Target Profit updated to: ${targetProfit}`]);
    })
    .catch(error => console.error('Error updating target profit:', error));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'row', height: '100vh', backgroundColor: '#0003' }}>
      <Box sx={{ flexGrow: 1, width: '75%', padding: 2 }}>
        <Typography variant="h5" component="h2" gutterBottom sx={{ color: '#fff' }}>
          Gráfico de Tick
        </Typography>
        <Box sx={{ height: 'calc(100vh - 64px)', width: '100%', overflow: 'hidden' }}>
          <Line
            data={chartData}
            options={{
              plugins: {
                tooltip: {
                  enabled: true,
                  callbacks: {
                    label: function (tooltipItem) {
                      return tooltipItem.raw.toFixed(4);
                    }
                  }
                },
                datalabels: {
                  display: false,
                },
              },
              scales: {
                x: {
                  display: true,
                  ticks: {
                    color: '#fff',
                  },
                  grid: {
                    color: 'rgba(255, 255, 255, 0.1)',
                  },
                },
                y: {
                  display: true,
                  ticks: {
                    color: '#fff',
                  },
                  grid: {
                    color: 'rgba(255, 255, 255, 0.1)',
                  },
                },
              },
              elements: {
                point: {
                  radius: 3,
                },
                line: {
                  borderWidth: 1,
                },
              },
            }}
            plugins={[ChartDataLabels]}
          />
        </Box>
      </Box>
      <Box sx={{ width: '25%', backgroundColor: '#222', padding: 2, borderRadius: 2, color: '#fff', overflowY: 'auto' }}>
    <Typography variant="h6" sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Conta Virtual</span>
        <span>Lucro/Prejuízo</span>
    </Typography>
    <Typography 
        variant="h6" 
        sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            color: profit.type === 'profit' ? '#0f0' : 'red' 
        }}
    >
        <span>${balance} USD</span>
        <span>${profit.value}</span>
    </Typography>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, color: '#0f0' }}>
        <span>Operações</span>
        <span>0 0 0</span>
    </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', mt: 2 }}>
          <Button variant="contained" color="primary" onClick={handleOpen} sx={{ mb: 2 }}>
            <RobotIcon />
          </Button>

          {selectedBot && (
            <IconButton onClick={handleOpenConfig} sx={{ ml: 2 }}>
              <SettingsIcon style={{ color: '#fff' }} />
            </IconButton>
          )}

          <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
            <DialogTitle>
              Bots Disponíveis
              <IconButton
                aria-label="close"
                onClick={handleClose}
                sx={{
                  position: 'absolute',
                  right: 8,
                  top: 8,
                  color: (theme) => theme.palette.grey[500],
                }}
              >
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent dividers>
              <Grid container spacing={2}>
                {bots.map((bot, index) => (
                  <Grid item xs={12} sm={6} key={index}>
                    <Paper
                      onClick={() => handleBotClick(bot)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: 2,
                        cursor: 'pointer',
                        backgroundColor: '#343a40',
                        '&:hover': {
                          backgroundColor: '#343a40',
                        },
                      }}
                    >
                      <RobotIcon sx={{ marginRight: 2, color: '#ff0' }} />
                      <Typography variant="body1" component="div" sx={{ flexGrow: 1 }}>
                        {bot}
                      </Typography>
                      <ArrowForwardIosIcon />
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleClose} color="primary">
                Fechar
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={configOpen} onClose={handleCloseConfig} fullWidth maxWidth="sm">
            <DialogTitle>
              Configurações do Bot
              <IconButton
                aria-label="close"
                onClick={handleCloseConfig}
                sx={{
                  position: 'absolute',
                  right: 8,
                  top: 8,
                  color: (theme) => theme.palette.grey[500],
                }}
              >
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              <TextField
                label="Stake"
                variant="outlined"
                fullWidth
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                onBlur={updateStake}
                margin="normal"
              />
              <TextField
                label="Stop Loss"
                variant="outlined"
                fullWidth
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                onBlur={updateStopLoss}
                margin="normal"
              />
              <TextField
                label="Target Profit"
                variant="outlined"
                fullWidth
                value={targetProfit}
                onChange={(e) => setTargetProfit(e.target.value)}
                onBlur={updateTargetProfit}
                margin="normal"
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseConfig} color="primary">
                Fechar
              </Button>
            </DialogActions>
          </Dialog>

          <Grid container spacing={0} mt={2}>
            <Grid item xs={12}>
              <Paper sx={{ padding: 2, backgroundColor: '#222', color: '#fff' }}>
                <Typography variant="h6">
                  Respostas:
                </Typography>
                <List>
                  {responses.map((response, index) => (
                    <ListItem key={index} divider>
                      <ListItemText primary={response} />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </Grid>
          </Grid>

          {botRunning ? (
            <Button variant="contained" color="secondary" onClick={stopBot} fullWidth>
              Parar Bot
            </Button>
          ) : (
            <Button variant="contained" color="primary" onClick={sendMessage} fullWidth disabled={!selectedBot}>
              Iniciar Bot
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default Dashboard;
