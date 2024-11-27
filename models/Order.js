const mongoose = require('mongoose');

const orderItemModificationSchema = new mongoose.Schema({
    product_item: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product.items'
    },
    modification_type: String,
    price_change: {
        type: Number,
        default: 0
    }
});

const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        default: 1,
        min: 1
    },
    unit_price: {
        type: Number,
        required: true
    },
    notes: String,
    status: {
        type: String,
        enum: ['pending', 'preparing', 'ready', 'delivered'],
        default: 'pending'
    },
    modifications: [orderItemModificationSchema]
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
    table: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Table',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'preparing', 'ready', 'completed', 'cancelled'],
        default: 'pending'
    },
    total_price: {
        type: Number,
        required: true
    },
    items: [orderItemSchema],
    ready_at: Date,
    completed_at: Date
}, { timestamps: true });

// Middleware para calcular o preço total antes de salvar
orderSchema.pre('save', function(next) {
    this.total_price = this.items.reduce((total, item) => {
        const itemTotal = item.unit_price * item.quantity;
        const modificationsTotal = item.modifications.reduce((modTotal, mod) => modTotal + mod.price_change, 0);
        return total + itemTotal + modificationsTotal;
    }, 0);
    next();
});

module.exports = mongoose.model('Order', orderSchema);
