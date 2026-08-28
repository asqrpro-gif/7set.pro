import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const reports = await prisma.diagnosticReport.findMany({
    where: {
      OR: [
        { full_analysis_markdown: { contains: 'ИИ синтезирует ответ' } },
        { driving_risks_md: { contains: 'ИИ синтезирует ответ' } },
        { diagnostic_data_md: { contains: 'ИИ синтезирует ответ' } },
        { pro_tips_md: { contains: 'ИИ синтезирует ответ' } },
        { tools_table_md: { contains: 'ИИ синтезирует ответ' } },
        { oem_parts_table_md: { contains: 'ИИ синтезирует ответ' } },
      ]
    },
    take: 5
  });

  console.log(`Found ${reports.length} reports with the text.`);
  for (const r of reports) {
    console.log(`--- Report ${r.brand} ${r.model} ${r.code} ---`);
    for (const field of ['full_analysis_markdown', 'driving_risks_md', 'diagnostic_data_md', 'pro_tips_md', 'tools_table_md', 'oem_parts_table_md']) {
      if (r[field] && r[field].includes('ИИ синтезирует ответ')) {
        const lines = r[field].split('\n');
        for (const line of lines) {
          if (line.includes('ИИ синтезирует ответ')) {
            console.log(`Field ${field}: ${line}`);
          }
        }
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
