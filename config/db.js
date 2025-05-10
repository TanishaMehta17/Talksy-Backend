const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});


prisma
  .$connect()
  .then(async () => {
    console.log("Prisma connected successfully");
  })
  .catch((error) => {
    console.error("Error connecting to Prisma:", error);
  });

module.exports = prisma;
