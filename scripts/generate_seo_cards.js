import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { analyzeCarErrorFast, analyzeCarErrorDeep, getFactFromDB } from '../lib/gemini_clean.js';

const prisma = new PrismaClient();

// ==========================================
// 1. ИСТОЧНИК ДАННЫХ (Целевые машины и коды)
// ==========================================

const TARGET_CARS = [
  { brand: 'Chevrolet', model: 'Cobalt' },
  { brand: 'Hyundai', model: 'Tucson' },
  { brand: 'Kia', model: 'Sportage' },
  { brand: 'Hyundai', model: 'Elantra' },
  { brand: 'Toyota', model: 'Camry' },     // Новинка
  { brand: 'Toyota', model: 'Corolla' },   // Новинка
  { brand: 'Toyota', model: 'RAV4' },      // Новинка
  { brand: 'Volkswagen', model: 'Polo' },  // Новинка (суперпопулярна в СНГ)     
  { brand: 'Hyundai', model: 'Santa Fe' },
  { brand: 'Kia', model: 'Sorento' }
];

// Массив на 121 код (Дает 1210 комбинаций. После фильтров выйдет ~1000-1100 чистых карточек)
const POPULAR_ERRORS = [
  'P0008', 'P0010', 'P0011', 'P0012', 'P0013', 'P0014', 'P0016', 'P0017', 'P0030', 'P0031',
  'P0032', 'P0050', 'P0053', 'P0100', 'P0101', 'P0102', 'P0103', 'P0104', 'P0105', 'P0106',
  'P0107', 'P0108', 'P0112', 'P0113', 'P0114', 'P0115', 'P0116', 'P0117', 'P0118', 'P0121',
  'P0122', 'P0123', 'P0128', 'P0130', 'P0131', 'P0132', 'P0133', 'P0134', 'P0135', 'P0136',
  'P0137', 'P0138', 'P0141', 'P0155', 'P0171', 'P0172', 'P0174', 'P0175', 'P0191', 'P0193',
  'P0201', 'P0202', 'P0203', 'P0204', 'P0222', 'P0223', 'P0234', 'P0243', 'P0299', 'P0300',
  'P0301', 'P0302', 'P0303', 'P0304', 'P0305', 'P0306', 'P0325', 'P0335', 'P0336', 'P0340',
  'P0341', 'P0351', 'P0352', 'P0353', 'P0354', 'P0400', 'P0401', 'P0402', 'P0403', 'P0404',
  'P0420', 'P0430', 'P0440', 'P0441', 'P0442', 'P0443', 'P0446', 'P0455', 'P0456', 'P0463',
  'P0480', 'P0500', 'P0505', 'P0506', 'P0507', 'P0520', 'P0522', 'P0562', 'P0563', 'P0600',
  'P0601', 'P0700', 'P0705', 'P0715', 'P0720', 'P0730', 'P0741', 'P2101', 'P2111', 'P2112',
  'P2119', 'P2135', 'P2138', 'P2293', 'P2509', 'P2610', 'U0073', 'U0100', 'U0101', 'U0121', 'U0140'
];

// Вспомогательные функции
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) +
  min;

// ==========================================
// 2. УМНЫЙ РАСЧЕТ ДАТЫ ПУБЛИКАЦИИ
// ==========================================
async function getNextPublishDate() {
  const totalCount = await prisma.diagnosticReport.count();

  // Пул первых 350 карточек публикуется сразу без отложки
  if (totalCount < 350) {
    return new Date();
  }

  const latestReport = await prisma.diagnosticReport.findFirst({
    orderBy: { created_at: 'desc' },
    select: { created_at: true }
  });

  let nextDate = latestReport?.created_at ? new Date(latestReport.created_at) : new Date();

  if (nextDate < new Date()) {
    nextDate = new Date();
  }

  // Хаотичный интервал 12-28 минут (~3 публикации в час)
  const minutesToAdd = getRandomInt(12, 28);
  nextDate.setMinutes(nextDate.getMinutes() + minutesToAdd);

  const hour = nextDate.getHours();

  // Рабочее время редакции: с 08:00 до 20:00
  if (hour >= 20 || hour < 8) {
    if (hour >= 20) {
      nextDate.setDate(nextDate.getDate() + 1); // Перенос на завтра
    }
    nextDate.setHours(8, 0, 0, 0);

    // Утренняя хаотичность (первая статья выйдет с 08:03 до 08:24)
    const morningOffset = getRandomInt(3, 24);
    nextDate.setMinutes(nextDate.getMinutes() + morningOffset);
  }

  return nextDate;
}

