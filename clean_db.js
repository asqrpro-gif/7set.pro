import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Очистка кэша от ложных записей UNSUPPORTED...');
  
  // Удаляем записи, которые могли быть ложно сохранены как universal/UNSUPPORTED или с шаблонной заглушкой
  const deleted = await prisma.diagnosticReport.deleteMany({
    where: {
      OR: [
        { brand: 'universal' },
        { code: 'UNSUPPORTED' },
        { summary: { contains: 'не зарегистрирован в официальных каталогах' } }
      ]
    }
  });

  console.log(`✅ Удалено ложных/универсальных записей из кэша: ${deleted.count}`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
