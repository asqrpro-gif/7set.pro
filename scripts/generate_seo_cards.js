import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { analyzeCarErrorFast, analyzeCarErrorDeep, getFactFromDB } from '../lib/gemini_clean.js';
import { calculateSeoScore } from '../lib/seo_scanner.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, 'generation_state.json');

const prisma = new PrismaClient();

async function getDailyState() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return { date: parsed.date, count: parsed.count || 0, regeneratedCount: parsed.regeneratedCount || 0 };
  } catch {
    return { date: new Date().toDateString(), count: 0, regeneratedCount: 0 };
  }
}

async function saveDailyState(dateString, count, regeneratedCount = 0) {
  await fs.writeFile(STATE_FILE, JSON.stringify({ date: dateString, count, regeneratedCount }), 'utf-8');
}

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

  let state = await getDailyState();
  let currentDayStr = new Date().toDateString();
  
  if (state.date !== currentDayStr) {
    state = { date: currentDayStr, count: 0, regeneratedCount: 0 };
    await saveDailyState(currentDayStr, 0, 0);
  }
  let dailyGeneratedCount = state.count || 0;
  let dailyRegeneratedCount = state.regeneratedCount || 0;

  let carIndex = 0;
  let codeIndex = 0;

  while (carIndex < TARGET_CARS.length) {
    // Ограничение по времени генерации (от 00:00 до 05:00)
    let loggedWait = false;
    while (new Date().getHours() >= 5) {
      if (!loggedWait) {
        console.log(`\n⏳ Время генерации вышло (сейчас ${new Date().getHours()} ч.). Работаем только с 00:00 до 05:00. Ждем...`);
        loggedWait = true;
      }
      await sleep(10 * 60 * 1000); // Спим 10 минут и проверяем снова
    }
    if (loggedWait) {
      console.log(`\n🌌 Наступило разрешенное время (00:00 - 05:00)! Возобновляем работу...`);
    }

    const todayStr = new Date().toDateString();
    if (todayStr !== currentDayStr) {
      currentDayStr = todayStr;
      dailyGeneratedCount = 0;
      dailyRegeneratedCount = 0;
      await saveDailyState(currentDayStr, dailyGeneratedCount, dailyRegeneratedCount);
      console.log(`\n🌅 Наступили новые сутки в процессе работы! Сброс счетчика.`);
    }

    // ЛИМИТ ГЕНЕРАЦИИ: 26 (24 новых + 2 на ремонт)
    if (dailyGeneratedCount + dailyRegeneratedCount >= 26) {
      console.log(`\n🛑 Достигнут суточный лимит (26 карточек суммарно). Засыпаем до наступления новых суток...`);
      while (new Date().toDateString() === currentDayStr) {
        await sleep(10 * 60 * 1000); // проверяем каждые 10 минут
      }
      currentDayStr = new Date().toDateString();
      dailyGeneratedCount = 0;
      dailyRegeneratedCount = 0;
      await saveDailyState(currentDayStr, dailyGeneratedCount, dailyRegeneratedCount);
      console.log(`\n🌅 Наступили новые сутки! Продолжаем работу...`);
    }

    // 1. ПРИОРИТЕТ: ПОИСК БРАКА (-1)
    const failedReport = await prisma.diagnosticReport.findFirst({
      where: { seoScore: -1 }
    });

    let brand, model, code, isRegenerating, idToRepair;

    if (failedReport) {
      brand = failedReport.brand;
      model = failedReport.model;
      code = failedReport.code;
      isRegenerating = true;
      idToRepair = failedReport.id;
      console.log(`🔄 [АВТО-ВОССТАНОВЛЕНИЕ] Приоритетный ремонт брака: ${brand} ${model} ${code} (seoScore = -1)`);
    } else {
      // 2. ИНАЧЕ БЕРЕМ СТАНДАРТНУЮ КОМБИНАЦИЮ ИЗ СПИСКА
      if (dailyGeneratedCount >= 24) {
         console.log(`\n🛑 Лимит новых карточек (24) исчерпан, а брака для ремонта нет. Спим 10 минут...`);
         await sleep(10 * 60 * 1000);
         continue; // начнем цикл сначала, вдруг появится брак или сменятся сутки
      }

      const car = TARGET_CARS[carIndex];
      brand = car.brand;
      model = car.model;
      code = POPULAR_ERRORS[codeIndex];
      isRegenerating = false;

      // Сдвигаем индексы для следующего раза
      codeIndex++;
      if (codeIndex >= POPULAR_ERRORS.length) {
        codeIndex = 0;
        carIndex++;
      }
    }

    // ФИЛЬТР 1: Предварительная проверка кода
    const obdRegex = /^[PBUC][0-9A-F]{4}$/i;
    const baseDescription = getFactFromDB(code);

    if (!obdRegex.test(code) || !baseDescription) {
      console.log(`[ПРОПУСК] Код ${code} не прошел первичную валидацию.`);
      continue;
    }

    if (isRegenerating) {
      await prisma.diagnosticReport.delete({ where: { id: idToRepair } }).catch(()=>{});
    } else {
      // ПРОВЕРКА НА ДУБЛИКАТ В БД ДЛЯ НОВЫХ КАРТОЧЕК
      const existingReport = await prisma.diagnosticReport.findFirst({
        where: { brand, model, code }
      });
      if (existingReport) {
        console.log(`⏩ Пропуск: ${brand} ${model} ${code} уже в базе.`);
        continue;
      }
    }

    console.log(`\n⏳ Генерация карточки: ${brand} ${model} ошибка ${code}...`);

    try {
      // Шаг 1: Быстрая генерация
      const fastData = await analyzeCarErrorFast(brand, model, code, '');

      const summaryText = fastData.summary || '';
      const isUnsupportedByAI =
        summaryText.includes('не зарегистрирован') ||
        summaryText.includes('Сбой по коду') ||
        summaryText.toLowerCase().includes('не существует') ||
        (fastData.seoTitle || '').includes('Неизвестный') ||
        fastData.severity === 'universal';

      if (isUnsupportedByAI) {
        console.log(`⛔ [ОТКАЗ ИИ] Ошибка ${code} не встречается на ${brand} ${model}. Брак отсеян.`);
        continue;
      }

      // Шаг 2: Глубокая генерация
      const deepData = await analyzeCarErrorDeep(brand, model, code, '');
      const publishDate = await getNextPublishDate();

      let safeDrivability = fastData.drivability;
      if (!['safe', 'caution', 'tow'].includes(safeDrivability)) {
        if (fastData.severity === 'low') safeDrivability = 'safe';
        else if (fastData.severity === 'critical') safeDrivability = 'tow';
        else safeDrivability = 'caution';
      }

      const doubleCheck = await prisma.diagnosticReport.findFirst({
        where: { brand, model, code }
      });
      if (doubleCheck) {
        console.log(`⚠️ Внимание! Пока ИИ думал, карточка ${brand} ${model} ${code} уже была создана. Отменяем дубликат.`);
        continue;
      }

      const newReport = await prisma.diagnosticReport.create({
        data: {
          brand, model, code,
          severity: fastData.severity, summary: fastData.summary, teaser_text: fastData.teaser_text,
          drivability: safeDrivability, seoTitle: deepData.seo_title || fastData.seoTitle,
          seoDescription: deepData.seo_description || fastData.seoDescription,
          is_paid: false, is_complete: true,
          full_analysis_markdown: deepData.full_analysis_markdown, sto_protection_tips: deepData.sto_protection_tips,
          diy_instructions: deepData.diy_instructions, price_parts: deepData.price_parts,
          price_labor: deepData.price_labor, diy_difficulty_text: deepData.diy_difficulty_text,
          diy_difficulty_score: deepData.diy_difficulty_score, diy_time: deepData.diy_time,
          diy_tools: deepData.diy_tools, tools_table_md: deepData.tools_table_md,
          oem_parts_table_md: deepData.oem_parts_table_md, pro_tips_md: deepData.pro_tips_md,
          popular_engine_codes: deepData.popular_engine_codes || [],
          related_obd_codes: deepData.related_obd_codes || [],
          created_at: publishDate
        }
      });

      const { score, risk, uniquenessScore } = await calculateSeoScore(newReport, prisma);
      await prisma.diagnosticReport.update({
        where: { id: newReport.id },
        data: { seoScore: score, seoRisk: risk, uniquenessScore }
      });

      console.log(`✅ Сохранено и отсканировано: ${brand} ${model} ${code} (SEO Score: ${score}, Уникальность: ${uniquenessScore}%)`);
      console.log(`📅 В очереди на: ${publishDate.toLocaleString()}`);

      if (isRegenerating) {
        dailyRegeneratedCount++;
      } else {
        dailyGeneratedCount++;
      }
      await saveDailyState(currentDayStr, dailyGeneratedCount, dailyRegeneratedCount);

      if ((dailyGeneratedCount + dailyRegeneratedCount) % 6 === 0) {
        console.log(`💤 Сгенерировано 6 карточек. Уходим на длинную паузу 30 минут...`);
        await sleep(30 * 60 * 1000);
      } else {
        console.log(`💤 Остываем 5 минут...`);
        await sleep(5 * 60 * 1000);
      }

    } catch (error) {
      console.error(`❌ Сбой API для ${brand} ${model} ${code}:`, error.message);
      console.log('💤 Штрафная пауза 5 минут перед новой попыткой...');
      await sleep(300000);
    }
  }

  console.log('\n🎉 Конвейер завершил работу! База заполнена.');
  await prisma.$disconnect();
  process.exit(0);
}

main();