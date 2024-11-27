const mongoose = require('mongoose');
require('dotenv').config();

const Product = require('./models/Product');
const Order = require('./models/Order');
const Table = require('./models/Table');

// Configuração do Mongoose
mongoose.set('strictQuery', false);

// Função para conectar ao MongoDB
const connectDB = async () => {
    try {
        console.log('Tentando conectar ao MongoDB...');
        console.log('URI:', process.env.MONGODB_URI); // Remova este log em produção
        
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI não está definida nas variáveis de ambiente');
        }

        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            retryWrites: true,
            w: 'majority'
        });

        console.log(`MongoDB Conectado: ${conn.connection.host}`);
        
        // Teste a conexão
        await mongoose.connection.db.admin().ping();
        console.log('Conexão com MongoDB testada com sucesso!');
        
    } catch (error) {
        console.error('Erro ao conectar ao MongoDB:', error);
        process.exit(1);
    }
};

// Queries de Produtos
const productQueries = {
    addProduct: async (product) => {
        try {
            const newProduct = new Product(product);
            await newProduct.save();
            return newProduct;
        } catch (error) {
            console.error('Erro ao adicionar produto:', error);
            throw error;
        }
    },

    getProducts: async () => {
        try {
            return await Product.find().sort('-createdAt');
        } catch (error) {
            console.error('Erro ao buscar produtos:', error);
            throw error;
        }
    },

    getProductById: async (id) => {
        try {
            return await Product.findById(id);
        } catch (error) {
            console.error('Erro ao buscar produto:', error);
            throw error;
        }
    }
};

// Queries de Pedidos
const orderQueries = {
    createOrder: async (tableId) => {
        try {
            const order = new Order({
                table: tableId,
                items: [],
                total_price: 0
            });
            await order.save();
            return order._id;
        } catch (error) {
            console.error('Erro ao criar pedido:', error);
            throw error;
        }
    },

    addOrderItem: async (orderId, item) => {
        try {
            const order = await Order.findById(orderId);
            if (!order) throw new Error('Pedido não encontrado');

            const product = await Product.findById(item.productId);
            if (!product) throw new Error('Produto não encontrado');

            order.items.push({
                product: item.productId,
                quantity: item.quantity,
                unit_price: product.price,
                notes: item.notes,
                modifications: item.modifications || []
            });

            await order.save();
            return order.items[order.items.length - 1]._id;
        } catch (error) {
            console.error('Erro ao adicionar item ao pedido:', error);
            throw error;
        }
    },

    updateOrderStatus: async (orderId, status) => {
        try {
            const order = await Order.findById(orderId);
            if (!order) throw new Error('Pedido não encontrado');

            order.status = status;
            if (status === 'ready') order.ready_at = new Date();
            if (status === 'completed') order.completed_at = new Date();

            await order.save();
            return true;
        } catch (error) {
            console.error('Erro ao atualizar status do pedido:', error);
            throw error;
        }
    },

    getTableOrders: async (tableId) => {
        try {
            return await Order.find({ table: tableId })
                            .populate('table')
                            .populate({
                                path: 'items.product',
                                select: 'name price'
                            })
                            .sort('-createdAt');
        } catch (error) {
            console.error('Erro ao buscar pedidos da mesa:', error);
            throw error;
        }
    },

    getPendingOrders: async () => {
        try {
            return await Order.find({ status: 'pending' })
                            .populate('table')
                            .populate({
                                path: 'items.product',
                                select: 'name price'
                            })
                            .sort('createdAt');
        } catch (error) {
            console.error('Erro ao buscar pedidos pendentes:', error);
            throw error;
        }
    }
};

// Queries de Mesas
const tableQueries = {
    createTable: async (tableNumber) => {
        try {
            const table = new Table({ table_number: tableNumber });
            await table.save();
            return table;
        } catch (error) {
            console.error('Erro ao criar mesa:', error);
            throw error;
        }
    },

    updateTableStatus: async (tableId, status) => {
        try {
            const table = await Table.findByIdAndUpdate(
                tableId,
                { status },
                { new: true }
            );
            return table;
        } catch (error) {
            console.error('Erro ao atualizar status da mesa:', error);
            throw error;
        }
    },

    getTables: async () => {
        try {
            return await Table.find().sort('table_number');
        } catch (error) {
            console.error('Erro ao buscar mesas:', error);
            throw error;
        }
    }
};

// Conecta ao banco de dados
connectDB();

module.exports = {
    connectDB,
    productQueries,
    orderQueries,
    tableQueries
};
