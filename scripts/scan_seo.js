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
          { summary: { contains: 'информация по данному коду отсутствует' } },
          { summary: { contains: 'к сожалению, я не могу найти информацию' } },
          { seoTitle: { contains: 'Неизвестный' } },
          { severity: 'universal' },
          { code: 'UNSUPPORTED' },
          { uniquenessScore: { lt: 5 } } // Низкая уникальность (Семантические дубли)
        ]
      },
      orderBy: { created_at: 'desc' }
    });

    console.log(`⚠️ Найдено мусорных карточек (по шаблонам): ${badCards.length}`);

    console.log('🔍 Поиск обрывов генерации, висячих цифр и непереведенного текста...');
    await sleep(2000);

    const allCards = await prisma.diagnosticReport.findMany({
      select: {
        id: true, code: true, brand: true, model: true,
        summary: true, full_analysis_markdown: true, diy_instructions: true,
        created_at: true, uniquenessScore: true
      }
    });

    let brokenGenerationsCount = 0;
    
    // Множество ID уже найденных плохих карточек, чтобы не дублировать
    const badCardsIds = new Set(badCards.map(c => c.id));

    for (const card of allCards) {
      if (badCardsIds.has(card.id)) continue; // Уже в списке мусора

      const textToScan = [
        card.summary || '',
        card.full_analysis_markdown || '',
        card.diy_instructions || ''
      ].join('\n');

      let isBroken = false;
      let reason = '';

      // 1. Висячие цифры (обрыв списка: "1. ", "2." в конце текста или перед пустой строкой без продолжения)
      if (/(?:^|\n)\s*\d+\.\s*$/.test(textToScan)) {
        isBroken = true;
        reason = 'Обрыв генерации (висячая цифра списка)';
      }
      
      // 2. Незакрытые теги жирного шрифта (нечетное количество **)
      const starsCount = (textToScan.match(/\*\*/g) || []).length;
      if (starsCount % 2 !== 0) {
        isBroken = true;
        reason = 'Обрыв генерации (незакрытый тег **)';
      }

      // 3. Явный непереведенный текст (например, Injector Circuit Malfunction)
      if (/[a-zA-Z]{5,} [a-zA-Z]{5,}/.test(textToScan) && textToScan.includes('Circuit')) {
        // Упрощенная эвристика для непереведенных OBD кодов
        isBroken = true;
        reason = 'Непереведенный английский текст';
      }

      // 4. Обрыв на полуслове или отсутствие завершающего знака препинания в конце длинного текста
      // (Опционально, можно добавить, если нужно)

      if (isBroken) {
        badCards.push({
          ...card,
          reason
        });
        badCardsIds.add(card.id);
        brokenGenerationsCount++;
      }
    }

    console.log(`⚠️ Найдено карточек с обрывами генерации: ${brokenGenerationsCount}`);

    
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
        if (card.uniquenessScore !== null && card.uniquenessScore < 5) {
          reason = 'Семантический дубликат (Уникальность < 5%)';
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
