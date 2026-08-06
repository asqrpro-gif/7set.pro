import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runCleanup() {
  console.log('🚀 Запуск очистки артефактов (висячих цифр) в БД...');
  
  try {
    // Получаем все карточки, где есть сгенерированный markdown
    const reports = await prisma.diagnosticReport.findMany({
      where: {
        full_analysis_markdown: {
          not: ""
        }
      },
      select: {
        id: true,
        brand: true,
        model: true,
        code: true,
        full_analysis_markdown: true
      }
    });

    console.log(`📊 Всего найдено карточек для проверки: ${reports.length}`);

    let updatedPagesCount = 0;
    let totalArtifactsRemoved = 0;

    for (const report of reports) {
      if (!report.full_analysis_markdown) continue;

      const originalText = report.full_analysis_markdown;
      
      // Регулярное выражение для поиска висячих цифр (от 1 до 99), за которыми ничего нет на строке
      const artifactRegex = /^\s*\d+\.\s*$/gm;
      
      // Считаем сколько артефактов найдено в этом конкретном тексте
      const matches = originalText.match(artifactRegex);
      const artifactsInText = matches ? matches.length : 0;

      if (artifactsInText > 0) {
        // Очищаем текст
        let cleanedText = originalText
          .replace(artifactRegex, '') // удаляем висячие цифры
          .replace(/\n{3,}/g, '\n\n') // убираем образовавшиеся огромные дыры (тройные переносы строк)
          .trim();

        // Сохраняем в БД
        await prisma.diagnosticReport.update({
          where: { id: report.id },
          data: { full_analysis_markdown: cleanedText }
        });

        updatedPagesCount++;
        totalArtifactsRemoved += artifactsInText;
        
        console.log(`🧹 Очищена карточка: ${report.brand} ${report.model} ${report.code} (Удалено артефактов: ${artifactsInText})`);
      }
    }

    console.log('\n=================================================');
    console.log('✅ ОЧИСТКА УСПЕШНО ЗАВЕРШЕНА!');
    console.log(`📄 Страниц исправлено: ${updatedPagesCount}`);
    console.log(`🗑️ Всего артефактов удалено: ${totalArtifactsRemoved}`);
    console.log('=================================================\n');

  } catch (error) {
    console.error('❌ Ошибка при очистке БД:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runCleanup();
