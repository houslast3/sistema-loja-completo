const path = require('path');
const dotenv = require('dotenv');

// Carrega o arquivo .env
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const config = {
    mongodb: {
        uri: process.env.MONGODB_URI,
        options: {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            retryWrites: true,
            w: 'majority'
        }
    },
    server: {
        port: process.env.PORT || 10000,
        env: process.env.NODE_ENV || 'development'
    },
    websocket: {
        url: process.env.WS_URL || 'ws://localhost:10000'
    }
};

// Validação das configurações obrigatórias
const requiredConfigs = ['mongodb.uri'];

for (const configPath of requiredConfigs) {
    const value = configPath.split('.').reduce((obj, key) => obj && obj[key], config);
    if (!value) {
        throw new Error(`Configuração obrigatória não encontrada: ${configPath}`);
    }
}

module.exports = config;