// ==========================================
// 3. ОСНОВНОЙ КОНВЕЙЕР ГЕНЕРАЦИИ
// ==========================================
async function main() {
  console.log('🚀 Запуск автономного SEO-конвейера (отложенная публикация)...');

  let dailyGeneratedCount = 0;
  let currentDay = new Date().getDate();

  for (const car of TARGET_CARS) {
    for (const code of POPULAR_ERRORS) {

      // Лимит генерации: не более 120 успешных карточек в сутки
      if (dailyGeneratedCount >= 120) {
        console.log(`\n🛑 Достигнут суточный лимит (120 карточек). Засыпаем до наступления новых суток...`);
        while (new Date().getDate() === currentDay) {
          await sleep(10 * 60 * 1000); // проверяем каждые 10 минут
        }
        currentDay = new Date().getDate();
        dailyGeneratedCount = 0;
        console.log(`\n🌅 Наступили новые сутки! Продолжаем генерацию...`);
      }

      // ФИЛЬТР 1: Предварительная проверка кода на подлинность OBD-II
      const obdRegex = /^[PBUC][0-9A-F]{4}$/i;
      const baseDescription = getFactFromDB(code);

      if (!obdRegex.test(code) || !baseDescription) {
        console.log(`[ПРОПУСК] Код ${code} не прошел первичную валидацию.`);
        continue;
      }

      // ПРОВЕРКА НА ДУБЛИКАТ В БД
      const existingReport = await prisma.diagnosticReport.findFirst({
        where: { brand: car.brand, model: car.model, code: code }
      });

      if (existingReport) {
        console.log(`⏩ Пропуск: ${car.brand} ${car.model} ${code} уже в базе.`);
        continue;
      }

      console.log(`\n⏳ Генерация карточки: ${car.brand} ${car.model} ошибка ${code}...`);

      try {
        // Шаг 1: Быстрая генерация
        const fastData = await analyzeCarErrorFast(car.brand, car.model, code, '');

        // ФИЛЬТР 2: Детектор мусора от ИИ (проверка, применим ли код к этой машине)
        const summaryText = fastData.summary || '';
        const isUnsupportedByAI =
          summaryText.includes('не зарегистрирован') ||
          summaryText.includes('Сбой по коду') ||
          summaryText.toLowerCase().includes('не существует') ||
          (fastData.seoTitle || '').includes('Неизвестный') ||
          fastData.severity === 'universal';

        if (isUnsupportedByAI) {
          console.log(`⛔ [ОТКАЗ ИИ] Ошибка ${code} не встречается на ${car.brand} ${car.model}. Брак отсеян.`);
          continue;
        }

        // Шаг 2: Глубокая генерация (если фильтры пройдены)
        const deepData = await analyzeCarErrorDeep(car.brand, car.model, code, '');
        const publishDate = await getNextPublishDate();

        // Защита поля drivability
        let safeDrivability = fastData.drivability;
        if (!['safe', 'caution', 'tow'].includes(safeDrivability)) {
          if (fastData.severity === 'low') safeDrivability = 'safe';
          else if (fastData.severity === 'critical') safeDrivability = 'tow';
          else safeDrivability = 'caution';
        }

        // Шаг 3: Сохранение чистового варианта в базу
        await prisma.diagnosticReport.create({
          data: {
            brand: car.brand,
            model: car.model,
            code: code,
            severity: fastData.severity,
            summary: fastData.summary,
            teaser_text: fastData.teaser_text,
            drivability: safeDrivability,
            seoTitle: fastData.seoTitle,
            seoDescription: fastData.seoDescription,
            is_paid: false,
            is_complete: true,

            full_analysis_markdown: deepData.full_analysis_markdown,
            sto_protection_tips: deepData.sto_protection_tips,
            diy_instructions: deepData.diy_instructions,
            price_parts: deepData.price_parts,
            price_labor: deepData.price_labor,
            diy_difficulty_text: deepData.diy_difficulty_text,
            diy_difficulty_score: deepData.diy_difficulty_score,
            diy_time: deepData.diy_time,
            diy_tools: deepData.diy_tools,
            popular_engine_codes: deepData.popular_engine_codes || [],
            related_obd_codes: deepData.related_obd_codes || [],

            created_at: publishDate
          }
        });

        console.log(`✅ Сохранено: ${car.brand} ${car.model} ${code}`);
        console.log(`📅 В очереди на: ${publishDate.toLocaleString()}`);
        console.log(`💤 Остываем 2 минуты...`);

        dailyGeneratedCount++; // Увеличиваем счетчик успешных генераций

        // Интервал генерации — ровно 2 минуты (120 000 мс)
        await sleep(120000);

      } catch (error) {
        console.error(`❌ Сбой API для ${car.brand} ${car.model} ${code}:`, error.message);
        console.log('💤 Штрафная пауза 2 минуты перед новой попыткой...');
        await sleep(120000);
      }
    }
  }

  console.log('\n🎉 Конвейер завершил работу! База заполнена.');
  await prisma.$disconnect();
  process.exit(0);
}

main();