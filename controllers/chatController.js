const prisma = require("../config/db");
const { getRedis } = require("../config/redis");
const { producer } = require("../config/kafka");

// ✅ Get chat messages between two users (with Redis caching)
const getMessages = async (req, res) => {
  try {
    const { senderId, receiverId } = req.query;
    if (!senderId || !receiverId) {
      return res.status(400).json({ error: "senderId and receiverId are required" });
    }

    const redisClient = getRedis();
    const cacheKey = `chat:${senderId}:${receiverId}`;
    const cached = await redisClient.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: String(senderId), receiverId: String(receiverId) },
          { senderId: String(receiverId), receiverId: String(senderId) },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    await redisClient.set(cacheKey, JSON.stringify(messages), "EX", 3600); // 1 hour TTL
    res.json(messages);
  } catch (error) {
    console.error("Error in getMessages:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ✅ Send a message and publish to Redis/Kafka
const sendMessage = async (req, res) => {
  try {
    const { senderId, receiverId, content } = req.body;
    if (!senderId || !receiverId || !content) {
      return res.status(400).json({ error: "senderId, receiverId and content are required" });
    }

    const newMessage = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        content,
      },
    });

    const redisClient = getRedis();
    const key1 = `chat:${senderId}:${receiverId}`;
    const key2 = `chat:${receiverId}:${senderId}`;
    await redisClient.del(key1);
    await redisClient.del(key2);

    await producer.send({
      topic: "chat-events",
      messages: [
        {
          value: JSON.stringify({
            type: "new-message",
            message: newMessage,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    });

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error in sendMessage:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  getMessages,
  sendMessage,
};
