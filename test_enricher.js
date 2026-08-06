import { PrismaClient } from '@prisma/client';
import { enrichReportText } from './lib/seoEnricher.js';

const prisma = new PrismaClient();

async function main() {
  const report = await prisma.diagnosticReport.findFirst({
    where: { full_analysis_markdown: { contains: 'Глоссарий терминов' } },
    select: { id: true, brand: true, model: true, code: true, drivability: true, full_analysis_markdown: true }
  });
  
  if (report) {
    const rawText = report.full_analysis_markdown;
    console.log('Original length:', rawText.length);
    const newText = enrichReportText(rawText, report.brand, report.model, report.code, report.drivability);
    console.log('New length:', newText.length);
    
    // Check if newText has multiple glossaries
    const count = (newText.match(/Глоссарий терминов/gi) || []).length;
    console.log('Glossaries found in new text:', count);
  }
}

main().finally(() => prisma.$disconnect());
