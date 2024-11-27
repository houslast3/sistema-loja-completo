const { Pool } = require('pg');
require('dotenv').config();

// Configuração do pool de conexões PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20, // máximo de conexões no pool
    idleTimeoutMillis: 30000, // tempo máximo que uma conexão pode ficar ociosa
    connectionTimeoutMillis: 2000, // tempo máximo para estabelecer uma conexão
    keepAlive: true // mantém a conexão ativa
});

// Listener para erros do pool
pool.on('error', (err, client) => {
    console.error('Erro inesperado no pool de conexões:', err);
});

// Listener para conexões adquiridas
pool.on('connect', (client) => {
    client.query('SET statement_timeout = 30000'); // timeout de 30 segundos para queries
});

// Inicialização das tabelas
async function initDatabase() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Tabela de Produtos
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                price DECIMAL NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de Itens dos Produtos
        await client.query(`
            CREATE TABLE IF NOT EXISTS product_items (
                id SERIAL PRIMARY KEY,
                product_id INTEGER REFERENCES products(id),
                name TEXT NOT NULL,
                additional_price DECIMAL DEFAULT 0,
                is_default BOOLEAN DEFAULT true
            )
        `);

        // Tabela de Mesas
        await client.query(`
            CREATE TABLE IF NOT EXISTS tables (
                id SERIAL PRIMARY KEY,
                table_number INTEGER UNIQUE NOT NULL,
                status TEXT DEFAULT 'available',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de Pedidos
        await client.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                table_id INTEGER REFERENCES tables(id),
                status TEXT DEFAULT 'pending',
                total_price DECIMAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ready_at TIMESTAMP,
                completed_at TIMESTAMP
            )
        `);

        // Tabela de Itens dos Pedidos
        await client.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INTEGER REFERENCES orders(id),
                product_id INTEGER REFERENCES products(id),
                quantity INTEGER DEFAULT 1,
                unit_price DECIMAL,
                notes TEXT,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de Modificações dos Itens dos Pedidos
        await client.query(`
            CREATE TABLE IF NOT EXISTS order_item_modifications (
                id SERIAL PRIMARY KEY,
                order_item_id INTEGER REFERENCES order_items(id),
                product_item_id INTEGER REFERENCES product_items(id),
                modification_type TEXT,
                price_change DECIMAL DEFAULT 0
            )
        `);

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// Funções de Produtos
const productQueries = {
    addProduct: async (product) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // Insere o produto
            const productResult = await client.query(
                'INSERT INTO products (name, price) VALUES ($1, $2) RETURNING id, name, price, created_at',
                [product.name, product.price]
            );
            const productId = productResult.rows[0].id;

            // Array para armazenar os itens inseridos
            const insertedItems = [];

            // Se houver itens, insere cada um
            if (product.items && product.items.length > 0) {
                for (const item of product.items) {
                    const itemResult = await client.query(
                        `INSERT INTO product_items 
                         (product_id, name, additional_price, is_default) 
                         VALUES ($1, $2, $3, $4)
                         RETURNING id, name, additional_price, is_default`,
                        [productId, item.name, item.additional_price || 0, item.is_default || true]
                    );
                    insertedItems.push(itemResult.rows[0]);
                }
            }

            await client.query('COMMIT');
            
            // Retorna o produto completo com seus itens
            return {
                id: productId,
                ...productResult.rows[0],
                items: insertedItems
            };
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Erro ao inserir produto:', error);
            throw new Error('Falha ao cadastrar o produto: ' + error.message);
        } finally {
            client.release();
        }
    },

    addProductItem: async (productId, item) => {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO product_items 
                 (product_id, name, additional_price, is_default) 
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, name, additional_price, is_default`,
                [productId, item.name, item.additional_price || 0, item.is_default || true]
            );
            return result.rows[0];
        } catch (error) {
            console.error('Erro ao inserir item do produto:', error);
            throw new Error('Falha ao cadastrar o item: ' + error.message);
        } finally {
            client.release();
        }
    },

    getProducts: async () => {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT p.*, 
                       COALESCE(json_agg(pi.*) FILTER (WHERE pi.id IS NOT NULL), '[]') as items
                FROM products p
                LEFT JOIN product_items pi ON p.id = pi.product_id
                GROUP BY p.id
                ORDER BY p.created_at DESC
            `);
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar produtos:', error);
            throw new Error('Falha ao buscar produtos: ' + error.message);
        } finally {
            client.release();
        }
    },

    getProductWithItems: async (productId) => {
        const product = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
        if (product.rows.length === 0) return null;

        const items = await pool.query(
            'SELECT * FROM product_items WHERE product_id = $1',
            [productId]
        );
        
        return {
            ...product.rows[0],
            items: items.rows
        };
    }
};

// Funções de Pedidos
const orderQueries = {
    createOrder: async (tableId) => {
        const result = await pool.query(
            'INSERT INTO orders (table_id, status) VALUES ($1, $2) RETURNING id',
            [tableId, 'pending']
        );
        return result.rows[0].id;
    },

    addOrderItem: async (orderItem) => {
        const result = await pool.query(
            'INSERT INTO order_items (order_id, product_id, quantity, unit_price, notes) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [orderItem.orderId, orderItem.productId, orderItem.quantity, orderItem.unitPrice, orderItem.notes]
        );
        return result.rows[0].id;
    },

    updateOrderStatus: async (orderId, status) => {
        let query = 'UPDATE orders SET status = $1';
        const params = [status, orderId];

        if (status === 'ready') {
            query += ', ready_at = CURRENT_TIMESTAMP';
        } else if (status === 'completed') {
            query += ', completed_at = CURRENT_TIMESTAMP';
        }

        query += ' WHERE id = $2';

        const result = await pool.query(query, params);
        return result.rowCount;
    },

    getTableOrders: async (tableId) => {
        const result = await pool.query(
            `SELECT o.*, oi.*, p.name as product_name 
            FROM orders o 
            LEFT JOIN order_items oi ON o.id = oi.order_id 
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.table_id = $1 
            ORDER BY o.created_at DESC`,
            [tableId]
        );
        return result.rows;
    },

    getPendingOrders: async () => {
        const result = await pool.query(
            `SELECT o.*, oi.*, p.name as product_name 
            FROM orders o 
            LEFT JOIN order_items oi ON o.id = oi.order_id 
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.status = 'pending' 
            ORDER BY o.created_at`
        );
        return result.rows;
    }
};

// Inicializa o banco de dados
initDatabase().catch(console.error);

module.exports = {
    pool,
    productQueries,
    orderQueries
};
