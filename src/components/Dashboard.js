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
  LinearProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import RobotIcon from '@mui/icons-material/SmartToy';
import 'chart.js/auto';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import { Line } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import '../App.css';

function Dashboard() {
  const [ws, setWs] = useState(null);
  const [responses, setResponses] = useState([]);
  const [balance, setBalance] = useState('0.00');
  const [profit, setProfit] = useState({
    value: '0.00',
    type: 'profit',
  });
  const [bots, setBots] = useState([]);
  const [selectedBot, setSelectedBot] = useState(null);
  const [open, setOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [botRunning, setBotRunning] = useState(false);
  const [stake, setStake] = useState('0.35');
  const [stopLoss, setStopLoss] = useState('200');
  const [targetProfit, setTargetProfit] = useState('3');
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
  const [progress, setProgress] = useState(0);

  const maxTicks = 25;

  useEffect(() => {
    const websocket = new WebSocket('ws://localhost:3001/ws');
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
                console.log("Balance update received:", data.balanceChange);
            } else if (data.type === 'contract_finalizado') {
                setProfit({
                    value: data.profit,
                    type: data.profitType,
                });
                setBalance(data.balance);
                setProgress(100); // Complete the progress when a contract is finalized
                setTimeout(() => setProgress(0), 500); // Reset progress after a short delay
                console.log("Contract finalized:", data.profit);
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
                setProgress(prev => (prev < 90 ? prev + 10 : 90)); // Increment progress while analyzing
                console.log("Tick received:", tickValue);
            } else if (data.type === 'error') {
                setResponses(prev => [...prev, `Error: ${data.message}`]);
                console.log("Error received:", data.message);
            } else if (data.type === 'status') {
                setResponses(prev => [...prev, data.message]);
                if (data.message === "Bot stopped") {
                    setBotRunning(false);
                    setProgress(0);
                }
                console.log("Status received:", data.message);
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

    // Send initial config values to API when component mounts
    const sendInitialConfig = () => {
      updateStake();
      updateStopLoss();
      updateTargetProfit();
    };

    sendInitialConfig();

    return () => websocket.close();
  }, []);

  const sendMessage = () => {
    if (ws && selectedBot) {
      ws.send(JSON.stringify({ command: 'start', botName: selectedBot }));
      setBotRunning(true);
      setProgress(10); // Start progress when the bot starts
      console.log("Sent start command for bot:", selectedBot);
    }
  };

  const stopBot = () => {
    if (ws) {
      ws.send(JSON.stringify({ command: 'stop' }));
      console.log("Sent stop command");
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
      body: JSON.stringify({ stake: parseFloat(stake) }),
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
      body: JSON.stringify({ stopLoss: parseFloat(stopLoss) }),
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
      body: JSON.stringify({ targetProfit: parseFloat(targetProfit) }),
    })
    .then(response => response.json())
    .then((data) => {
      console.log('Target Profit updated:', data);
      setResponses(prev => [...prev, `Target Profit updated to: ${targetProfit}`]);
    })
    .catch(error => console.error('Error updating target profit:', error));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'row', height: '100vh', backgroundColor: '#000' }}>
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
      <Box sx={{ width: '25%', padding: 2 }}>
        <style>
          {`
            body {
                font-family: Arial, sans-serif;
                background-color: #000;
                color: #fff;
            }
            .container {
                display: flex;
                flex-direction: column;
                width: 100%;
                background-color: #1a1a1a;
                border-radius: 5px;
                overflow: hidden;
                border: 1px solid #333;
                padding: 20px;
                box-sizing: border-box;
                margin-bottom: 20px;
            }
            .header {
                display: flex;
                justify-content: space-between;
                background-color: #292929;
                padding: 10px;
                border-radius: 5px;
                margin-bottom: 20px;
            }
            .header div {
                display: flex;
                flex-direction: column;
            }
            .header div span:first-child {
                font-size: 12px;
                color: #bbb;
            }
            .header div span:last-child {
                font-size: 18px;
                color: #fff;
            }
            .operations {
                background-color: #003;
                color: #00bfff;
                padding: 10px;
                display: flex;
                justify-content: space-between;
                border-radius: 5px;
                margin-bottom: 20px;
            }
            .footer {
                background-color: #212529;
                padding: 10px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-radius: 5px;
                margin-bottom: 20px;
            }
            .footer .icons {
                display: flex;
                gap: 15px;
            }
            .footer .icons i {
                font-size: 16px;
                cursor: pointer;
            }
            .footer span {
                font-size: 16px;
            }
            .footer button {
                background-color: #000;
                border: none;
                color: #fff;
                padding: 5px 10px;
                border-radius: 3px;
                cursor: pointer;
            }
            .audio-player {
              display: flex;
              align-items: center;
              background-color: #30343F;
              border-radius: 8px;
              padding: 10px;
              width: 100%;
              font-family: Arial, sans-serif;
              margin-top: 20px;
            }

            .play-button {
              width: 20px;
              height: 20px;
              background-color: #1AB167;
              border: none;
              border-radius: 3px;
              cursor: pointer;
              margin-right: 10px;
              position: relative;
            }

            .play-button:before {
              content: "";
              position: absolute;
              left: 7px;
              top: 4px;
              border-left: 6px solid white;
              border-top: 6px solid transparent;
              border-bottom: 6px solid transparent;
            }

            .info {
              flex-grow: 1;
            }

            .title {
              color: #FFFFFF;
              font-size: 14px;
              font-weight: bold;
            }

            .artist {
              color: #6F6F6F;
              font-size: 12px;
            }

            .icon {
              width: 40px;
              height: 40px;
              border-radius: 10px;
              background-color: #FFC726;
              display: flex;
              justify-content: center;
              align-items: center;
              margin-right: 10px;
            }

            .icon img {
              width: 24px;
              height: 24px;
            }
          `}
        </style>
        <div className="container">
          <div className="header">
            <div>
              <span>Conta Virtual</span>
              <span>${balance} USD</span>
            </div>
            <div>
              <span>Lucro/Prejuízo</span>
              <span style={{ color: profit.type === 'profit' ? '#0f0' : '#f00' }}>
                ${profit.value}
              </span>
            </div>
          </div>
          <div className="operations">
            <span>Operações</span>
            <span>0 0 0</span>
          </div>
          <div className="footer">
            <div className="icons">
              <i className="fa-solid fa-robot" onClick={handleOpen}></i>
              {selectedBot && (
                <i className="fa-solid fa-gear" onClick={handleOpenConfig}></i>
              )}
            </div>
          </div>
          {selectedBot && (
            <div className="audio-player">
              <div className="icon">
                <img src="https://icones.pro/wp-content/uploads/2022/10/icone-robot-orange.png" alt="Robot Icon" />
              </div>
              <div className="info">
                <div className="title">{selectedBot}</div>
              </div>
              <Button onClick={botRunning ? stopBot : sendMessage} variant="contained" color="primary">
                <FontAwesomeIcon icon={botRunning ? faStop : faPlay} />
              </Button>
              {botRunning && <LinearProgress variant="determinate" value={progress} sx={{ width: '100%', marginTop: 1 }} />}
            </div>
          )}
        </div>

        <Dialog
          open={open}
          onClose={handleClose}
          fullWidth
          sx={{
            '& .MuiDialog-paper': {
              width: '75%',
              maxWidth: 'none',
              backgroundColor: '#212529',
            },
          }}
        >
          <DialogTitle sx={{ color: '#fff' }}>
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
              <CloseIcon sx={{ color: '#fff' }} />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ color: '#fff' }}>
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
                      backgroundColor: 'rgba(52, 58, 64, 0)',
                      '&:hover': {
                        backgroundColor: 'rgba(73, 80, 87, 0.7)',
                      },
                    }}
                  >
                    <RobotIcon sx={{ marginRight: 2, color: '#ff0' }} />
                    <Typography variant="body1" component="div" sx={{ flexGrow: 1 }}>
                      {bot}
                    </Typography>
                    <ArrowForwardIosIcon sx={{ color: '#fff' }} />
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
      </Box>
    </Box>
  );
}

export default Dashboard;
