const mongoose = require('mongoose');

const productItemSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    additional_price: {
        type: Number,
        default: 0
    },
    is_default: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    items: [productItemSchema]
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
