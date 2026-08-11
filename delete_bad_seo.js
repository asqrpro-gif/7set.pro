import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function deleteBadSEO() {
  console.log('🗑️ Начинаем удаление карточек с плохим SEO-заголовком...');
  
  const allReports = await prisma.diagnosticReport.findMany({
    select: { id: true, seoTitle: true }
  });

  // Собираем ID всех карточек с шаблонным текстом
  const idsToDelete = allReports
    .filter(r => r.seoTitle && r.seoTitle.toLowerCase().includes('расшифровка и причины'))
    .map(r => r.id);

  if (idsToDelete.length === 0) {
    console.log('✅ Шаблонных карточек не найдено.');
    return;
  }

  // Удаляем их из базы
  const deleted = await prisma.diagnosticReport.deleteMany({
    where: { id: { in: idsToDelete } }
  });

  console.log(`🧹 Успешно удалено бракованных карточек: ${deleted.count}`);
}

deleteBadSEO().finally(() => prisma.$disconnect());
