const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function reset() {
  console.log('Сбрасываем карточки со старым форматом обогащения...');
  const result = await prisma.diagnosticReport.updateMany({
    where: {
      seoRisk: 'SAFE',
      driving_risks_md: null
    },
    data: {
      seoRisk: 'WARNING'
    }
  });
  console.log(`Успешно сброшено ${result.count} карточек. Теперь pm2 enricher подхватит их заново.`);
  await prisma.$disconnect();
}

reset().catch(console.error);
