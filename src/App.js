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
    Box
} from '@mui/material';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';

function App() {
    const [ws, setWs] = useState(null);
    const [message, setMessage] = useState('');
    const [responses, setResponses] = useState([]);
    const [balance, setBalance] = useState('');
    const [ticks, setTicks] = useState([]);
    const [profit, setProfit] = useState('');

    useEffect(() => {
        const websocket = new WebSocket('ws://localhost:3001');
        setWs(websocket);

        websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'balance') {
                setBalance(data.balance);
            } else if (data.type === 'tick') {
                setTicks(prev => [...prev, { date: new Date(), value: parseFloat(data.tick) }]);
            } else if (data.type === 'transaction') {
                setProfit(data.profit);
                setBalance(data.balance);
            } else {
                setResponses(prev => [...prev, event.data]);
            }
        };

        return () => websocket.close();
    }, []);

    const sendMessage = () => {
        if (ws) {
            ws.send(message);
            setMessage('');
        }
    };

    const tickData = {
        labels: ticks.map((_, index) => index),
        datasets: [{
            label: 'Tick Data',
            data: ticks.map(d => d.value),
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1,
            fill: false,
            tension: 0.1,
            pointBackgroundColor: ticks.map((d, index) => {
                if (index === 0) return 'rgba(0, 0, 0, 0)'; // No color for the first point
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
                <TextField
                    fullWidth
                    variant="outlined"
                    label="Enter Command"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    margin="normal"
                />
                <Button
                    variant="contained"
                    color="primary"
                    onClick={sendMessage}
                    fullWidth
                >
                    Send
                </Button>
                <Box my={4}>
                    <Typography variant="h5" component="h2" gutterBottom>
                        Responses:
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
                <Box my={4}>
                    <Typography variant="h5" component="h2" gutterBottom>
                        Saldo: {balance}
                    </Typography>
                    <Typography variant="h5" component="h2" gutterBottom>
                        Lucro/Prejuízo: {profit}
                    </Typography>
                </Box>
                <Box my={4}>
                    <Typography variant="h5" component="h2" gutterBottom>
                        Tick Chart:
                    </Typography>
                    <Line data={tickData} />
                </Box>
            </Box>
        </Container>
    );
}

export default App;
