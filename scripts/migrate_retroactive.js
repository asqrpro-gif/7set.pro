import { PrismaClient } from '@prisma/client';
import { enrichReportText } from '../lib/seoEnricher.js';

const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Запуск ретроактивного обогащения для ОПУБЛИКОВАННЫХ карточек...");
    
    // ГЛАВНОЕ УСЛОВИЕ: только опубликованные (created_at <= сейчас) и уже обогащенные ИИ (SAFE)
    const now = new Date();
    const reports = await prisma.diagnosticReport.findMany({
        where: {
            seoRisk: 'SAFE',
            created_at: {
                lte: now
            }
        }
    });

    console.log(`Найдено подходящих карточек: ${reports.length}`);

    let updatedCount = 0;
    
    for (const report of reports) {
        try {
            const rawText = report.full_analysis_markdown || report.summary || '';
            const newText = enrichReportText(rawText, report.brand, report.model, report.code, report.drivability);
            
            // Проверяем, изменился ли текст (чтобы не делать лишних апдейтов, если глоссарий уже был добавлен)
            if (newText !== rawText) {
                await prisma.diagnosticReport.update({
                    where: { id: report.id },
                    data: { full_analysis_markdown: newText }
                });
                updatedCount++;
                process.stdout.write('.');
            } else {
                process.stdout.write('-');
            }
        } catch (error) {
            console.error(`\n❌ Ошибка обогащения карточки ${report.id}:`, error);
        }
    }
    
    console.log(`\n✅ Готово! Обновлено карточек: ${updatedCount}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
