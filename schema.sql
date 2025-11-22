-- 1. Tabla de Usuarios: Gestiona saldo, pruebas y llaves propias
DROP TABLE IF EXISTS users;
CREATE TABLE users (
    user_id TEXT PRIMARY KEY,
    credits INTEGER DEFAULT 0,
    trial_uses_left INTEGER DEFAULT 5,
    byok_key TEXT,
    created_at INTEGER DEFAULT (unixepoch())
);

-- 2. Log de Consumo: Auditoría de gastos
DROP TABLE IF EXISTS consumption_log;
CREATE TABLE consumption_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action_type TEXT, -- 'GEN_IMG', 'GEN_TEXT', 'GEN_VIDEO'
    cost INTEGER,
    mode_used TEXT, -- 'TRIAL', 'CREDIT', 'BYOK'
    timestamp INTEGER DEFAULT (unixepoch())
);

-- 3. Publicaciones Programadas: Cola para el Cron Trigger
DROP TABLE IF EXISTS scheduled_posts;
CREATE TABLE scheduled_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    content TEXT,
    media_url TEXT,
    scheduled_time INTEGER, -- Unix Timestamp
    status TEXT DEFAULT 'pending', -- 'pending', 'published', 'failed'
    facebook_page_id TEXT,
    facebook_token TEXT,
    error_log TEXT
);

-- Índices para optimizar el Cron y búsquedas
CREATE INDEX idx_scheduled_time ON scheduled_posts(status, scheduled_time);
CREATE INDEX idx_user_consumption ON consumption_log(user_id);
