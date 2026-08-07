import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
    const reports = await prisma.diagnosticReport.findMany({
        select: { id: true, brand: true, model: true, code: true, full_analysis_markdown: true }
    });

    let count = 0;
    for (const r of reports) {
        if (!r.full_analysis_markdown) continue;
        const lines = r.full_analysis_markdown.split('\n');
        for (const line of lines) {
            const matches = line.match(/\*\*/g);
            if (matches && matches.length % 2 !== 0) {
                console.log(`FOUND IN ${r.brand} ${r.model} ${r.code}:`, line.trim());
                count++;
            }
        }
    }
    console.log(`Total odd ** lines: ${count}`);
    process.exit(0);
}
test();
