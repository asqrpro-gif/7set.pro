import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const allCards = await prisma.diagnosticReport.findMany({
    select: { id: true, code: true, summary: true, full_analysis_markdown: true }
  });
  
  let count = 0;
  for (const card of allCards) {
    const text = (card.summary || '') + '\n' + (card.full_analysis_markdown || '');
    
    let isBad = false;
    let reason = '';
    
    // Pattern 1: ends with a number and dot or just hanging number
    if (/(?:^|\n)\s*\d+\.\s*$/.test(text)) {
        console.log(`Found hanging number in ${card.code} (${card.id})`);
        isBad = true;
        reason = 'Hanging number';
    }
    
    // Pattern 2: unmatched ** (very naive check: odd number of ** combinations in a block)
    const starsCount = (text.match(/\*\*/g) || []).length;
    if (starsCount % 2 !== 0) {
        console.log(`Found unmatched ** in ${card.code} (${card.id})`);
        isBad = true;
        reason = 'Unmatched **';
    }
    
    // Pattern 3: English text that should be Russian? "Injector Circuit Malfunction"
    if (/Injector Circuit/i.test(text) || /Circuit Malfunction/i.test(text)) {
        console.log(`Found English text in ${card.code} (${card.id})`);
        isBad = true;
        reason = 'English text';
    }
    
    if (isBad) count++;
  }
  
  console.log('Total bad found by regex:', count);
}
main().finally(() => prisma.$disconnect());
