import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Начинаем поиск и удаление дубликатов...');
  
  // Ищем все комбинации brand, model, code
  const groups = await prisma.diagnosticReport.groupBy({
    by: ['brand', 'model', 'code'],
    _count: {
      id: true
    },
    having: {
      id: {
        _count: {
          gt: 1
        }
      }
    }
  });

  console.log(`Найдено ${groups.length} групп дубликатов.`);

  let deletedCount = 0;

  for (const group of groups) {
    const records = await prisma.diagnosticReport.findMany({
      where: {
        brand: group.brand,
        model: group.model,
        code: group.code
      },
      orderBy: {
        // Сначала берем завершенные, затем те, что созданы позже (наше будущее)
        created_at: 'desc'
      }
    });

    // Сортируем так, чтобы лучший вариант остался первым
    // Лучший - тот, который is_complete == true, если оба, то тот у которого дата больше (future)
    records.sort((a, b) => {
      if (a.is_complete && !b.is_complete) return -1;
      if (!a.is_complete && b.is_complete) return 1;
      return b.created_at.getTime() - a.created_at.getTime();
    });

    const keep = records[0];
    const toDelete = records.slice(1);

    for (const record of toDelete) {
      await prisma.diagnosticReport.delete({
        where: { id: record.id }
      });
      deletedCount++;
    }
    console.log(`Очищено для ${group.brand} ${group.model} ${group.code}. Удалено: ${toDelete.length}`);
  }

  console.log(`Очистка завершена. Всего удалено дубликатов: ${deletedCount}`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
