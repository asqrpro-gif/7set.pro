import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const card = await prisma.diagnosticReport.findFirst({
    where: { brand: 'toyota', model: 'camry', code: { contains: 'p0715' } }
  });
  console.log(JSON.stringify(card, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
