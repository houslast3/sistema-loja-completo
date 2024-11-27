const path = require('path');
const dotenv = require('dotenv');

// Tenta carregar o .env apenas em desenvolvimento
if (process.env.NODE_ENV !== 'production') {
    dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
}

// Função para obter variável de ambiente com fallback
const getEnvVar = (key, defaultValue = undefined) => {
    const value = process.env[key];
    if (!value && defaultValue === undefined) {
        throw new Error(`Variável de ambiente obrigatória não encontrada: ${key}`);
    }
    return value || defaultValue;
};

const config = {
    database: {
        host: getEnvVar('DB_HOST', 'dpg-ct3m5452ng1s739ut1ng-a.oregon-postgres.render.com'),
        port: getEnvVar('DB_PORT', 5432),
        database: getEnvVar('DB_NAME', 'dados_r2oh'),
        user: getEnvVar('DB_USER', 'dados_r2oh_user'),
        password: getEnvVar('DB_PASSWORD', 'Q9FmAmHrnzMzkn7QvrGmQmlUytF3tzCt'),
        ssl: {
            rejectUnauthorized: false // Necessário para conexão com Render
        },
        max: 20, // Máximo de conexões no pool
        idleTimeoutMillis: 30000, // Tempo máximo que uma conexão pode ficar inativa
        connectionTimeoutMillis: 2000, // Tempo máximo para estabelecer conexão
    },
    server: {
        port: getEnvVar('PORT', 10000),
        env: getEnvVar('NODE_ENV', 'development')
    },
    websocket: {
        url: getEnvVar('WS_URL', 'ws://localhost:10000')
    }
};

module.exports = config;
