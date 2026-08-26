import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Начинаем удаление тестовых карточек...');
    const result = await prisma.diagnosticReport.deleteMany({
        where: { brand: 'TestBrand' }
    });
    console.log(`✅ Успешно удалено ${result.count} карточек TestBrand.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
