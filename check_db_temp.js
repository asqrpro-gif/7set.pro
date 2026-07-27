const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const reports = await prisma.diagnosticReport.findMany({
    select: { id: true, brand: true, model: true, code: true, summary: true }
  });
  console.log('--- DB REPORTS ---');
  console.log(JSON.stringify(reports, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
