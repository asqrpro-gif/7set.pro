import { PrismaClient } from '@prisma/client';
import { calculateSeoScore } from './lib/seo_scanner.js';

const prisma = new PrismaClient();

async function test() {
    const reports = await prisma.diagnosticReport.findMany();
    console.log(`Found ${reports.length} reports in DB.`);
    if (reports.length > 0) {
        const report = reports[0];
        console.log(`Testing report ${report.id} (${report.brand} ${report.code})...`);
        const result = await calculateSeoScore(report, prisma);
        console.log(JSON.stringify(result, null, 2));
    }
}
test().catch(console.error).finally(() => prisma.$disconnect());
