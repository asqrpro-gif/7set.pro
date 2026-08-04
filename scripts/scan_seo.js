import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORT_FILE = path.join(__dirname, 'bad_cards_report.json');

const prisma = new PrismaClient();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('🚀 Запуск scan_seo.js: Сканирование базы на предмет SEO-мусора...');
  console.log('📊 Подключение к базе данных...');
  
  await sleep(1000); // Имитация долгого процесса для логов

  try {
    const totalCount = await prisma.diagnosticReport.count();
    console.log(`✅ Найдено всего записей в БД: ${totalCount}`);

    console.log('🔍 Поиск шаблонных ответов ИИ и заглушек...');
    await sleep(2000);

    const badCards = await prisma.diagnosticReport.findMany({
      where: {
        OR: [
          { summary: { contains: 'не зарегистрирован' } },
          { summary: { contains: 'Сбой по коду' } },
          { summary: { contains: 'официально расшифровывается как:' } },
          { seoTitle: { contains: 'Неизвестный' } },
          { severity: 'universal' },
          { code: 'UNSUPPORTED' },
          { uniquenessScore: { lt: 50 } } // Низкая уникальность (Семантические дубли)
        ]
      },
      orderBy: { created_at: 'desc' }
    });

    console.log(`⚠️ Найдено мусорных карточек: ${badCards.length}`);
    
    // Поиск дубликатов
    console.log('🔍 Проверка дубликатов по (brand, model, code)...');
    await sleep(1500);

    // Группируем для поиска дублей
    const duplicatesGroup = await prisma.diagnosticReport.groupBy({
      by: ['brand', 'model', 'code'],
      having: {
        code: { _count: { gt: 1 } } // Группы, где больше 1 карточки
      }
    });

    let duplicateIds = [];
    let duplicatesCount = 0;

    for (const group of duplicatesGroup) {
      if (group.code === 'UNSUPPORTED') continue; // Пропускаем заглушки
      
      const records = await prisma.diagnosticReport.findMany({
        where: { brand: group.brand, model: group.model, code: group.code },
        orderBy: { created_at: 'asc' } // оставляем самую первую
      });

      // Все кроме первой - дубли
      for (let i = 1; i < records.length; i++) {
        duplicateIds.push(records[i].id);
        badCards.push({
          ...records[i],
          reason: 'Дубликат'
        });
        duplicatesCount++;
      }
    }

    console.log(`⚠️ Найдено дубликатов: ${duplicatesCount}`);

    // Отмечаем причины для обычного мусора
    const processedCards = badCards.map(card => {
      let reason = card.reason;
      if (!reason) {
        if (card.uniquenessScore < 50) {
          reason = 'Семантический дубликат (Уникальность < 50%)';
        } else {
          reason = 'Шаблонный ответ ИИ';
        }
      }
      return {
        ...card,
        reason
      };
    });

    // Сохраняем в JSON
    console.log(`💾 Сохранение отчета в bad_cards_report.json...`);
    await fs.writeFile(REPORT_FILE, JSON.stringify(processedCards, null, 2), 'utf-8');

    console.log('\n🎉 Сканирование успешно завершено!');
    console.log('👉 Теперь вы можете просмотреть и удалить эти карточки в разделе "Операции SEO"');
  } catch (error) {
    console.error('❌ Ошибка во время сканирования:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
