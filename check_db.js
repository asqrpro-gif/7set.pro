import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const reports = await prisma.diagnosticReport.findMany({
    where: {
      OR: [
        { summary: { contains: 'car.7set.pro' } },
        { teaser_text: { contains: 'car.7set.pro' } },
        { full_analysis_markdown: { contains: 'car.7set.pro' } },
        { free_diagnosis: { contains: 'car.7set.pro' } },
        { sto_protection_tips: { contains: 'car.7set.pro' } },
        { diy_instructions: { contains: 'car.7set.pro' } }
      ]
    }
  });
  
  if (reports.length > 0) {
    console.log(`Found ${reports.length} records with 'car.7set.pro'. Updating...`);
    for (const report of reports) {
      await prisma.diagnosticReport.update({
        where: { id: report.id },
        data: {
          summary: report.summary ? report.summary.replace(/car\.7set\.pro/g, '7set.pro') : report.summary,
          teaser_text: report.teaser_text ? report.teaser_text.replace(/car\.7set\.pro/g, '7set.pro') : report.teaser_text,
          full_analysis_markdown: report.full_analysis_markdown ? report.full_analysis_markdown.replace(/car\.7set\.pro/g, '7set.pro') : report.full_analysis_markdown,
          free_diagnosis: report.free_diagnosis ? report.free_diagnosis.replace(/car\.7set\.pro/g, '7set.pro') : report.free_diagnosis,
          sto_protection_tips: report.sto_protection_tips ? report.sto_protection_tips.replace(/car\.7set\.pro/g, '7set.pro') : report.sto_protection_tips,
          diy_instructions: report.diy_instructions ? report.diy_instructions.replace(/car\.7set\.pro/g, '7set.pro') : report.diy_instructions,
        }
      });
    }
    console.log('Database updated successfully.');
  } else {
    console.log('No records found containing car.7set.pro in the database.');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
