const { pool } = require('../database');

const createTables = async () => {
    try {
        console.log('Iniciando criação das tabelas...');

        // Criação das tabelas em sequência
        await pool.query(`
            -- Tabela de produtos
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                category VARCHAR(100),
                description TEXT,
                image_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Tabela de mesas
            CREATE TABLE IF NOT EXISTS tables (
                id SERIAL PRIMARY KEY,
                number INTEGER UNIQUE NOT NULL,
                status VARCHAR(50) DEFAULT 'available',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Tabela de pedidos
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                table_number INTEGER NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                total_amount DECIMAL(10,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ready_at TIMESTAMP,
                completed_at TIMESTAMP
            );

            -- Tabela de itens do pedido
            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Adiciona as foreign keys em queries separadas para evitar problemas de dependência
        await pool.query(`
            -- Foreign keys para orders
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'orders_table_number_fkey'
                ) THEN
                    ALTER TABLE orders
                    ADD CONSTRAINT orders_table_number_fkey
                    FOREIGN KEY (table_number) REFERENCES tables(number);
                END IF;
            END $$;

            -- Foreign keys para order_items
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_id_fkey'
                ) THEN
                    ALTER TABLE order_items
                    ADD CONSTRAINT order_items_order_id_fkey
                    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
                END IF;
            END $$;

            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_product_id_fkey'
                ) THEN
                    ALTER TABLE order_items
                    ADD CONSTRAINT order_items_product_id_fkey
                    FOREIGN KEY (product_id) REFERENCES products(id);
                END IF;
            END $$;
        `);

        // Cria função para atualizar o timestamp de updated_at
        await pool.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        // Cria triggers para atualizar updated_at
        await pool.query(`
            -- Trigger para products
            DROP TRIGGER IF EXISTS update_products_updated_at ON products;
            CREATE TRIGGER update_products_updated_at
                BEFORE UPDATE ON products
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();

            -- Trigger para tables
            DROP TRIGGER IF EXISTS update_tables_updated_at ON tables;
            CREATE TRIGGER update_tables_updated_at
                BEFORE UPDATE ON tables
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();

            -- Trigger para orders
            DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
            CREATE TRIGGER update_orders_updated_at
                BEFORE UPDATE ON orders
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        `);

        // Insere algumas mesas padrão se não existirem
        await pool.query(`
            INSERT INTO tables (number)
            SELECT generate_series(1, 10)
            WHERE NOT EXISTS (SELECT 1 FROM tables WHERE number <= 10);
        `);

        console.log('Tabelas criadas com sucesso!');
    } catch (error) {
        console.error('Erro ao criar tabelas:', error);
        throw error;
    }
};

module.exports = { createTables };
