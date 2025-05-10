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

module.exports = {
  connectKafka,
  producer,
};
