import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanAiText() {
  console.log('Начинаем очистку базы от "ИИ синтезирует ответ..."');
  
  const fieldsToClean = [
    'full_analysis_markdown',
    'driving_risks_md',
    'diagnostic_data_md',
    'pro_tips_md',
    'tools_table_md',
    'oem_parts_table_md',
    'summary',
    'teaser_text',
    'sto_protection_tips',
    'seoDescription'
  ];

  let totalUpdated = 0;
  
  // Регулярка для удаления:
  // 1. Заголовка <h3> с текстом (с любыми классами)
  // 2. Опционального абзаца <p> про ожидание 10-20 секунд, идущего следом
  // 3. Просто текста "ИИ синтезирует ответ..." без тегов (на всякий случай)
  const regexes = [
    /<h3[^>]*>.*?(?:ИИ синтезирует ответ|Формируем отчет).*?<\/h3>\s*(?:<p[^>]*>.*?10-20 секунд.*?<\/p>\s*)?/gi,
    /###\s*(?:ИИ синтезирует ответ|Формируем отчет).*/gi,
    /<h3>.*?(?:ИИ синтезирует ответ|Формируем отчет).*?<\/h3>/gi,
    /(?:ИИ синтезирует ответ|Формируем отчет)\.\.\./gi
  ];

  try {
    const allReports = await prisma.diagnosticReport.findMany();
    
    for (const report of allReports) {
      let updated = false;
      let updateData = {};

      for (const field of fieldsToClean) {
        if (report[field]) {
          let newValue = report[field];
          
          for (const regex of regexes) {
            if (regex.test(newValue)) {
              newValue = newValue.replace(regex, '').trim();
            }
          }
          
          if (newValue !== report[field]) {
            updateData[field] = newValue;
            updated = true;
          }
        }
      }

      if (updated) {
        await prisma.diagnosticReport.update({
          where: { id: report.id },
          data: updateData
        });
        console.log(`[ОЧИЩЕНО] Карточка ${report.brand} ${report.model} ${report.code}`);
        totalUpdated++;
      }
    }
    
    console.log(`\nГотово! Очищено карточек: ${totalUpdated}`);
  } catch (error) {
    console.error('Ошибка при очистке:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanAiText();
