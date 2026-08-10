import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORT_FILE = path.join(__dirname, 'bad_cards_report.json');
const META_REPORT_FILE = path.join(__dirname, 'bad_seo_meta.json');

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

    console.log('🔍 Поиск пустых бесплатных блоков (summary/teaser) и обрывов генерации...');
    await sleep(2000);

    const allCards = await prisma.diagnosticReport.findMany({
      select: {
        id: true, code: true, brand: true, model: true,
        summary: true, teaser_text: true, full_analysis_markdown: true, diy_instructions: true,
        seoTitle: true, seoDescription: true,
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

      // 3. Отсутствие бесплатного блока (summary или teaser_text пустые или содержат только мусор)
      const cleanSummary = card.summary ? card.summary.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim() : '';
      const cleanTeaser = card.teaser_text ? card.teaser_text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim() : '';

      if (!cleanSummary || cleanSummary === 'null' || cleanSummary === 'undefined' || cleanSummary === '-' ||
          !cleanTeaser || cleanTeaser === 'null' || cleanTeaser === 'undefined' || cleanTeaser === '-') {
        isBroken = true;
        reason = 'Отсутствует или сломан бесплатный контент (summary/teaser)';
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

    // -------------------------------------------------------------
    // АНАЛИЗ SEO ЗАГОЛОВКОВ И ОПИСАНИЙ (Длины и дубликаты шаблонов)
    // -------------------------------------------------------------
    console.log('🔍 Проверка длин и дубликатов шаблонов SEO-мета...');
    let problematicTitles = [];
    let problematicDescriptions = [];
    
    const titleMap = {};
    const descMap = {};

    allCards.forEach(r => {
        const codeLower = r.code.toLowerCase();
        const brandLower = r.brand.toLowerCase();
        const modelLower = r.model.toLowerCase();

        // Обработка SEO-заголовков
        if (r.seoTitle) {
            let titleTpl = r.seoTitle.toLowerCase();
            const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            titleTpl = titleTpl.replace(new RegExp(escapeRegExp(codeLower), 'g'), '[code]');
            titleTpl = titleTpl.replace(new RegExp(escapeRegExp(brandLower), 'g'), '[brand]');
            titleTpl = titleTpl.replace(new RegExp(escapeRegExp(modelLower), 'g'), '[model]');
            titleTpl = titleTpl.replace(/\s+/g, ' ').trim();

            if (!titleMap[titleTpl]) titleMap[titleTpl] = [];
            titleMap[titleTpl].push(r);
            
            // Проверка длины заголовка
            const titleLen = r.seoTitle.trim().length;
            if (titleLen < 30 || titleLen > 75) {
                problematicTitles.push(r);
            }
        }

        // Обработка SEO-описаний
        if (r.seoDescription) {
            let descTpl = r.seoDescription.toLowerCase();
            const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            descTpl = descTpl.replace(new RegExp(escapeRegExp(codeLower), 'g'), '[code]');
            descTpl = descTpl.replace(new RegExp(escapeRegExp(brandLower), 'g'), '[brand]');
            descTpl = descTpl.replace(new RegExp(escapeRegExp(modelLower), 'g'), '[model]');
            descTpl = descTpl.replace(/\s+/g, ' ').trim();

            if (!descMap[descTpl]) descMap[descTpl] = [];
            descMap[descTpl].push(r);
            
            // Проверка длины описания
            const descLen = r.seoDescription.trim().length;
            if (descLen < 140 || descLen > 160) {
                problematicDescriptions.push(r);
            }
        }
    });
    
    // Поиск дублей заголовков
    for (const tpl in titleMap) {
        if (titleMap[tpl].length > 1) {
            problematicTitles.push(...titleMap[tpl]);
        }
    }
    
    // Поиск дублей описаний
    for (const tpl in descMap) {
        if (descMap[tpl].length > 1) {
            problematicDescriptions.push(...descMap[tpl]);
        }
    }

    // Убираем дубли, если карточка попала дважды (и по длине, и по дублю шаблона)
    // Так как Set работает по ссылкам на объекты, используем фильтрацию по ID
    const uniqueTitlesMap = new Map();
    problematicTitles.forEach(t => uniqueTitlesMap.set(t.id, t));
    problematicTitles = Array.from(uniqueTitlesMap.values());

    const uniqueDescMap = new Map();
    problematicDescriptions.forEach(t => uniqueDescMap.set(t.id, t));
    problematicDescriptions = Array.from(uniqueDescMap.values());

    console.log(`⚠️ Найдено проблемных SEO-заголовков: ${problematicTitles.length}`);
    console.log(`⚠️ Найдено проблемных SEO-описаний: ${problematicDescriptions.length}`);
    
    console.log(`💾 Сохранение отчета в bad_seo_meta.json...`);
    await fs.writeFile(META_REPORT_FILE, JSON.stringify({ problematicTitles, problematicDescriptions }, null, 2), 'utf-8');


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
