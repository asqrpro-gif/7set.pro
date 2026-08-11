import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function scanBadSEO() {
  console.log('🔍 Сканируем базу на наличие шаблонных SEO-заголовков...');
  
  // Выгружаем все карточки
  const allReports = await prisma.diagnosticReport.findMany({
    select: { id: true, brand: true, model: true, code: true, seoTitle: true }
  });

  // Ищем совпадения, переводя всё в нижний регистр для надежности
  const badCards = allReports.filter(r => 
    r.seoTitle && r.seoTitle.toLowerCase().includes('расшифровка и причины')
  );

  console.log(`\n🚨 Найдено шаблонных карточек: ${badCards.length} шт.`);

  if (badCards.length > 0) {
    console.log('\nВот первые 10 для примера:');
    badCards.slice(0, 10).forEach(c => {
      console.log(`🚗 ${c.brand} ${c.model} [${c.code}] -> ${c.seoTitle}`);
    });
  }
}

scanBadSEO().finally(() => prisma.$disconnect());
