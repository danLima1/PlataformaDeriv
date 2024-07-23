import React, { useEffect, useState } from 'react';
import {
    AppBar,
    Toolbar,
    Typography,
    Container,
    Button,
    List,
    ListItem,
    ListItemText,
    Paper,
    Box,
    Grid,
    Dialog,
    DialogTitle,
    DialogContent,
    IconButton,
    DialogActions
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import RobotIcon from '@mui/icons-material/SmartToy';
import NotificationsIcon from '@mui/icons-material/Notifications';
import InfoIcon from '@mui/icons-material/Info';
import BarChartIcon from '@mui/icons-material/BarChart';
import DeleteIcon from '@mui/icons-material/Delete';
import 'chart.js/auto';
import { Line } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import './App.css';

function App() {
    const [ws, setWs] = useState(null);
    const [responses, setResponses] = useState([]);
    const [balance, setBalance] = useState('10397.02');
    const [profit, setProfit] = useState('0.00');
    const [bots, setBots] = useState([]);
    const [selectedBot, setSelectedBot] = useState('');
    const [open, setOpen] = useState(false);
    const [botRunning, setBotRunning] = useState(false);

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

    const maxTicks = 25; // Limite de ticks no gráfico

    useEffect(() => {
        const websocket = new WebSocket('ws://localhost:3001');
        setWs(websocket);

        websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'balance') {
                    setBalance(data.balance);
                } else if (data.type === 'transaction') {
                    setProfit(data.profit);
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
                            newColors.push('green'); // Primeira bolinha é verde por padrão
                        }

                        // Remover ticks antigos se ultrapassar o limite
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

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#000' }}>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6">
                        SUPER BOTZ
                    </Typography>
                </Toolbar>
            </AppBar>
            <Container component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px - 48px)', padding: 0 }}>
            <Grid container spacing={0} sx={{ flexGrow: 1, height: '100%', padding: 0 }}>
  <Grid item xs={12} md={9} sx={{ height: '75%', display: 'flex', flexDirection: 'column' }}>
    <Box sx={{ flexGrow: 1, backgroundColor: '#000', padding: 2 }}>
                            <Typography variant="h5" component="h2" gutterBottom sx={{ color: '#fff' }}>
                                Gráfico de Tick
                            </Typography>
                            <Box sx={{ height: '100%', border: '1px solid #444', flexGrow: 1, overflow: 'hidden' }}>
                                <Line 
                                    data={chartData} 
                                    options={{
                                        plugins: {
                                            tooltip: {
                                                enabled: true,
                                                callbacks: {
                                                    label: function(tooltipItem) {
                                                        return tooltipItem.raw.toFixed(4); // Exibe o valor com 4 casas decimais
                                                    }
                                                }
                                            },
                                            datalabels: {
                                                display: false
                                            }
                                        },
                                        scales: {
                                            x: {
                                                display: true,
                                                ticks: {
                                                    color: '#fff', // Cor dos labels do eixo x
                                                },
                                                grid: {
                                                    color: 'rgba(255, 255, 255, 0.1)', // Cor da grade do eixo x
                                                }
                                            },
                                            y: {
                                                display: true,
                                                ticks: {
                                                    color: '#fff', // Cor dos labels do eixo y
                                                },
                                                grid: {
                                                    color: 'rgba(255, 255, 255, 0.1)', // Cor da grade do eixo y
                                                }
                                            }
                                        },
                                        elements: {
                                            point: {
                                                radius: 3, // Tamanho dos pontos
                                            },
                                            line: {
                                                borderWidth: 1, // Espessura da linha
                                            },
                                        },
                                    }} 
                                    plugins={[ChartDataLabels]}
                                />
                            </Box>
                        </Box>
                    </Grid>
                    <Grid item xs={12} md={3} sx={{ height: '25%', display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ backgroundColor: '#222', padding: 2, borderRadius: 2, height: '100%', color: '#fff' }}>
                            <Typography variant="h6" sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Conta Virtual</span>
                                <span>Lucro/Prejuízo</span>
                            </Typography>
                            <Typography variant="h6" sx={{ display: 'flex', justifyContent: 'space-between', color: '#0f0' }}>
                                <span>${balance} USD</span>
                                <span>${profit}</span>
                            </Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, color: '#0f0' }}>
                                <span>Operações</span>
                                <span>0 0 0</span>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                                <Button
                                    variant="contained"
                                    color="primary"
                                    onClick={handleOpen}
                                    sx={{ flex: 1, mr: 1 }}
                                >
                                    <RobotIcon />
                                </Button>
                                <Button
                                    variant="contained"
                                    color="primary"
                                    sx={{ flex: 1, mr: 1 }}
                                >
                                    <NotificationsIcon />
                                    <span style={{ marginLeft: 4 }}>0</span>
                                </Button>
                                <Button
                                    variant="contained"
                                    color="primary"
                                    sx={{ flex: 1, mr: 1 }}
                                >
                                    <InfoIcon />
                                </Button>
                                <Button
                                    variant="contained"
                                    color="primary"
                                    sx={{ flex: 1, mr: 1 }}
                                >
                                    <BarChartIcon />
                                </Button>
                                <Button
                                    variant="contained"
                                    color="primary"
                                    sx={{ flex: 1 }}
                                >
                                    <DeleteIcon />
                                </Button>
                            </Box>
                            <Dialog
                                open={open}
                                onClose={handleClose}
                                fullWidth
                                maxWidth="md"
                            >
                                <DialogTitle>
                                    Bots Livres
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
                            <Box mt={2}>
                                {botRunning ? (
                                    <Button
                                        variant="contained"
                                        color="secondary"
                                        onClick={stopBot}
                                        fullWidth
                                    >
                                        Parar Bot
                                    </Button>
                                ) : (
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        onClick={sendMessage}
                                        fullWidth
                                        disabled={!selectedBot}
                                    >
                                        Iniciar Bot
                                    </Button>
                                )}
                            </Box>
                        </Box>
                    </Grid>
                </Grid>
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
            </Container>
            <Box component="footer" sx={{ py: 3, px: 2, mt: 'auto', backgroundColor: '#000' }}>
                <Typography variant="body2" color="inherit" align="center">
                    © 2023
                </Typography>
            </Box>
        </Box>
    );
}

export default App;
