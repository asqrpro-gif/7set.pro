import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("🔄 Сбрасываем старые оценки...");
    const result = await prisma.diagnosticReport.updateMany({
        data: { seoScore: 0 }
    });
    console.log(`✅ Сброшено карточек: ${result.count}`);
    console.log("Фоновый сканер (в server.js) теперь постепенно перепроверит их и раздаст статусы WARNING/DANGER, после чего скрипт обогащения начнет свою работу.");
    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
