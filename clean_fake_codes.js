import { PrismaClient } from '@prisma/client';
import { getFactFromDB } from './lib/gemini_clean.js';

const prisma = new PrismaClient();

async function cleanFakeCodes() {
  console.log('🔍 Ищем карточки, которые ведут на страницу заглушки (error_code.js)...');

  // 1. Получаем вообще все записи из базы (нужны только ID и сами коды)
  const allReports = await prisma.diagnosticReport.findMany({
    select: { id: true, code: true, brand: true, model: true }
  });

  const obdRegex = /^[PBUC][0-9A-F]{4}$/i;
  const idsToDelete = [];

  // 2. Прогоняем каждый код через ту же самую проверку, что и в server.js
  for (const report of allReports) {
    const cleanCode = report.code.toUpperCase().trim();
    const baseDescription = getFactFromDB(cleanCode);

    // Если код не соответствует формату ИЛИ его нет в локальной базе — это пустышка!
    if (!obdRegex.test(cleanCode) || !baseDescription) {
      console.log(`❌ Найден мусор: ${report.brand} ${report.model} [${cleanCode}]. Готовим к удалению.`);
      idsToDelete.push(report.id);
    }
  }

  if (idsToDelete.length === 0) {
    console.log('✅ Мусор не найден. База абсолютно чиста!');
    return;
  }

  console.log(`\n🗑️ Всего найдено ${idsToDelete.length} "пустышек". Удаляем разом...`);

  // 3. Удаляем все найденные карточки одним махом
  const deleted = await prisma.diagnosticReport.deleteMany({
    where: {
      id: { in: idsToDelete }
    }
  });

  console.log(`🧹 Успешно удалено записей: ${deleted.count}`);
}

cleanFakeCodes().catch(e => console.error(e)).finally(() => prisma.$disconnect());
