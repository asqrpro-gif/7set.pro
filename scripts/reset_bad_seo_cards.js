import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORT_FILE = path.join(__dirname, 'bad_cards_report.json');
const META_REPORT_FILE = path.join(__dirname, 'bad_seo_meta.json');

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Сброс статуса плохих карточек для повторного обогащения...');
  
  let idsToReset = new Set();
  
  // 1. Читаем bad_cards_report.json (обрывы генерации, шаблоны)
  try {
    const data = await fs.readFile(REPORT_FILE, 'utf-8');
    const cards = JSON.parse(data);
    cards.forEach(c => idsToReset.add(c.id));
    console.log(`Прочитано ${cards.length} карточек из bad_cards_report.json`);
  } catch (err) {
    console.log('Файл bad_cards_report.json не найден или пуст.');
  }

  // 2. Читаем bad_seo_meta.json (проблемные заголовки и описания)
  try {
    const data = await fs.readFile(META_REPORT_FILE, 'utf-8');
    const { problematicTitles, problematicDescriptions } = JSON.parse(data);
    
    if (problematicTitles) {
      problematicTitles.forEach(c => idsToReset.add(c.id));
      console.log(`Прочитано ${problematicTitles.length} карточек из SEO-заголовков.`);
    }
    if (problematicDescriptions) {
      problematicDescriptions.forEach(c => idsToReset.add(c.id));
      console.log(`Прочитано ${problematicDescriptions.length} карточек из SEO-описаний.`);
    }
  } catch (err) {
    console.log('Файл bad_seo_meta.json не найден или пуст.');
  }

  const idsArray = Array.from(idsToReset);
  
  if (idsArray.length === 0) {
    console.log('✅ Нет карточек для сброса.');
    await prisma.$disconnect();
    return;
  }
  
  console.log(`Всего уникальных карточек для сброса: ${idsArray.length}`);
  
  // Сбрасываем seoRisk на DANGER, чтобы enrich_seo_batch.js снова их захватил
  const result = await prisma.diagnosticReport.updateMany({
    where: { id: { in: idsArray } },
    data: { seoRisk: 'DANGER' }
  });
  
  console.log(`✅ Успешно обновлено ${result.count} карточек в базе данных.`);
  console.log('Теперь скрипт enrich_seo_batch.js автоматически подхватит их при следующем запуске.');
  
  await prisma.$disconnect();
}

main().catch(console.error);
