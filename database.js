const { Pool } = require('pg');
require('dotenv').config();

// Configuração do pool de conexões PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
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
        const result = await pool.query(
            'INSERT INTO products (name, price) VALUES ($1, $2) RETURNING id',
            [product.name, product.price]
        );
        return result.rows[0].id;
    },

    addProductItem: async (productId, item) => {
        const result = await pool.query(
            'INSERT INTO product_items (product_id, name, additional_price, is_default) VALUES ($1, $2, $3, $4) RETURNING id',
            [productId, item.name, item.additional_price, item.is_default]
        );
        return result.rows[0].id;
    },

    getProducts: async () => {
        const result = await pool.query('SELECT * FROM products');
        return result.rows;
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
