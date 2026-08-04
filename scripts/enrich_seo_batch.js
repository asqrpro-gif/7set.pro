import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { enrichSeoCard } from '../services/seoEnrichmentService.js';

const prisma = new PrismaClient();

async function runBatchEnrichment() {
  console.log('🚀 Запуск пакетного pSEO обогащения карточек...');
  
  try {
    // Получаем карточки, требующие обогащения (лимит строго 30)
    const reportsToEnrich = await prisma.diagnosticReport.findMany({
      where: {
        seoRisk: {
          in: ['WARNING', 'DANGER']
        }
      },
      take: 30,
      orderBy: {
        created_at: 'asc' // берем самые старые проблемные
      }
    });

    if (reportsToEnrich.length === 0) {
      console.log('✅ Нет карточек для обогащения (WARNING/DANGER).');
      process.exit(0);
    }

    console.log(`Найдено карточек для обработки: ${reportsToEnrich.length}. Начинаем цикл...`);

    let count = 1;
    for (const report of reportsToEnrich) {
      console.log(`\n[${count}/${reportsToEnrich.length}] Обработка карточки: ${report.brand} ${report.model} ${report.code} (ID: ${report.id})`);
      
      const result = await enrichSeoCard(report, prisma);
      
      if (result.success) {
        console.log(`✅ Успешно обогащена.`);
      } else {
        console.error(`❌ Ошибка:`, result.error);
      }

      // Пауза между запросами (Rate Limit) если это не последняя карточка
      if (count < reportsToEnrich.length) {
        console.log(`⏳ Ожидание 150 секунд (2.5 минуты) перед следующей карточкой для соблюдения лимитов API...`);
        await new Promise(resolve => setTimeout(resolve, 150000));
      }
      
      count++;
    }

    console.log('\n🎉 Пакетная обработка завершена!');
  } catch (err) {
    console.error('❌ Критическая ошибка в пакетном скрипте:', err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

runBatchEnrichment();
