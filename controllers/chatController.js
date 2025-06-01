const prisma = require("../config/db");
const { getRedis } = require("../config/redis");
const { produceEvent  } = require("../config/kafka");

//  Get chat messages between two users (with Redis caching and debug logs)
const getMessages = async (req, res) => {
  try {
    let { senderId, receiverId } = req.query;

    // Trim and log IDs
    senderId = senderId?.trim();
    receiverId = receiverId?.trim();
    console.log(" Request received for getMessages");
    console.log(" senderId:", senderId);
    console.log(" receiverId:", receiverId);

    if (!senderId || !receiverId) {
      console.log(" Missing senderId or receiverId");
      return res.status(400).json({ error: "senderId and receiverId are required" });
    }

    const redisClient = getRedis();

    const [id1, id2] = [senderId, receiverId].sort();
    const cacheKey = `chat:${id1}:${id2}`;
    console.log(" Redis Cache Key:", cacheKey);

    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log(" Cache hit");
      return res.json(JSON.parse(cached));
    }

    console.log(" Cache miss. Querying database...");

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
      orderBy: { createdAt: "asc" },
     select: {
        id: true, 
        content: true,
        createdAt: true,
        senderId: true,
        receiverId: true,
        sender: { select: { username: true } },
        receiver: { select: { username: true } },
      },
    });

    console.log(" Messages fetched from DB:", messages.length);
    if (messages.length === 0) {
      console.log(" No messages found in DB for this pair");
    }

    await redisClient.set(cacheKey, JSON.stringify(messages), "EX", 3600);
    console.log(" Messages cached in Redis");

    return res.json(messages);
  } catch (error) {
    console.error(" Error in getMessages:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

//  Send a message and publish to Redis/Kafka (with debug logs)
const sendMessage = async (req, res) => {
  try {
    let { senderId, receiverId, content } = req.body;

    // Trim and log inputs
    senderId = senderId?.trim();
    receiverId = receiverId?.trim();
    content = content?.trim();
    console.log(" Request received for sendMessage");
    console.log(" senderId:", senderId);
    console.log(" receiverId:", receiverId);
    console.log(" content:", content);

    if (!senderId || !receiverId || !content) {
      console.log(" Missing required fields in sendMessage");
      return res.status(400).json({ error: "senderId, receiverId and content are required" });
    }

    const newMessage = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        content,
      },
    });

    console.log(" New message created:", newMessage.id);

    const redisClient = getRedis();
    const [id1, id2] = [senderId, receiverId].sort();
    const cacheKey = `chat:${id1}:${id2}`;
    await redisClient.del(cacheKey); // Invalidate cache
    console.log(" Redis cache invalidated for:", cacheKey);

  
    await produceEvent("chat-events", {
  type: "new-message",
  message: newMessage,
  
  timestamp: new Date().toISOString(),
});


    console.log("Message sent to Kafka topic: chat-events");

    return res.status(201).json(newMessage);
  } catch (error) {
    console.error(" Error in sendMessage:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


const getChatUsers = async (req, res) => {
  try {
   const userId = String(req.query.userId).trim(); 
if (!userId) return res.status(400).json({ error: "userId is required" });

console.log("Checking user existence for:", userId);
const userExists = await prisma.user.findUnique({
  where: { id: userId }
});


    const sentMessages = await prisma.message.findMany({
      where: { senderId: userId },
      include: { receiver: true },
    });

    console.log("Sent messages:", sentMessages.length);

    const receivedMessages = await prisma.message.findMany({
      where: { receiverId: userId },
      include: { sender: true },
    });

    console.log("Received messages:", receivedMessages.length);

    const chatUsers = [
      ...sentMessages.map(m => m.receiver),
      ...receivedMessages.map(m => m.sender),
    ].filter(Boolean); 

    console.log("Total chat users before deduplication:", chatUsers.length);

    const uniqueUsers = Array.from(new Map(chatUsers.map(u => [u.id, u])).values());

    console.log("Unique chat users:", uniqueUsers);

    return res.json(uniqueUsers);
  } catch (error) {
    console.error("Error in getChatUsers:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


// const editMessage = async (req, res) => {
//   try {
//     const { messageId, newContent } = req.body;

//     if (!messageId || !newContent) {
//       return res.status(400).json({ error: "messageId and newContent are required" });
//     }

//     const updated = await prisma.message.update({
//       where: { id: messageId },
//       data: { content: newContent },
//       include: { sender: true, receiver: true },
//     });

//     // Invalidate Redis cache
//     const redisClient = getRedis();
//     const [id1, id2] = [updated.senderId, updated.receiverId].sort();
//     const cacheKey = `chat:${id1}:${id2}`;
//     await redisClient.del(cacheKey);
//     console.log("🧹 Redis cache cleared for:", cacheKey);

//     return res.json(updated);
//   } catch (error) {
//     console.error("Error editing message:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// };
//const { produceEvent } = require("../kafka/producer");

const editMessage = async (req, res) => {
  try {
    const { messageId, newContent } = req.body;

    if (!messageId || !newContent) {
      return res.status(400).json({ error: "messageId and newContent are required" });
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content: newContent },
      include: { sender: true, receiver: true },
    });

    // Clear Redis cache
    const redisClient = getRedis();
    const [id1, id2] = [updated.senderId, updated.receiverId].sort();
    const cacheKey = `chat:${id1}:${id2}`;
    await redisClient.del(cacheKey);

    // Publish to Kafka
    await produceEvent("chat-events", {
      type: "EDIT_MESSAGE",
      message: updated,
    });

    return res.json(updated);
  } catch (error) {
    console.error("Error editing message:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


// const deleteMessage = async (req, res) => {
//   try {
//     const { messageId } = req.body;

//     if (!messageId) {
//       return res.status(400).json({ error: "messageId is required" });
//     }

//     // Get message before deletion to retrieve sender/receiver IDs
//     const message = await prisma.message.findUnique({
//       where: { id: messageId },
//     });

//     if (!message) {
//       return res.status(404).json({ error: "Message not found" });
//     }

//     await prisma.message.delete({
//       where: { id: messageId },
//     });

//     // Invalidate Redis cache
//     const redisClient = getRedis();
//     const [id1, id2] = [message.senderId, message.receiverId].sort();
//     const cacheKey = `chat:${id1}:${id2}`;
//     await redisClient.del(cacheKey);
//     console.log(" Redis cache cleared for:", cacheKey);

//     return res.json({ message: "Message deleted successfully" });
//   } catch (error) {
//     console.error("Error deleting message:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// };
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.body;

    if (!messageId) {
      return res.status(400).json({ error: "messageId is required" });
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    await prisma.message.delete({ where: { id: messageId } });

    // Clear Redis cache
    const redisClient = getRedis();
    const [id1, id2] = [message.senderId, message.receiverId].sort();
    const cacheKey = `chat:${id1}:${id2}`;
    await redisClient.del(cacheKey);

    // Kafka event
    await produceEvent("chat-events", {
      type: "DELETE_MESSAGE",
      message,
    });

    return res.json({ message: "Message deleted successfully" });
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


const getRecentMessages = async (req, res) => {
  try {
   const userId = String(req.query.userId).trim(); // Ensure it's a string and trimmed
if (!userId) return res.status(400).json({ error: "userId is required" });

console.log("Checking user existence for:", userId);
const userExists = await prisma.user.findUnique({
  where: { id: userId }
});


    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: true,
        receiver: true,
      },
    });

    console.log("Total messages found:", messages.length);

    const recentMap = new Map();

    for (let msg of messages) {
      const chatKey = [msg.senderId, msg.receiverId].sort().join("-");
      if (!recentMap.has(chatKey)) {
        recentMap.set(chatKey, {
          id: msg.id,
          content: msg.content,
          createdAt: msg.createdAt,
          isRead: msg.isRead,
          sender: {
            id: msg.sender?.id,
            username: msg.sender?.username,
          },
          receiver: {
            id: msg.receiver?.id,
            username: msg.receiver?.username,
          }
        });
      }
    }

    const result = Array.from(recentMap.values());
    console.log("Recent conversations:", result.length);

    return res.json(result);
  } catch (error) {
    console.error("Error in getRecentMessages:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


// const markMessagesAsRead = async (req, res) => {
//   try {
//     const { senderId, receiverId } = req.body;

//     if (!senderId || !receiverId) {
//       return res.status(400).json({ error: "senderId and receiverId are required" });
//     }

//     await prisma.message.updateMany({
//       where: {
//         senderId: senderId.trim(),
//         receiverId: receiverId.trim(),
//         isRead: false,
//       },
//       data: { isRead: true },
//     });

//     return res.json({ message: "Messages marked as read" });
//   } catch (error) {
//     console.error("Error in markMessagesAsRead:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// };
const markMessagesAsRead = async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;

    if (!senderId || !receiverId) {
      return res.status(400).json({ error: "senderId and receiverId are required" });
    }

    const updated = await prisma.message.updateMany({
      where: {
        senderId: senderId.trim(),
        receiverId: receiverId.trim(),
        isRead: false,
      },
      data: { isRead: true },
    });

    // Kafka event for real-time updates
    await produceEvent("chat-events", {
      type: "MARK_AS_READ",
      senderId,
      receiverId,
    });

    return res.json({ message: "Messages marked as read" });
  } catch (error) {
    console.error("Error in markMessagesAsRead:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


const getUnreadCount = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) return res.status(400).json({ error: "userId is required" });

    const unreadCounts = await prisma.message.groupBy({
      by: ['senderId'],
      where: {
        receiverId: userId.trim(),
        isRead: false,
      },
      _count: {
        _all: true,
      },
    });

    return res.json(unreadCounts.map(item => ({
      senderId: item.senderId,
      count: item._count._all,
    })));
  } catch (error) {
    console.error("Error in getUnreadCount:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const newChat = async (req, res) => {
  try {
    let { senderId, receiverEmail } = req.body;

    senderId = senderId?.trim();
    receiverEmail = receiverEmail?.trim();

    if (!senderId || !receiverEmail) {
      return res.status(400).json({ error: "senderId and receiverEmail are required" });
    }

    const sender = await prisma.user.findUnique({ where: { id: senderId } });
    const receiver = await prisma.user.findUnique({ where: { email: receiverEmail } });

    if (!sender || !receiver) {
      return res.status(404).json({ error: "User not found" });
    }

    if (sender.id === receiver.id) {
      return res.status(400).json({ error: "Cannot start chat with yourself" });
    }

    const existingMessages = await prisma.message.findFirst({
      where: {
        OR: [
          { senderId: sender.id, receiverId: receiver.id },
          { senderId: receiver.id, receiverId: sender.id },
        ],
      },
    });

    if (existingMessages) {
      return res.status(200).json({
        message: "Chat already exists",
        chat: {
          receiverId: receiver.id,
          receiverName: receiver.username,
        },
      });
    }

    const initMessage = await prisma.message.create({
      data: {
        senderId: sender.id,
        receiverId: receiver.id,
        content: "[Chat initiated]",
        isRead: false,
      },
    });

    return res.status(201).json({
      message: "New chat started",
      chat: {
        receiverId: receiver.id,
        receiverName: receiver.username,
      },
    });
  } catch (error) {
    console.error(" Error in newChat:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


module.exports = {
getMessages,
sendMessage,
getChatUsers,
editMessage,
deleteMessage,
getRecentMessages,
getRecentMessages,
markMessagesAsRead,
getUnreadCount,
newChat
};
