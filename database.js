const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'restaurant.db'));

// Inicialização das tabelas
db.serialize(() => {
    // Tabela de Produtos
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de Itens dos Produtos
    db.run(`CREATE TABLE IF NOT EXISTS product_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        name TEXT NOT NULL,
        additional_price REAL DEFAULT 0,
        is_default BOOLEAN DEFAULT 1,
        FOREIGN KEY (product_id) REFERENCES products (id)
    )`);

    // Tabela de Mesas
    db.run(`CREATE TABLE IF NOT EXISTS tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_number INTEGER UNIQUE NOT NULL,
        status TEXT DEFAULT 'available',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de Pedidos
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_id INTEGER,
        status TEXT DEFAULT 'pending',
        total_price REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (table_id) REFERENCES tables (id)
    )`);

    // Tabela de Itens dos Pedidos
    db.run(`CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        product_id INTEGER,
        quantity INTEGER DEFAULT 1,
        unit_price REAL,
        notes TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders (id),
        FOREIGN KEY (product_id) REFERENCES products (id)
    )`);

    // Tabela de Modificações dos Itens dos Pedidos
    db.run(`CREATE TABLE IF NOT EXISTS order_item_modifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_item_id INTEGER,
        product_item_id INTEGER,
        modification_type TEXT,
        price_change REAL DEFAULT 0,
        FOREIGN KEY (order_item_id) REFERENCES order_items (id),
        FOREIGN KEY (product_item_id) REFERENCES product_items (id)
    )`);
});

// Funções de Produtos
const productQueries = {
    addProduct: async (product) => {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO products (name, price) VALUES (?, ?)',
                [product.name, product.price],
                function(err) {
                    if (err) reject(err);
                    resolve(this.lastID);
                }
            );
        });
    },

    addProductItem: async (productId, item) => {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO product_items (product_id, name, additional_price, is_default) VALUES (?, ?, ?, ?)',
                [productId, item.name, item.additional_price, item.is_default],
                function(err) {
                    if (err) reject(err);
                    resolve(this.lastID);
                }
            );
        });
    },

    getProducts: async () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM products', [], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    },

    getProductWithItems: async (productId) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM products WHERE id = ?', [productId], (err, product) => {
                if (err) reject(err);
                if (!product) resolve(null);

                db.all(
                    'SELECT * FROM product_items WHERE product_id = ?',
                    [productId],
                    (err, items) => {
                        if (err) reject(err);
                        product.items = items;
                        resolve(product);
                    }
                );
            });
        });
    }
};

// Funções de Pedidos
const orderQueries = {
    createOrder: async (tableId) => {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO orders (table_id, status) VALUES (?, "pending")',
                [tableId],
                function(err) {
                    if (err) reject(err);
                    resolve(this.lastID);
                }
            );
        });
    },

    addOrderItem: async (orderItem) => {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO order_items (order_id, product_id, quantity, unit_price, notes) VALUES (?, ?, ?, ?, ?)',
                [orderItem.orderId, orderItem.productId, orderItem.quantity, orderItem.unitPrice, orderItem.notes],
                function(err) {
                    if (err) reject(err);
                    resolve(this.lastID);
                }
            );
        });
    },

    updateOrderStatus: async (orderId, status) => {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE orders SET status = ? WHERE id = ?',
                [status, orderId],
                function(err) {
                    if (err) reject(err);
                    resolve(this.changes);
                }
            );
        });
    },

    getTableOrders: async (tableId) => {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT o.*, oi.* FROM orders o 
                LEFT JOIN order_items oi ON o.id = oi.order_id 
                WHERE o.table_id = ? ORDER BY o.created_at DESC`,
                [tableId],
                (err, rows) => {
                    if (err) reject(err);
                    resolve(rows);
                }
            );
        });
    },

    getPendingOrders: async () => {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT o.*, oi.* FROM orders o 
                LEFT JOIN order_items oi ON o.id = oi.order_id 
                WHERE o.status = 'pending' ORDER BY o.created_at`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    resolve(rows);
                }
            );
        });
    }
};

module.exports = {
    db,
    productQueries,
    orderQueries
};
