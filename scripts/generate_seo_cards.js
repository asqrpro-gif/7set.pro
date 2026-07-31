import 'dotenv/config'; // Обязательно загружаем переменные окружения, чтобы скрипт видел GEMINI_API_KEY и DATABASE_URL
import { PrismaClient } from '@prisma/client';
// Импортируем готовые функции для обращения к ИИ из вашего файла lib
import { analyzeCarErrorFast, analyzeCarErrorDeep } from '../lib/gemini_clean.js';

const prisma = new PrismaClient();

// 1. ИСТОЧНИК ДАННЫХ
// Массив целевых автомобилей для генерации карточек
const TARGET_CARS = [
  { brand: 'Chevrolet', model: 'Cobalt' },
  { brand: 'Hyundai', model: 'Tucson' },
  { brand: 'Kia', model: 'Sportage' },
  { brand: 'Hyundai', model: 'Elantra' },
  { brand: 'Chery', model: 'Tiggo 2' },
  { brand: 'Haval', model: 'M6' },
  { brand: 'Chery', model: 'Tiggo 7 Pro' },
  { brand: 'Jac', model: 'J7' },
  { brand: 'Hyundai', model: 'Santa Fe' },
  { brand: 'Kia', model: 'Sorento' }
];

// Массив из 100 популярных кодов ошибок для массовой генерации
const POPULAR_ERRORS = [
  'P0100', 'P0101', 'P0102', 'P0103', 'P0106', 'P0113', 'P0115', 'P0117', 'P0118', 'P0121',
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

// Вспомогательная функция для создания пауз (sleep). Возвращает Promise, который резолвится через заданное количество мс.
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Вспомогательная функция для генерации случайного целого числа в заданном диапазоне (min-max)
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 4. ОТЛОЖЕННАЯ ПУБЛИКАЦИЯ
// Функция для расчета даты отложенной публикации (с учетом рабочего времени редакции)
async function getNextPublishDate() {
  // Находим самую последнюю дату создания (created_at) карточки в базе
  const latestReport = await prisma.diagnosticReport.findFirst({
    orderBy: { created_at: 'desc' },
    select: { created_at: true }
  });

  // Если в БД есть записи, берем самую позднюю дату, иначе — текущее время
  let nextDate = latestReport?.created_at ? new Date(latestReport.created_at) : new Date();
  
  // Если последняя запись была создана в прошлом, берем текущее время как отправную точку
  if (nextDate < new Date()) {
    nextDate = new Date();
  }

  // Прибавляем к найденному времени случайное количество минут от 15 до 35
  const minutesToAdd = getRandomInt(15, 35);
  nextDate.setMinutes(nextDate.getMinutes() + minutesToAdd);

  // Проверяем, в какой час попадает рассчитанное время
  const hour = nextDate.getHours();
  // Если время попадает в нерабочий диапазон (>= 22 или < 8)
  if (hour >= 22 || hour < 8) {
    // Если время вечернее (после 22), переносим дату на следующий день
    if (hour >= 22) {
      nextDate.setDate(nextDate.getDate() + 1);
    }
    // Устанавливаем время строго на 08:00 утра
    nextDate.setHours(8, 0, 0, 0);
    
    // Чтобы публикации не выходили ровно в 8:00:00, добавляем случайные 5-25 минут
    const morningOffset = getRandomInt(5, 25);
    nextDate.setMinutes(nextDate.getMinutes() + morningOffset);
  }

  return nextDate;
}

async function main() {
  console.log('🚀 Запуск массовой генерации SEO-карточек...');

  // Перебираем каждый автомобиль из массива
  for (const car of TARGET_CARS) {
    // Для каждого автомобиля перебираем все коды ошибок
    for (const code of POPULAR_ERRORS) {
      
      // 2. РАБОЧИЙ ГРАФИК СКРИПТА (НОЧНАЯ СМЕНА)
      // Бесконечный цикл, чтобы проверять время. Выйдет из цикла, только если наступит "ночь"
      while (true) {
        const currentHour = new Date().getHours();
        // Дневное время (с 10:00 до 17:59). Скрипт отдыхает.
        if (currentHour >= 10 && currentHour < 18) {
          console.log(`[${new Date().toLocaleTimeString()}] Наступил день. Ухожу в спячку до 18:00`);
          // Засыпаем на 30 минут, после чего проверяем время снова
          await sleep(30 * 60 * 1000); 
        } else {
          // Время подходящее (>= 18 или < 10), выходим из цикла сна и идем дальше
          break; 
        }
      }

      // 3. ПРОВЕРКА НА ДУБЛИКАТ
      // Ищем в БД запись с такой же маркой, моделью и кодом ошибки
      const existingReport = await prisma.diagnosticReport.findFirst({
        where: { brand: car.brand, model: car.model, code: code }
      });

      // Если карточка найдена, пропускаем её генерацию
      if (existingReport) {
        console.log(`⏩ Пропуск: ${car.brand} ${car.model} ${code} уже существует.`);
        continue;
      }

      console.log(`\n⏳ Генерация карточки: ${car.brand} ${car.model} ошибка ${code}...`);
      
      // 5. ОБРАБОТКА ОШИБОК (try/catch блок)
      try {
        // Шаг 1: Запрашиваем быструю генерацию (seo, summary, drivability)
        const fastData = await analyzeCarErrorFast(car.brand, car.model, code, '');
        
        // Шаг 2: Сразу запрашиваем глубокую генерацию (markdown, цены, инструкции)
        const deepData = await analyzeCarErrorDeep(car.brand, car.model, code, '');

        // Шаг 3: Высчитываем дату отложенной публикации
        const publishDate = await getNextPublishDate();

        // Защита поля drivability на основе разрешенных значений, чтобы база не выдала ошибку
        let safeDrivability = fastData.drivability;
        if (!['safe', 'caution', 'tow'].includes(safeDrivability)) {
          if (fastData.severity === 'low') safeDrivability = 'safe';
          else if (fastData.severity === 'critical') safeDrivability = 'tow';
          else safeDrivability = 'caution';
        }

        // Шаг 4: Сохраняем итоговую карточку в базу данных, заполняя все поля
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
            is_complete: true, // Помечаем, что это полностью готовая карточка
            
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
            
            // Используем поле created_at для отложенной публикации
            created_at: publishDate
          }
        });

        console.log(`✅ Сохранено: ${car.brand} ${car.model} ${code}. Дата публикации: ${publishDate.toLocaleString()}`);
        console.log(`💤 Успешная генерация. Пауза 1 минута перед следующим кодом для обхода лимитов API...`);
        
        // 3. ПАУЗА ПОСЛЕ УСПЕХА
        // Пауза ровно 1 минуту (60 000 мс)
        await sleep(60000);

      } catch (error) {
        // Если API отвалилось или произошла другая ошибка — ловим её здесь
        console.error(`❌ Ошибка при генерации ${car.brand} ${car.model} ${code}:`, error.message);
        console.log('💤 Ожидание 2 минуты перед следующей попыткой из-за ошибки...');
        // Делаем штрафную паузу в 2 минуты (120 000 мс) перед продолжением
        await sleep(120000);
      }
    }
  }

  console.log('\n🎉 Все целевые автомобили и ошибки успешно обработаны!');
  // Обязательно отключаем клиент базы данных
  await prisma.$disconnect();
  // Корректно завершаем процесс скрипта
  process.exit(0);
}

// Запускаем основную логику скрипта
main();

/**
 * КОМАНДА ДЛЯ ЗАПУСКА ЭТОГО СКРИПТА В ТЕРМИНАЛЕ:
 * 
 * node scripts/generate_seo_cards.js
 * 
 */
