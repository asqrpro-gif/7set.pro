import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { enrichReportText } from '../lib/seoEnricher.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Запуск обновления ссылок (чистка 404 и дубликатов) во всех карточках...');

  // Берем все карточки из базы
  const reports = await prisma.diagnosticReport.findMany({
    select: {
      id: true,
      brand: true,
      model: true,
      code: true,
      drivability: true,
      full_analysis_markdown: true
    }
  });

  console.log(`Найдено карточек для проверки: ${reports.length}`);

  let updatedCount = 0;

  for (const report of reports) {
    const oldMarkdown = report.full_analysis_markdown || '';
    
    // Прогоняем текст через enrichReportText
    // Эта функция сама удалит старые ссылки (HTML и Markdown) 
    // и расставит новые только на основе актуального wikiDictionary.js
    const newMarkdown = enrichReportText(
      oldMarkdown, 
      report.brand, 
      report.model, 
      report.code, 
      report.drivability
    );

    // Если текст изменился (удалились битые ссылки или добавились новые), обновляем БД
    if (oldMarkdown !== newMarkdown) {
      await prisma.diagnosticReport.update({
        where: { id: report.id },
        data: {
          full_analysis_markdown: newMarkdown
        }
      });
      updatedCount++;
    }
  }

  console.log(`✅ Готово! Обновлены ссылки в ${updatedCount} карточках.`);
  await prisma.$disconnect();
}

main().catch(console.error);
