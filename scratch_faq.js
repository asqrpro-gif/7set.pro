const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const reports = await prisma.diagnosticReport.findMany({
    take: 10,
    select: { id: true, brand: true, model: true, code: true, schema_faq: true }
  });
  console.log(reports);
}

main().finally(() => prisma.$disconnect());
