// Test environment is configured before any application module is imported.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/bharatseva_test_placeholder';
process.env.MONGODB_DB = 'bharatseva_test';
process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
process.env.LLM_PROVIDER = 'mock';
process.env.EMBEDDING_PROVIDER = 'mock';
process.env.VECTOR_STORE_PROVIDER = 'mongodb';
process.env.ADMIN_TOKEN = 'test-admin-token-0123456789abcdef';
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_MAX_REQUESTS = '1000';
process.env.AGENT_MAX_RUNTIME_MS = '20000';
process.env.CLIENT_ORIGIN = 'http://localhost:5173,http://127.0.0.1:5173';
