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
import RobotIcon from '@mui/icons-material/SmartToy';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import './App.css';

function App() {
    const [ws, setWs] = useState(null);
    const [responses, setResponses] = useState([]);
    const [balance, setBalance] = useState('');
    const [ticks, setTicks] = useState([]);
    const [profit, setProfit] = useState('');
    const [bots, setBots] = useState([]);
    const [selectedBot, setSelectedBot] = useState('');
    const [open, setOpen] = useState(false);
    const [botRunning, setBotRunning] = useState(false); // Estado para controlar se o bot está rodando
    const MAX_TICKS = 25;

    useEffect(() => {
        const websocket = new WebSocket('ws://localhost:3001');
        setWs(websocket);

        websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'balance') {
                    setBalance(data.balance);
                } else if (data.type === 'tick') {
                    setTicks(prev => {
                        const newTicks = [...prev, { date: new Date(), value: parseFloat(data.tick) }];
                        if (newTicks.length > MAX_TICKS) {
                            newTicks.shift();
                        }
                        return newTicks;
                    });
                } else if (data.type === 'transaction') {
                    setProfit(data.profit);
                    setBalance(data.balance);
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

        console.log('Fetching bots...');
        fetch('http://localhost:3001/api/bots')
            .then(response => {
                console.log('Response status:', response.status);
                return response.json();
            })
            .then(data => {
                console.log('Bots fetched:', data);
                setBots(data);
            })
            .catch(error => console.error('Error fetching bots:', error));

        return () => websocket.close();
    }, []);

    const sendMessage = () => {
        if (ws && selectedBot) {
            ws.send(selectedBot);
            setBotRunning(true); // Define que o bot está rodando
        }
    };

    const stopBot = () => {
        if (ws) {
            ws.send('stop');
            setBotRunning(false); // Define que o bot foi parado
        }
    };

    const handleBotClick = (bot) => {
        setSelectedBot(bot);
        setOpen(false); // Fecha o diálogo ao selecionar um bot
    };

    const tickData = {
        labels: ticks.map((_, index) => index),
        datasets: [{
            label: 'Tick Data',
            data: ticks.map(d => d.value),
            borderColor: 'rgba(0, 255, 0, 1)',
            borderWidth: 2,
            fill: true,
            backgroundColor: 'rgba(128, 128, 128, 0.2)',
            tension: 0.1,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointBackgroundColor: ticks.map((tick, index) => {
                if (index === 0) return 'green';
                return tick.value >= ticks[index - 1].value ? 'green' : 'red';
            }),
        }],
    };

    const chartOptions = {
        scales: {
            x: {
                display: true
            },
            y: {
                display: true,
                position: 'right'
            }
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                enabled: true,
                callbacks: {
                    label: (context) => `Tick: ${context.parsed.y.toFixed(4)}`,
                }
            }
        },
        elements: {
            line: {
                borderColor: 'green'
            }
        }
    };

    const handleOpen = () => {
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6">
                        BOT DERIV
                    </Typography>
                </Toolbar>
            </AppBar>
            <Container component="main" sx={{ flexGrow: 1, py: 4 }}>
                <Grid container spacing={4}>
                    <Grid item xs={12} md={8}>
                        <Box>
                            <Typography variant="h5" component="h2" gutterBottom>
                                Tick Chart:
                            </Typography>
                            <Line data={tickData} options={chartOptions} />
                        </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Box>
                            <Typography variant="h6">
                                Saldo: {balance}
                            </Typography>
                            <Typography variant="h6">
                                Lucro/Prejuízo: {profit}
                            </Typography>
                        </Box>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={handleOpen}
                            fullWidth
                        >
                            Selecionar Bot
                        </Button>
                        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
                            <DialogTitle>
                                Bots Livres
                                <IconButton
                                    aria-label="close"
                                    onClick={handleClose}
                                    sx={{ position: 'absolute', right: 8, top: 8 }}
                                >
                                    <CloseIcon />
                                </IconButton>
                            </DialogTitle>
                            <DialogContent dividers sx={{ backgroundColor: '#333' }}>
                                <Grid container spacing={2}>
                                    {bots.map((bot, index) => (
                                        <Grid item xs={6} key={index}>
                                            <Paper
                                                onClick={() => handleBotClick(bot)}
                                                sx={{ display: 'flex', alignItems: 'center', padding: 2, backgroundColor: '#444', color: 'white', cursor: 'pointer' }}
                                            >
                                                <RobotIcon sx={{ marginRight: 2, color: '#ff0' }} />
                                                <Typography variant="body1" component="div">
                                                    {bot}
                                                </Typography>
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
                                Enviar
                            </Button>
                        )}
                        <Box my={4}>
                            <Typography variant="h5" component="h2" gutterBottom>
                                Resp:
                            </Typography>
                            <Paper>
                                <List>
                                    {responses.map((response, index) => (
                                        <ListItem key={index}>
                                            <ListItemText primary={response} />
                                        </ListItem>
                                    ))}
                                </List>
                            </Paper>
                        </Box>
                    </Grid>
                </Grid>
            </Container>
            <Box component="footer" sx={{ py: 2, mt: 'auto', backgroundColor: '#f5f5f5' }}>
                <Container maxWidth="sm">
                    <Typography variant="body1" color="textSecondary" align="center">
                        © 2024 BOT DERIV. Todos os direitos reservados.
                    </Typography>
                </Container>
            </Box>
        </Box>
    );
}

export default App;
