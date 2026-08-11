import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Начинаем создание 110 тестовых карточек...');
    
    let createdCount = 0;
    
    for (let i = 1; i <= 110; i++) {
        const code = `P9${i.toString().padStart(3, '0')}`;
        const brand = 'TestBrand';
        const model = 'TestModel';
        
        try {
            // Проверяем, существует ли уже такая карточка
            const existing = await prisma.diagnosticReport.findFirst({
                where: { brand, model, code }
            });

            if (!existing) {
                await prisma.diagnosticReport.create({
                    data: {
                        brand: brand,
                        model: model,
                        code: code,
                        severity: 'Низкая',
                        summary: 'Тестовая сводка для проверки таблиц',
                        teaser_text: 'Это короткий тизер для тестовой карточки',
                        full_analysis_markdown: '### Тестовый анализ\nЭто тестовое подробное описание проблемы.',
                        sto_protection_tips: 'Советы для защиты на СТО.',
                        seoTitle: `Ошибка ${code} - ${brand} ${model}`,
                        seoDescription: `Описание ошибки ${code}`,
                        seoScore: Math.floor(Math.random() * (100 - 40 + 1)) + 40,
                        seoRisk: ['SAFE', 'WARNING', 'DANGER'][Math.floor(Math.random() * 3)],
                        uniquenessScore: Math.floor(Math.random() * (100 - 20 + 1)) + 20
                    }
                });
                createdCount++;
            }
            if (i % 20 === 0) console.log(`Обработано ${i} карточек...`);
        } catch (err) {
            console.error(`Ошибка при создании карточки ${code}:`, err.message);
        }
    }
    
    console.log(`Успешно создано ${createdCount} новых тестовых карточек.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
