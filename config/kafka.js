// const { Kafka } = require("kafkajs");

// const kafka = new Kafka({
//   clientId: "chat-app",
//   brokers: ["localhost:9092"], // adjust if needed
// });

// const producer = kafka.producer();

// const connectKafka = async () => {
//   try {
//     await producer.connect();
//     console.log("🚀 Connected to Kafka");
//   } catch (err) {
//     console.error("Kafka connection error:", err);
//   }
// };

// module.exports = {
//   connectKafka,
//   producer,
// };
const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "chat-app",
  brokers: ["localhost:9092"], // adjust if needed
});

const producer = kafka.producer();

const connectKafka = async () => {
  try {
    await producer.connect();
    console.log("🚀 Connected to Kafka");
  } catch (err) {
    console.error("Kafka connection error:", err);
  }
};

// Optional: cleaner method name for initializing Kafka producer
const initKafkaProducer = async () => {
  try {
    await producer.connect();
    console.log("🚀 Kafka Producer initialized");
  } catch (error) {
    console.error("Failed to initialize Kafka producer:", error);
  }
};

// Function to send message to a Kafka topic
const produceEvent = async (topic, message) => {
  try {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }],
    });
    console.log(`✅ Message sent to topic "${topic}"`);
  } catch (err) {
    console.error("❌ Error sending message to Kafka:", err);
  }
};

module.exports = {
  connectKafka,
  producer,
  initKafkaProducer,
  produceEvent,
};
