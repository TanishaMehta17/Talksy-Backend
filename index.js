const express = require("express");
const http = require("http");
const dotenv = require("dotenv");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");

const { connectRedis } = require("./config/redis");
const { connectKafka } = require("./config/kafka");

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

connectRedis();    // initialize Redis
connectKafka();    // initialize Kafka

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
