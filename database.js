const { Pool } = require('pg');
const config = require('./config/config');

// Criação do pool de conexões
const pool = new Pool(config.database);

// Função para testar a conexão
const testConnection = async () => {
    let client;
    try {
        client = await pool.connect();
        console.log('Conexão com PostgreSQL estabelecida com sucesso!');
        return true;
    } catch (error) {
        console.error('Erro ao conectar ao PostgreSQL:', error);
        return false;
    } finally {
        if (client) client.release();
    }
};

// Função para executar queries com retry
const queryWithRetry = async (text, params, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const result = await pool.query(text, params);
            return result;
        } catch (error) {
            console.error(`Tentativa ${i + 1} falhou:`, error.message);
            
            if (i === retries - 1) {
                throw error;
            }
            
            // Espera um tempo antes de tentar novamente
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
};

// Queries para produtos
const productQueries = {
    getAllProducts: async () => {
        const query = 'SELECT * FROM products ORDER BY category, name';
        return queryWithRetry(query);
    },
    
    getProductById: async (id) => {
        const query = 'SELECT * FROM products WHERE id = $1';
        const result = await queryWithRetry(query, [id]);
        return result.rows[0];
    },
    
    createProduct: async (product) => {
        const query = `
            INSERT INTO products (name, price, category, description, image_url)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const values = [product.name, product.price, product.category, product.description, product.image_url];
        const result = await queryWithRetry(query, values);
        return result.rows[0];
    },
    
    updateProduct: async (id, product) => {
        const query = `
            UPDATE products 
            SET name = $1, price = $2, category = $3, description = $4, image_url = $5
            WHERE id = $6
            RETURNING *
        `;
        const values = [product.name, product.price, product.category, product.description, product.image_url, id];
        const result = await queryWithRetry(query, values);
        return result.rows[0];
    },
    
    deleteProduct: async (id) => {
        const query = 'DELETE FROM products WHERE id = $1 RETURNING *';
        const result = await queryWithRetry(query, [id]);
        return result.rows[0];
    }
};

// Queries para pedidos
const orderQueries = {
    getAllOrders: async () => {
        const query = `
            SELECT o.*, 
                   json_agg(json_build_object(
                       'product_id', oi.product_id,
                       'quantity', oi.quantity,
                       'product_name', p.name,
                       'product_price', p.price
                   )) as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `;
        return queryWithRetry(query);
    },
    
    getOrderById: async (id) => {
        const query = `
            SELECT o.*, 
                   json_agg(json_build_object(
                       'product_id', oi.product_id,
                       'quantity', oi.quantity,
                       'product_name', p.name,
                       'product_price', p.price
                   )) as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.id = $1
            GROUP BY o.id
        `;
        const result = await queryWithRetry(query, [id]);
        return result.rows[0];
    },
    
    createOrder: async (order) => {
        // Inicia uma transação
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // Cria o pedido
            const orderQuery = `
                INSERT INTO orders (table_number, status, total_amount)
                VALUES ($1, $2, $3)
                RETURNING *
            `;
            const orderValues = [order.table_number, order.status || 'pending', order.total_amount];
            const orderResult = await client.query(orderQuery, orderValues);
            const newOrder = orderResult.rows[0];
            
            // Insere os itens do pedido
            for (const item of order.items) {
                const itemQuery = `
                    INSERT INTO order_items (order_id, product_id, quantity)
                    VALUES ($1, $2, $3)
                `;
                const itemValues = [newOrder.id, item.product_id, item.quantity];
                await client.query(itemQuery, itemValues);
            }
            
            await client.query('COMMIT');
            return newOrder;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },
    
    updateOrderStatus: async (id, status) => {
        const query = `
            UPDATE orders 
            SET status = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `;
        const result = await queryWithRetry(query, [status, id]);
        return result.rows[0];
    }
};

// Queries para mesas
const tableQueries = {
    getAllTables: async () => {
        const query = 'SELECT * FROM tables ORDER BY number';
        return queryWithRetry(query);
    },
    
    getTableById: async (id) => {
        const query = 'SELECT * FROM tables WHERE id = $1';
        const result = await queryWithRetry(query, [id]);
        return result.rows[0];
    },
    
    updateTableStatus: async (id, status) => {
        const query = `
            UPDATE tables 
            SET status = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `;
        const result = await queryWithRetry(query, [status, id]);
        return result.rows[0];
    }
};

// Event listeners para o pool
pool.on('error', (err) => {
    console.error('Erro inesperado no pool do PostgreSQL:', err);
});

// Limpeza na finalização
process.on('SIGINT', async () => {
    console.log('Fechando pool de conexões...');
    await pool.end();
    process.exit(0);
});

module.exports = {
    pool,
    testConnection,
    productQueries,
    orderQueries,
    tableQueries
};
