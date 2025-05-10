const prisma = require("../config/db");
const { getRedis } = require("../config/redis");
const { producer } = require("../config/kafka");

// ✅ Get chat messages between two users (with Redis caching and debug logs)
const getMessages = async (req, res) => {
  try {
    let { senderId, receiverId } = req.query;

    // Trim and log IDs
    senderId = senderId?.trim();
    receiverId = receiverId?.trim();
    console.log("🟡 Request received for getMessages");
    console.log("➡️ senderId:", senderId);
    console.log("➡️ receiverId:", receiverId);

    if (!senderId || !receiverId) {
      console.log("❌ Missing senderId or receiverId");
      return res.status(400).json({ error: "senderId and receiverId are required" });
    }

    const redisClient = getRedis();

    const [id1, id2] = [senderId, receiverId].sort();
    const cacheKey = `chat:${id1}:${id2}`;
    console.log("🗝️ Redis Cache Key:", cacheKey);

    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("✅ Cache hit");
      return res.json(JSON.parse(cached));
    }

    console.log("⛔ Cache miss. Querying database...");

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
      orderBy: { createdAt: "asc" },
      include: {
        sender: { select: { username: true } },
        receiver: { select: { username: true } },
      },
    });

    console.log("📦 Messages fetched from DB:", messages.length);
    if (messages.length === 0) {
      console.log("⚠️ No messages found in DB for this pair");
    }

    await redisClient.set(cacheKey, JSON.stringify(messages), "EX", 3600);
    console.log("✅ Messages cached in Redis");

    return res.json(messages);
  } catch (error) {
    console.error("❌ Error in getMessages:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ✅ Send a message and publish to Redis/Kafka (with debug logs)
const sendMessage = async (req, res) => {
  try {
    let { senderId, receiverId, content } = req.body;

    // Trim and log inputs
    senderId = senderId?.trim();
    receiverId = receiverId?.trim();
    content = content?.trim();
    console.log("🟢 Request received for sendMessage");
    console.log("➡️ senderId:", senderId);
    console.log("➡️ receiverId:", receiverId);
    console.log("➡️ content:", content);

    if (!senderId || !receiverId || !content) {
      console.log("❌ Missing required fields in sendMessage");
      return res.status(400).json({ error: "senderId, receiverId and content are required" });
    }

    const newMessage = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        content,
      },
    });

    console.log("✅ New message created:", newMessage.id);

    const redisClient = getRedis();
    const [id1, id2] = [senderId, receiverId].sort();
    const cacheKey = `chat:${id1}:${id2}`;
    await redisClient.del(cacheKey); // Invalidate cache
    console.log("🗑️ Redis cache invalidated for:", cacheKey);

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

    console.log("📤 Message sent to Kafka topic: chat-events");

    return res.status(201).json(newMessage);
  } catch (error) {
    console.error("❌ Error in sendMessage:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  getMessages,
  sendMessage,
};
