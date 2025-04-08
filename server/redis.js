const redis = require('redis');

const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

client.on('error', (err) => console.error('Redis Error:', err));

async function connectRedis() {
  try {
    if (!client.isOpen) {
      await client.connect();
      console.log('Connected to Redis');
    }
  } catch (err) {
    console.error('Redis Connection Failed:', err.message);
  }
}

async function getCache(key) {
  try {
    if (!client.isOpen) await connectRedis();
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.error(`Redis Get Error for ${key}:`, err.message);
    return null;
  }
}

async function setCache(key, value, ttl = 24 * 60 * 60) {
  try {
    if (!client.isOpen) await connectRedis();
    await client.setEx(key, ttl, JSON.stringify(value));
  } catch (err) {
    console.error(`Redis Set Error for ${key}:`, err.message);
  }
}

async function deleteCache(key) {
  try {
    if (!client.isOpen) await connectRedis();
    await client.del(key);
  } catch (err) {
    console.error(`Redis Delete Error for ${key}:`, err.message);
  }
}

async function getKeys(pattern) {
  try {
    if (!client.isOpen) await connectRedis();
    return await client.keys(pattern);
  } catch (err) {
    console.error(`Redis Keys Error for pattern ${pattern}:`, err.message);
    return [];
  }
}

async function quitRedis() {
  try {
    if (client.isOpen) {
      await client.quit();
      console.log('Redis connection closed.');
    }
  } catch (err) {
    console.error('Redis Quit Error:', err.message);
  }
}

module.exports = { connectRedis, getCache, setCache, deleteCache, getKeys, quitRedis, client };