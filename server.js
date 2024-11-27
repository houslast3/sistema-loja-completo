const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { createTables } = require('./migrations/init-db');
const {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    getAllTables,
    getTableById,
    updateTableStatus,
    createOrder,
    getOrderById,
    getOrdersByTableId,
    getAllActiveOrders,
    updateOrderStatus
} = require('./database');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket connection handling
const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('New client connected');

    ws.on('close', () => {
        clients.delete(ws);
        console.log('Client disconnected');
    });
});

function broadcastMessage(type, data) {
    const message = JSON.stringify({ type, data });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Rotas para produtos
app.get('/api/products', async (req, res) => {
    try {
        const products = await getAllProducts();
        res.json(products);
    } catch (error) {
        console.error('Erro ao buscar produtos:', error);
        res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await getProductById(req.params.id);
        if (product) {
            res.json(product);
        } else {
            res.status(404).json({ error: 'Produto não encontrado' });
        }
    } catch (error) {
        console.error('Erro ao buscar produto:', error);
        res.status(500).json({ error: 'Erro ao buscar produto' });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const product = await createProduct(req.body);
        broadcastMessage('product_created', product);
        res.status(201).json(product);
    } catch (error) {
        console.error('Erro ao criar produto:', error);
        res.status(500).json({ error: 'Erro ao criar produto' });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const product = await updateProduct(req.params.id, req.body);
        if (product) {
            broadcastMessage('product_updated', product);
            res.json(product);
        } else {
            res.status(404).json({ error: 'Produto não encontrado' });
        }
    } catch (error) {
        console.error('Erro ao atualizar produto:', error);
        res.status(500).json({ error: 'Erro ao atualizar produto' });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await deleteProduct(req.params.id);
        broadcastMessage('product_deleted', { id: req.params.id });
        res.status(204).send();
    } catch (error) {
        console.error('Erro ao deletar produto:', error);
        res.status(500).json({ error: 'Erro ao deletar produto' });
    }
});

// Rotas para mesas
app.get('/api/tables', async (req, res) => {
    try {
        const tables = await getAllTables();
        res.json(tables);
    } catch (error) {
        console.error('Erro ao buscar mesas:', error);
        res.status(500).json({ error: 'Erro ao buscar mesas' });
    }
});

app.get('/api/tables/:id', async (req, res) => {
    try {
        const table = await getTableById(req.params.id);
        if (table) {
            res.json(table);
        } else {
            res.status(404).json({ error: 'Mesa não encontrada' });
        }
    } catch (error) {
        console.error('Erro ao buscar mesa:', error);
        res.status(500).json({ error: 'Erro ao buscar mesa' });
    }
});

app.put('/api/tables/:id/status', async (req, res) => {
    try {
        const table = await updateTableStatus(req.params.id, req.body.status);
        if (table) {
            broadcastMessage('table_status_updated', table);
            res.json(table);
        } else {
            res.status(404).json({ error: 'Mesa não encontrada' });
        }
    } catch (error) {
        console.error('Erro ao atualizar status da mesa:', error);
        res.status(500).json({ error: 'Erro ao atualizar status da mesa' });
    }
});

// Rotas para pedidos
app.post('/api/orders', async (req, res) => {
    try {
        const order = await createOrder(req.body);
        broadcastMessage('order_created', order);
        res.status(201).json(order);
    } catch (error) {
        console.error('Erro ao criar pedido:', error);
        res.status(500).json({ error: 'Erro ao criar pedido' });
    }
});

app.get('/api/orders/:id', async (req, res) => {
    try {
        const order = await getOrderById(req.params.id);
        if (order) {
            res.json(order);
        } else {
            res.status(404).json({ error: 'Pedido não encontrado' });
        }
    } catch (error) {
        console.error('Erro ao buscar pedido:', error);
        res.status(500).json({ error: 'Erro ao buscar pedido' });
    }
});

app.get('/api/tables/:table_id/orders', async (req, res) => {
    try {
        const orders = await getOrdersByTableId(req.params.table_id);
        res.json(orders);
    } catch (error) {
        console.error('Erro ao buscar pedidos da mesa:', error);
        res.status(500).json({ error: 'Erro ao buscar pedidos da mesa' });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const orders = await getAllActiveOrders();
        res.json(orders);
    } catch (error) {
        console.error('Erro ao buscar pedidos ativos:', error);
        res.status(500).json({ error: 'Erro ao buscar pedidos ativos' });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const order = await updateOrderStatus(req.params.id, req.body.status);
        if (order) {
            broadcastMessage('order_status_updated', order);
            res.json(order);
        } else {
            res.status(404).json({ error: 'Pedido não encontrado' });
        }
    } catch (error) {
        console.error('Erro ao atualizar status do pedido:', error);
        res.status(500).json({ error: 'Erro ao atualizar status do pedido' });
    }
});

// Inicialização do servidor
const PORT = process.env.PORT || 10000;

async function initializeDatabase() {
    try {
        await createTables();
        console.log('Banco de dados inicializado com sucesso!');
    } catch (error) {
        console.error('Erro ao inicializar banco de dados:', error);
        throw error;
    }
}

async function startServer() {
    try {
        await initializeDatabase();
        server.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}`);
        });
    } catch (error) {
        console.error('Erro ao iniciar servidor:', error);
        process.exit(1);
    }
}

startServer();
