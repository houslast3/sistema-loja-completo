const config = require('./config/config');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const { pool, testConnection, productQueries, orderQueries, tableQueries } = require('./database');
const { createTables } = require('./migrations/init-db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicializa o banco de dados
const initializeDatabase = async () => {
    try {
        // Testa a conexão
        await testConnection();
        
        // Cria as tabelas
        await createTables();
        
        console.log('Banco de dados inicializado com sucesso!');
    } catch (error) {
        console.error('Erro ao inicializar banco de dados:', error);
        process.exit(1);
    }
};

// Inicializa o banco de dados antes de iniciar o servidor
initializeDatabase().then(() => {
    const server = http.createServer(app);
    const wss = new WebSocket.Server({ server });

    // WebSocket clients por tipo
    const clients = {
        waiter: new Set(),
        kitchen: new Set(),
        owner: new Set(),
        public: new Set()
    };

    // Gerenciamento de conexões WebSocket
    wss.on('connection', (ws, req) => {
        const clientType = req.url.split('?type=')[1];
        
        if (clientType && clients[clientType]) {
            clients[clientType].add(ws);
            
            ws.on('close', () => {
                clients[clientType].delete(ws);
            });

            ws.on('message', async (message) => {
                const data = JSON.parse(message);
                
                switch (data.type) {
                    case 'new_order':
                        // Notifica cozinha e proprietário
                        broadcastToTypes(['kitchen', 'owner'], {
                            type: 'new_order',
                            order: data.order
                        });
                        break;

                    case 'order_ready':
                        // Notifica garçom e tela pública
                        broadcastToTypes(['waiter', 'public', 'owner'], {
                            type: 'order_ready',
                            orderId: data.orderId
                        });
                        break;

                    case 'order_delivered':
                        // Notifica cozinha e proprietário
                        broadcastToTypes(['kitchen', 'owner'], {
                            type: 'order_delivered',
                            orderId: data.orderId
                        });
                        break;
                }
            });
        }
    });

    // Função para broadcast para tipos específicos de clientes
    function broadcastToTypes(types, message) {
        types.forEach(type => {
            clients[type].forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(message));
                }
            });
        });
    }

    // Rotas da API

    // Produtos
    app.post('/api/products', async (req, res) => {
        try {
            // Validação básica
            if (!req.body.name || !req.body.price) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Nome e preço são obrigatórios' 
                });
            }

            // Validação do preço
            const price = parseFloat(req.body.price);
            if (isNaN(price) || price < 0) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Preço inválido' 
                });
            }

            // Validação dos itens
            if (req.body.items) {
                if (!Array.isArray(req.body.items)) {
                    return res.status(400).json({ 
                        success: false,
                        error: 'Itens devem ser um array' 
                    });
                }
                
                for (const item of req.body.items) {
                    if (!item.name) {
                        return res.status(400).json({ 
                            success: false,
                            error: 'Todos os itens devem ter um nome' 
                        });
                    }
                    if (item.additional_price) {
                        const additionalPrice = parseFloat(item.additional_price);
                        if (isNaN(additionalPrice) || additionalPrice < 0) {
                            return res.status(400).json({ 
                                success: false,
                                error: `Preço adicional inválido para o item ${item.name}` 
                            });
                        }
                    }
                }
            }

            // Normaliza os dados antes de salvar
            const productData = {
                name: req.body.name.trim(),
                price: price,
                items: req.body.items?.map(item => ({
                    name: item.name.trim(),
                    additional_price: parseFloat(item.additional_price || 0),
                    is_default: !!item.is_default
                }))
            };

            const result = await productQueries.addProduct(productData);
            res.status(201).json({ 
                success: true,
                message: 'Produto cadastrado com sucesso',
                data: result
            });
        } catch (error) {
            console.error('Erro ao cadastrar produto:', error);
            res.status(500).json({ 
                success: false,
                error: 'Erro ao cadastrar o produto. Tente novamente.' 
            });
        }
    });

    app.get('/api/products', async (req, res) => {
        try {
            const products = await productQueries.getProducts();
            res.json(products);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Pedidos
    app.post('/api/orders', async (req, res) => {
        try {
            const orderId = await orderQueries.createOrder(req.body.tableId);
            for (const item of req.body.items) {
                await orderQueries.addOrderItem({
                    orderId,
                    ...item
                });
            }
            
            // Notifica sobre novo pedido
            broadcastToTypes(['kitchen', 'owner'], {
                type: 'new_order',
                orderId
            });
            
            res.status(201).json({ id: orderId });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/orders/active', async (req, res) => {
        try {
            const orders = await pool.query(`
                SELECT o.*, oi.*, p.name as product_name 
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE o.status != 'completed'
                ORDER BY o.created_at DESC
            `);
            
            // Agrupa os itens por pedido
            const groupedOrders = orders.rows.reduce((acc, curr) => {
                if (!acc[curr.order_id]) {
                    acc[curr.order_id] = {
                        id: curr.order_id,
                        table_id: curr.table_id,
                        status: curr.status,
                        created_at: curr.created_at,
                        items: []
                    };
                }
                if (curr.product_id) {
                    acc[curr.order_id].items.push({
                        product_id: curr.product_id,
                        product_name: curr.product_name,
                        quantity: curr.quantity,
                        unit_price: curr.unit_price,
                        notes: curr.notes
                    });
                }
                return acc;
            }, {});

            res.json(Object.values(groupedOrders));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/orders/ready', async (req, res) => {
        try {
            const orders = await pool.query(`
                SELECT o.*, oi.*, p.name as product_name 
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE o.status = 'ready'
                ORDER BY o.created_at
            `);
            
            // Agrupa os itens por pedido
            const groupedOrders = orders.rows.reduce((acc, curr) => {
                if (!acc[curr.order_id]) {
                    acc[curr.order_id] = {
                        id: curr.order_id,
                        table_id: curr.table_id,
                        status: curr.status,
                        created_at: curr.created_at,
                        ready_at: curr.ready_at,
                        items: []
                    };
                }
                if (curr.product_id) {
                    acc[curr.order_id].items.push({
                        product_id: curr.product_id,
                        product_name: curr.product_name,
                        quantity: curr.quantity,
                        unit_price: curr.unit_price,
                        notes: curr.notes
                    });
                }
                return acc;
            }, {});

            res.json(Object.values(groupedOrders));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.put('/api/orders/:id/status', async (req, res) => {
        try {
            await orderQueries.updateOrderStatus(req.params.id, req.body.status);
            
            // Atualiza o timestamp ready_at se o status for 'ready'
            if (req.body.status === 'ready') {
                await pool.query(
                    'UPDATE orders SET ready_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [req.params.id]
                );
            }
            
            // Notifica os clientes apropriados
            const notifyTypes = {
                'ready': ['waiter', 'public', 'owner'],
                'delivered': ['kitchen', 'owner'],
                'completed': ['owner']
            };
            
            if (notifyTypes[req.body.status]) {
                broadcastToTypes(notifyTypes[req.body.status], {
                    type: 'status_update',
                    orderId: req.params.id,
                    status: req.body.status
                });
            }
            
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Mesas
    app.get('/api/tables/:id/orders', async (req, res) => {
        try {
            const orders = await pool.query(`
                SELECT o.*, oi.*, p.name as product_name 
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE o.table_id = $1 AND o.status != 'completed'
                ORDER BY o.created_at DESC
            `, [req.params.id]);
            
            // Agrupa os itens por pedido
            const groupedOrders = orders.rows.reduce((acc, curr) => {
                if (!acc[curr.order_id]) {
                    acc[curr.order_id] = {
                        id: curr.order_id,
                        table_id: curr.table_id,
                        status: curr.status,
                        created_at: curr.created_at,
                        items: []
                    };
                }
                if (curr.product_id) {
                    acc[curr.order_id].items.push({
                        product_id: curr.product_id,
                        product_name: curr.product_name,
                        quantity: curr.quantity,
                        unit_price: curr.unit_price,
                        notes: curr.notes
                    });
                }
                return acc;
            }, {});

            res.json(Object.values(groupedOrders));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/tables/:id/close', async (req, res) => {
        try {
            // Atualiza todos os pedidos da mesa para completed
            await pool.query(`
                UPDATE orders 
                SET status = 'completed', 
                    completed_at = CURRENT_TIMESTAMP 
                WHERE table_id = $1 AND status != 'completed'
            `, [req.params.id]);

            // Atualiza o status da mesa para available
            await pool.query(`
                UPDATE tables 
                SET status = 'available' 
                WHERE table_number = $1
            `, [req.params.id]);

            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Rotas das interfaces
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.get('/waiter', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'waiter.html'));
    });

    app.get('/kitchen', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'kitchen.html'));
    });

    app.get('/owner', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'owner.html'));
    });

    app.get('/public', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'public.html'));
    });

    const PORT = config.server.port;
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch(console.error);
