import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { analyzeCarErrorFast, analyzeCarErrorDeep } from './lib/gemini_clean.js';
import { marked } from 'marked';
import fs from 'fs';
import garageRouter from './routes/garage.js';

const app = express();
const PORT = process.env.PORT || 3005;

// Инициализация Prisma Client
const prisma = new PrismaClient();

// Автоочистка глобального флага is_paid у рабочих отчетов в БД при старте (защита от утечки платного контента)
prisma.diagnosticReport.updateMany({
  where: {
    is_paid: true,
    code: { not: "UNSUPPORTED" }
  },
  data: {
    is_paid: false
  }
}).then(res => {
  if (res.count > 0) {
    console.log(`🛡️ [СБРОС ПЕЙВОЛЛА] Сброшен ошибочный глобальный флаг is_paid у ${res.count} отчетов в БД!`);
  }
}).catch(err => {
  console.error("Ошибка при сбросе пейволла в БД:", err.message);
});

// =====================================================
// 🟢 1. ГЛОБАЛЬНЫЙ РАДАР (ПЕРЕХВАТЧИК ВСЕХ ЗАПРОСОВ)
// =====================================================
app.use((req, res, next) => {
  console.log(`[РАДАР] Входящий запрос: ${req.method} ${req.url}`);
  next();
});

// =====================================================
// 🟢 2. РЕНТГЕН-МАРШРУТ (ИЗОЛИРОВАННЫЙ ТЕСТ)
// =====================================================
app.get('/ping', async (req, res) => {
  console.log('🚨 ПРЯМОЙ КОНТАКТ С /ping УСТАНОВЛЕН!');
  try {
    const count = await prisma.diagnosticReport.count();
    res.send(`<h1>✅ Бэкенд жив! Записей в БД: ${count}</h1>`);
  } catch (error) {
    res.send(`<h1>❌ Ошибка БД: ${error.message}</h1>`);
  }
});

// Статика и парсеры (ОБЯЗАТЕЛЬНО ПОСЛЕ РАДАРА)
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Устойчивый парсер куки разблокированных отчетов (работает с массивами, JSON-строками и URI-кодированием)
const parseUnlockedCookie = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const decoded = decodeURIComponent(val);
      const parsed = JSON.parse(decoded);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e2) {
        return val.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
  }
  return [];
};

// Вспомогательная функция для хирургического форматирования Markdown текста (восстановление заголовков h2/h3, списков и добавление иконок)
const formatReportMarkdown = (text) => {
  if (!text) return '';
  let str = text.replace(/\\n/g, '\n');
  // 0. Удаляем любые пустые строки с символами # без текста (причина появления пустых тегов h1/h2 в разметке)
  str = str.replace(/^[ \t]*#{1,6}[ \t]*$/gm, '');
  // 0.5. Преобразуем Setext заголовки (подчеркивания === или ---) и HTML теги h1-h6 в обычные ###
  str = str.replace(/^([^\n]+)\n[ \t]*[=-]{2,}[ \t]*$/gm, '### $1');
  str = str.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/ig, '### $1');
  // 1. Приводим все заголовки # (h1), ## (h2) или #### внутри отчета строго к h3 (###), так как основные секции (Полный разбор причины, Сделай сам) теперь являются h2
  str = str.replace(/^[ \t]*#{1,6}\s+(?=\S)/gm, '### ');
  // Гарантируем пустую строку перед заголовками ###
  str = str.replace(/([^\n])\s*(#{1,3}\s+)/g, '$1\n\n$2');
  // Гарантируем новую строку перед словами "Шаг 1", "Шаг 2", если они идут в середине текста (и не сразу после иконки или символа решетки/звездочки):
  str = str.replace(/([^\n>#*])\s+(#{0,3}\s*(?:<[^>]+>\s*)?(?:\*\*)?Шаг\s+\d+)/ig, '$1\n\n$2');
  // Общее правило для ЛЮБЫХ заголовков ### или ##, заканчивающихся на двоеточие или точку/тире (исключая точки в номерах вроде 1.): отделяем текст новой строкой
  str = str.replace(/(#{1,3}\s*(?:<[^>]+>|[^\n:.!?]){2,100}(?::|(?<!\d)[.!?]))\s+([А-ЯA-Z1-9«"'][^\n])/g, '$1\n\n$2');
  // Гарантируем, что после ключевых заголовков всегда идет перевод строки \n\n
  str = str.replace(/(Как не лохануться на СТО:?)\s*([^\n])/ig, '$1\n\n$2');
  str = str.replace(/(Специфика\s+[^\n:]{3,35}:?)\s+([А-ЯA-Z«"'][а-яa-z0-9])/g, '$1\n\n$2');
  str = str.replace(/(Основные[^:\n]+:)\s*([^\n])/ig, '$1\n\n$2');
  // Гарантируем новую строку перед нумерованными списками (1. 2. 3. 4.) и маркированными (-), НО НЕ внутри заголовков # и не после слова "Шаг"
  str = str.replace(/(?<!#[^\n]*)(?<!Шаг\s*)(?<!Step\s*)([^\n])\s+(\d+\.\s+\S)/ig, '$1\n\n$2');
  str = str.replace(/(?<!#[^\n]*)([^\n])\s+(-\s+\S)/g, '$1\n\n$2');
  // Прогоняем повторно для смежных пунктов списков (например, "1. ... 2. ...")
  str = str.replace(/(?<!#[^\n]*)(?<!Шаг\s*)(?<!Step\s*)([^\n])\s+(\d+\.\s+\S)/ig, '$1\n\n$2');
  str = str.replace(/(?<!#[^\n]*)([^\n])\s+(-\s+\S)/g, '$1\n\n$2');
  // Если первый блок причин идет без ### в начале, делаем его h3
  str = str.replace(/^(Основные технические причины[^:]*:)/i, '### <i data-lucide="alert-triangle" class="inline-block w-5 h-5 text-amber-500 mr-1.5 align-text-bottom"></i> $1\n\n');
  // Добавляем иконки Lucide к ключевым заголовкам, если их там еще нет (безопасная проверка через негативный lookahead)
  str = str.replace(/(#{1,3}\s+)(?!<i|[^<\n]*data-lucide)(Специфика)/g, '$1<i data-lucide="wrench" class="inline-block w-5 h-5 text-brand mr-1.5 align-text-bottom"></i> $2');
  str = str.replace(/(#{1,3}\s+)(?!<i|[^<\n]*data-lucide)(Как не лохануться)/g, '$1<i data-lucide="shield-alert" class="inline-block w-5 h-5 text-red-500 mr-1.5 align-text-bottom"></i> $2');
  str = str.replace(/(#{1,3}\s+)(?!<i|[^<\n]*data-lucide)(Основные)/g, '$1<i data-lucide="alert-triangle" class="inline-block w-5 h-5 text-amber-500 mr-1.5 align-text-bottom"></i> $2');
  // Иконки для шагов в Сделай сам:
  str = str.replace(/(#{1,3}\s+)(?!<i|[^<\n]*data-lucide)((?:Шаг\s*\d+[\s:.-]*)?[^#\n]*(?:Визуальн|Осмотр)[^#\n]*)/ig, '$1<i data-lucide="eye" class="inline-block w-5 h-5 text-brand mr-1.5 align-text-bottom"></i> $2');
  str = str.replace(/(#{1,3}\s+)(?!<i|[^<\n]*data-lucide)((?:Шаг\s*\d+[\s:.-]*)?[^#\n]*(?:Сканер|OBD|Live Data|Чтение|Код)[^#\n]*)/ig, '$1<i data-lucide="cpu" class="inline-block w-5 h-5 text-brand mr-1.5 align-text-bottom"></i> $2');
  str = str.replace(/(#{1,3}\s+)(?!<i|[^<\n]*data-lucide)((?:Шаг\s*\d+[\s:.-]*)?[^#\n]*(?:Мультиметр|Сопротивление|Напряжение|Проводк|Датчик|Электрик)[^#\n]*)/ig, '$1<i data-lucide="gauge" class="inline-block w-5 h-5 text-brand mr-1.5 align-text-bottom"></i> $2');
  str = str.replace(/(#{1,3}\s+)(?!<i|[^<\n]*data-lucide)((?:Шаг\s*\d+[\s:.-]*)?[^#\n]*(?:Замена|Ремонт|Очистк|Промывк|Сняти|Установк)[^#\n]*)/ig, '$1<i data-lucide="wrench" class="inline-block w-5 h-5 text-brand mr-1.5 align-text-bottom"></i> $2');
  return str;
};

// Функция для 100% гарантии чистоты структуры HTML заголовков (удаление пустых h1-h6 и приведение всех заголовков внутри контента к h3)
const cleanReportHtml = (html) => {
  if (!html) return '';
  let str = html;
  // 1. Удаляем любые пустые теги заголовков h1-h6 (даже с пробелами, <br>, &nbsp; или пустыми иконками <i>)
  str = str.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/ig, (match, content) => {
    const textOnly = content.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s/g, '').trim();
    return textOnly.length === 0 ? '' : match;
  });
  // 2. Все оставшиеся заголовки h1, h2, h4, h5, h6 внутри контента отчетов принудительно превращаем строго в h3
  str = str.replace(/<h[12456]([^>]*)>([\s\S]*?)<\/h[12456]>/ig, '<h3$1>$2</h3>');
  return str;
};


// Подключение модуля Гаража
app.use('/garage', garageRouter);

// Глобальный запрет индексации (до релиза)
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send("User-agent: *\nDisallow: /");
});

// 3. Главная страница (Landing Page)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>7Set.pro — Умная автодиагностика и регламент ТО</title>
      <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
      <script>tailwind.config = { theme: { extend: { colors: { brand: '#0077FF', surface: '#F5F5F7' } } } }</script>     
      <link rel="stylesheet" href="/style.css">
      <script src="/main.js" defer></script>
      <script src="https://unpkg.com/lucide@latest"></script>
    </head>
    <body class="bg-surface text-gray-900 font-sans antialiased min-h-screen flex flex-col justify-between">
      <div class="max-w-5xl mx-auto p-4 md:p-6 w-full">
        <!-- Шапка (Header) -->
        <header class="flex justify-between items-center mb-8 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <i data-lucide="activity" style="color: #007bff;"></i>
            <span class="font-bold text-xl tracking-tight">7Set.Pro</span> <span class="font-normal text-sm text-gray-500 ml-1 hidden md:inline">| Умная автодиагностика</span>
          </a>
          <div class="flex items-center gap-3">
            <a href="/garage" class="text-sm font-semibold bg-brand/10 text-brand px-3.5 py-2 rounded-xl hover:bg-brand hover:text-white transition-all flex items-center gap-1.5 shadow-sm">
              <i data-lucide="car" class="w-4 h-4"></i> Гараж & ТО
            </a>
            <button id="theme-toggle" class="p-2 rounded-full hover:bg-gray-100 transition-colors" aria-label="Переключить тему">
              <i data-lucide="moon" class="w-5 h-5 text-gray-700"></i>
            </button>
          </div>
        </header>

        <!-- Главное содержимое (pSEO структура) -->
        <main class="space-y-12">
          <!-- Hero Секция -->
          <section class="hero-section bg-white rounded-3xl p-6 md:p-12 shadow-sm border border-gray-100 text-center relative overflow-hidden">
            <div class="hero-content max-w-3xl mx-auto">
              <span class="inline-block px-3 py-1 bg-brand/10 text-brand text-xs font-bold rounded-full mb-4 uppercase tracking-wider">ИИ Автоэксперт</span>
              <h1 class="text-3xl sm:text-4xl md:text-5xl font-black text-gray-900 mb-4 tracking-tight leading-tight">
                Умная автодиагностика и персональный подбор ТО
              </h1>
              <p class="text-gray-500 text-base md:text-lg mb-8 max-w-2xl mx-auto">
                Мгновенная расшифровка кодов OBD-II, дилерских ошибок и точный регламент расходников для вашей модификации авто.
              </p>
              
              <div class="search-widget bg-gray-50/80 p-4 md:p-6 rounded-2xl border border-gray-200 shadow-inner max-w-3xl mx-auto">
                <form id="diagnostics-form" action="/search" method="GET" class="search-form">
                  <div class="input-group grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                    <div>
                      <input list="brand-options" type="text" id="inputBrand" name="brand" placeholder="Марка (напр. Toyota)" class="w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-base focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all shadow-sm" autocomplete="off" required>
                      <datalist id="brand-options"></datalist>
                    </div>
                    <div>
                      <input list="model-options" type="text" id="inputModel" name="model" placeholder="Модель (напр. Camry)" class="w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-base focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all shadow-sm disabled:opacity-50" autocomplete="off" disabled required>
                      <datalist id="model-options"></datalist>
                    </div>
                    <div>
                      <input type="text" id="inputCode" name="code" placeholder="Код (напр. P0171)" class="w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-base focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all shadow-sm uppercase" autocomplete="off" required>
                    </div>
                  </div>
                  <div id="codeErrorHint" class="text-red-500 text-sm my-2 px-2 text-left font-medium" style="display: none;"></div>
                  <button type="submit" id="btnSearch" class="btn-primary w-full bg-brand hover:bg-blue-600 text-white font-bold rounded-xl py-4 text-lg transition-all shadow-md active:scale-[0.99] flex justify-center items-center gap-2">
                    <i data-lucide="zap" class="w-5 h-5"></i> Диагностировать ошибку
                  </button>
                </form>
                <div class="popular-tags flex flex-wrap items-center justify-center gap-2 mt-4 text-xs text-gray-500">
                  <span class="font-medium text-gray-400">Популярные запросы:</span>
                  <a href="/diagnostic/toyota/camry/P0171" class="bg-white px-3 py-1.5 rounded-lg border border-gray-200 hover:border-brand hover:text-brand transition-colors font-medium">P0171</a>
                  <a href="/diagnostic/bmw/x5/P0300" class="bg-white px-3 py-1.5 rounded-lg border border-gray-200 hover:border-brand hover:text-brand transition-colors font-medium">P0300</a>
                  <a href="/diagnostic/kia/rio/U0100" class="bg-white px-3 py-1.5 rounded-lg border border-gray-200 hover:border-brand hover:text-brand transition-colors font-medium">U0100</a>
                  <a href="/garage" class="bg-brand/10 text-brand px-3 py-1.5 rounded-lg hover:bg-brand hover:text-white transition-colors font-semibold">✨ Подбор щёток и масел</a>
                </div>
              </div>
            </div>
          </section>

          <!-- Секция УТП (USP Section) -->
          <section class="usp-section">
            <div class="text-center mb-8">
              <h2 class="text-2xl md:text-3xl font-black text-gray-900 mb-2">Почему выбирают 7Set.pro?</h2>
              <p class="text-gray-500 text-sm max-w-xl mx-auto">Инновационные алгоритмы анализа автомобильных данных для точной диагностики без лишних затрат.</p>
            </div>
            <div class="usp-grid grid grid-cols-1 md:grid-cols-3 gap-6">
              <div class="usp-card bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="w-12 h-12 bg-blue-50 text-brand rounded-2xl flex items-center justify-center mb-4 shadow-sm shadow-blue-500/10"><i data-lucide="crosshair" class="w-6 h-6 text-brand"></i></div>
                <h3 class="font-bold text-lg text-gray-900 mb-2">Точно под ваш мотор</h3>
                <p class="text-gray-500 text-sm leading-relaxed">ИИ учитывает не только модель, но и модификацию и индекс двигателя. Никакой «воды» — только конкретные инструкции.</p>
              </div>
              <div class="usp-card bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm shadow-emerald-500/10"><i data-lucide="shield-check" class="w-6 h-6 text-emerald-600"></i></div>
                <h3 class="font-bold text-lg text-gray-900 mb-2">Защита от СТО</h3>
                <p class="text-gray-500 text-sm leading-relaxed">В каждой карточке ошибки есть раздел «Как не дать себя обмануть механикам» с советами по контролю счета и работ.</p>
              </div>
              <div class="usp-card bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm shadow-purple-500/10"><i data-lucide="car-front" class="w-6 h-6 text-purple-600"></i></div>
                <h3 class="font-bold text-lg text-gray-900 mb-2">Личный «Гараж»</h3>
                <p class="text-gray-500 text-sm leading-relaxed">Внесите авто один раз и мгновенно получайте размеры щеток, допуски моторных масел и объемы заправочных жидкостей.</p>
              </div>
            </div>
          </section>

          <!-- Секция Тарифов (Pricing Section) -->
          <section class="pricing-section bg-gradient-to-b from-white to-gray-50/50 rounded-3xl p-6 md:p-12 border border-gray-100 shadow-sm">
            <div class="text-center mb-10">
              <h2 class="text-2xl md:text-3xl font-black text-gray-900 mb-2">Доступ к Гаражу и Расходникам</h2>
              <p class="text-gray-500 text-sm max-w-xl mx-auto">Подключите персональный профиль для автоматизированного ведения регламента технического обслуживания.</p>
            </div>
            <div class="pricing-grid grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div class="price-card bg-white border border-gray-200 rounded-3xl p-6 flex flex-col justify-between hover:border-brand/40 transition-colors">
                <div>
                  <h3 class="font-bold text-xl text-gray-900 mb-1">1 Автомобиль</h3>
                  <p class="price text-2xl font-black text-gray-900 mb-6">$5.99 <span class="text-xs font-normal text-gray-500">/ мес</span></p>
                  <ul class="space-y-3 text-sm text-gray-600 mb-8">
                    <li class="flex items-center gap-2.5"><i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-500 shrink-0"></i><span>Полный лог ошибок OBD-II</span></li>
                    <li class="flex items-center gap-2.5"><i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-500 shrink-0"></i><span>Подбор расходников для 1 авто</span></li>
                    <li class="flex items-center gap-2.5"><i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-500 shrink-0"></i><span>Базовые советы по диагностике</span></li>
                  </ul>
                </div>
                <a href="/garage" class="btn-outline w-full text-center bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold py-3 rounded-xl transition-colors block">Выбрать</a>
              </div>

              <div class="price-card pro-card bg-white border-2 border-brand rounded-3xl p-6 flex flex-col justify-between relative shadow-lg transform md:-translate-y-2">
                <div class="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-brand text-white text-xs font-black px-4 py-1 rounded-full uppercase tracking-wider shadow-sm">Выбор водителей</div>
                <div>
                  <h3 class="font-bold text-xl text-gray-900 mb-1">Семья (до 5 авто)</h3>
                  <p class="price text-2xl font-black text-gray-900 mb-6">$15.99 <span class="text-xs font-normal text-gray-500">/ мес</span></p>
                  <ul class="space-y-3 text-sm text-gray-600 mb-8">
                    <li class="flex items-center gap-2.5 font-medium text-gray-900"><i data-lucide="zap" class="w-4 h-4 text-amber-500 shrink-0 fill-amber-500/20"></i><span>Ведение нескольких машин</span></li>
                    <li class="flex items-center gap-2.5 font-medium text-gray-900"><i data-lucide="zap" class="w-4 h-4 text-amber-500 shrink-0 fill-amber-500/20"></i><span>История обслуживания и ТО</span></li>
                    <li class="flex items-center gap-2.5 font-medium text-gray-900"><i data-lucide="zap" class="w-4 h-4 text-amber-500 shrink-0 fill-amber-500/20"></i><span>Защита от переплат на СТО</span></li>
                    <li class="flex items-center gap-2.5 font-medium text-gray-900"><i data-lucide="zap" class="w-4 h-4 text-amber-500 shrink-0 fill-amber-500/20"></i><span>Приоритетная ИИ генерация</span></li>
                  </ul>
                </div>
                <a href="/garage" class="btn-primary w-full text-center bg-brand hover:bg-blue-600 text-white font-bold py-3.5 rounded-xl transition-colors shadow-md block">Подключить</a>
              </div>

              <div class="price-card bg-white border border-gray-200 rounded-3xl p-6 flex flex-col justify-between hover:border-brand/40 transition-colors">
                <div>
                  <h3 class="font-bold text-xl text-gray-900 mb-1">СТО (Безлимит)</h3>
                  <p class="price text-2xl font-black text-gray-900 mb-6">$25.99 <span class="text-xs font-normal text-gray-500">/ мес</span></p>
                  <ul class="space-y-3 text-sm text-gray-600 mb-8">
                    <li class="flex items-center gap-2.5"><i data-lucide="wrench" class="w-4 h-4 text-blue-600 shrink-0"></i><span>Безлимитные запросы</span></li>
                    <li class="flex items-center gap-2.5"><i data-lucide="wrench" class="w-4 h-4 text-blue-600 shrink-0"></i><span>Доступ к дилерским кодам</span></li>
                    <li class="flex items-center gap-2.5"><i data-lucide="wrench" class="w-4 h-4 text-blue-600 shrink-0"></i><span>Коммерческое использование</span></li>
                  </ul>
                </div>
                <a href="/garage" class="btn-outline w-full text-center bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 rounded-xl transition-colors block">Для профи</a>
              </div>
            </div>
          </section>
        </main>

        <!-- Подвал (Footer) -->
        <footer class="mt-16 pt-8 border-t border-gray-200/80 text-xs text-gray-500">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div class="md:col-span-2">
              <a href="/" class="flex items-center gap-2 font-bold text-base text-gray-900 mb-2">
                <i data-lucide="activity" class="text-brand w-5 h-5"></i> 7Set.pro
              </a>
              <p class="max-w-sm text-gray-500 leading-relaxed">
                Интеллектуальная система экспресс-диагностики, расшифровки кодов неисправностей и точного регламентного обслуживания автомобилей.
              </p>
            </div>
            <div>
              <h4 class="font-bold text-gray-900 mb-2.5 uppercase tracking-wider text-[11px]">Навигация</h4>
              <ul class="space-y-2 font-medium">
                <li><a href="/" class="hover:text-brand transition-colors">Каталог ошибок OBD-II</a></li>
                <li><a href="/garage" class="hover:text-brand transition-colors">Персональный Гараж</a></li>
                <li><a href="/garage" class="hover:text-brand transition-colors">Подбор расходников</a></li>
              </ul>
            </div>
            <div>
              <h4 class="font-bold text-gray-900 mb-2.5 uppercase tracking-wider text-[11px]">Юридическая информация</h4>
              <ul class="space-y-2 font-medium">
                <li><a href="/legal/terms" class="hover:text-brand transition-colors">Пользовательское соглашение</a></li>
                <li><a href="/legal/privacy" class="hover:text-brand transition-colors">Политика конфиденциальности</a></li>
                <li><a href="/legal/terms" class="hover:text-brand transition-colors">Условия подписки</a></li>
              </ul>
            </div>
          </div>
          <div class="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-gray-100 text-[11px]">
            <div>© ${new Date().getFullYear()} 7Set.pro. Все права защищены.</div>
            <div class="flex gap-4">
              <span class="flex items-center gap-1.5">Сделано с заботой о водителях <i data-lucide="car-front" class="w-4 h-4 text-brand inline"></i></span>
            </div>
          </div>
        </footer>
      </div>
      <script>lucide.createIcons();</script>
    </body>
    </html>
  `);
});

// 4. Обработчик формы -> Редирект на SEO URL
app.get('/search', (req, res) => {
  const { brand, model, code } = req.query;
  if (!brand || !model || !code) return res.redirect('/');
  res.redirect(`/diagnostic/${brand.toLowerCase().trim()}/${model.toLowerCase().trim()}/${code.toUpperCase().trim()}`);
});

// 5. Публичная SEO-страница диагностики
app.get('/diagnostic/:brand/:model/:code', async (req, res) => {
  const brand = req.params.brand.toLowerCase().trim();
  const model = req.params.model.toLowerCase().trim();
  const code = req.params.code.toLowerCase().trim();

  console.log(`📡 [SEO REQ] Запрос страницы: ${brand} ${model} [${code}]`);

  const cleanRequestedCode = req.params.code.toUpperCase().trim();
  const obdRegex = /^[PBUC][0-9A-F]{4}$/i;

  if (!obdRegex.test(cleanRequestedCode)) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <title>Неверный код ошибки</title>
        <link rel="stylesheet" href="/style.css">
      </head>
      <body style="display: flex; justify-content: center; align-items: center; height: 100vh; background: var(--bg-body); color: var(--text-main);">
        <div class="card" style="text-align: center; max-width: 500px;">
          <h2 style="color: #dc3545; margin-bottom: 10px; display: inline-flex; items-center; justify-content: center; gap: 8px;"><i data-lucide="alert-triangle" style="width:24px; height:24px;"></i> Неверный формат кода</h2>
          <p style="margin-bottom: 20px;">Код OBD2 должен начинаться с буквы P, B, U или C и содержать 4 цифры или буквы (A-F).<br>Например: <b>P0171</b>.</p>
          <a href="/" class="btn-primary" style="text-decoration: none;">Вернуться на главную</a>
        </div>
        <script src="https://unpkg.com/lucide@latest"></script>
        <script>lucide.createIcons();</script>
      </body>
      </html>
    `);
  }

  const baseDescription = "";


  try {
    let reportId;
    let severityLevel;
    let summaryText;
    let teaserText;
    let report;

    // Проверка, является ли код ложным/несуществующим до запросов к БД и ИИ
    const obdRegex = /^[PBUC][0-9A-F]{4}$/i;
    const descLower = baseDescription ? baseDescription.toLowerCase() : '';
    let isUnsupported = !obdRegex.test(cleanRequestedCode) ||
      descLower === 'не существует' ||
      descLower === 'код не существует';

    const targetBrand = isUnsupported ? "universal" : brand;
    const targetModel = isUnsupported ? "unsupported" : model;
    const targetCode = isUnsupported ? "UNSUPPORTED" : code;

    // Ищем в кэше (для ложных кодов ищем единую универсальную карточку)
    let existingReport = await prisma.diagnosticReport.findFirst({
      where: { brand: targetBrand, model: targetModel, code: targetCode }
    });

    if (existingReport) {
      const isCachedStub = existingReport.brand === "universal" ||
        existingReport.code === "UNSUPPORTED" ||
        (existingReport.summary || '').includes('не зарегистрирован в официальных каталогах') ||
        (existingReport.summary || '').includes('Сбой по коду') ||
        (existingReport.summary || '').includes('официально расшифровывается как:') ||
        (existingReport.seoTitle || '').includes('Неизвестный');

      // Если со старых тестов в БД лежит заглушка, но сам код является рабочим (!isUnsupported), удаляем этот ошибочный кэш!
      if (isCachedStub && !isUnsupported) {
        console.log('🔄 [ОЧИСТКА КЭША] В БД обнаружен старый ошибочный кэш заглушки для реального кода! Удаляем и запрашиваем свежий ИИ-отчет...');
        await prisma.diagnosticReport.delete({ where: { id: existingReport.id } }).catch(() => { });
        existingReport = null;
      } else {
        console.log('⚡ Отчет найден в БД (кэш)!');
        report = existingReport;
        reportId = existingReport.id;
        severityLevel = existingReport.severity;
        summaryText = existingReport.summary;
        teaserText = existingReport.teaser_text;
        if (isCachedStub) {
          isUnsupported = true;
        }
      }
    }

    if (!report && existingReport) {
      report = existingReport;
    }

    if (!report) {
      console.log('🤖 Запрос FAST-части к Gemini API...');
      // 1. Ждем ТОЛЬКО быструю часть (2-3 сек)
      const fastData = await analyzeCarErrorFast(brand, model, code, baseDescription); 
      console.log('✅ Быстрый ответ получен!');

      // Защита от длинного текста от ИИ для колонки drivability
      let safeDrivability = fastData.drivability;
      if (!['safe', 'caution', 'tow'].includes(safeDrivability)) {
        if (fastData.severity === 'low') safeDrivability = 'safe';
        else if (fastData.severity === 'critical') safeDrivability = 'tow';
        else safeDrivability = 'caution';
      }

      // 2. Создаем запись в БД (платные поля пока пустые или с заглушками)
      const newReport = await prisma.diagnosticReport.create({
        data: {
          brand: isUnsupported ? "universal" : brand,
          model: isUnsupported ? "unsupported" : model,
          code: isUnsupported ? "UNSUPPORTED" : code,
          severity: fastData.severity,
          summary: fastData.summary,
          teaser_text: fastData.teaser_text,
          drivability: safeDrivability,
          seoTitle: fastData.seoTitle,
          seoDescription: fastData.seoDescription,
          is_paid: isUnsupported ? true : false,
          is_complete: false, // Флаг неполного отчета
          full_analysis_markdown: "Фоновый анализ в процессе... Подождите пару секунд и обновите страницу.",
          sto_protection_tips: "Фоновый анализ в процессе... Подождите пару секунд и обновите страницу."
        }
      });

      console.log(`💾 Базовый отчет сохранен в MySQL! ID: ${newReport.id}`);
      report = newReport;
      reportId = newReport.id;
      severityLevel = fastData.severity;
      summaryText = fastData.summary;
      teaserText = fastData.teaser_text;

      // 3. ⚡ АСИНХРОННЫЙ ФОНОВЫЙ ЗАПУСК ⚡ (БЕЗ await!)
      if (!isUnsupported) {
        analyzeCarErrorDeep(brand, model, code, baseDescription).then(async (deepData) => {
          await prisma.diagnosticReport.update({
            where: { id: newReport.id },
            data: {
              full_analysis_markdown: deepData.full_analysis_markdown,
              sto_protection_tips: deepData.sto_protection_tips,
              diy_instructions: deepData.diy_instructions,
              price_parts: deepData.price_parts,
              price_labor: deepData.price_labor,
              diy_difficulty_text: deepData.diy_difficulty_text,
              diy_difficulty_score: deepData.diy_difficulty_score,
              diy_time: deepData.diy_time,
              diy_tools: deepData.diy_tools,
              is_complete: true // Отчет готов!
            }
          });
          console.log(`✅ [ФОН] Глубокая генерация для ${code} успешно завершена и сохранена!`);
        }).catch(err => console.error("❌ Фоновая генерация упала:", err));
      }
    }

    const severityMap = {
      low: { text: 'Низкая опасность', class: 'badge-low' },
      medium: { text: 'Средняя опасность', class: 'badge-medium' },
      high: { text: 'Высокая опасность', class: 'badge-high' },
      critical: { text: 'Критично (не ездить)', class: 'badge-critical' },
      "Информация": { text: 'Информация', class: 'badge-low' }
    };

    const severity = severityMap[severityLevel] || severityMap.medium;

    let drivabilityValue = report.drivability;
    if (!drivabilityValue || drivabilityValue.startsWith('Эксплуатация') || report.brand === "universal") {
      drivabilityValue = 'safe';
    }

    const drivabilityMap = {
      safe: { text: 'Можно ехать', class: 'bg-green-100 text-green-800 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wide' },
      caution: { text: 'Своим ходом до СТО', class: 'bg-yellow-100 text-yellow-800 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wide' },
      tow: { text: 'Только эвакуатор', class: 'bg-red-100 text-red-800 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wide' }
    };
    const drivabilityData = drivabilityMap[drivabilityValue] || drivabilityMap.caution;

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    const formatTitleCase = (str) => str.split(/[\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const displayBrand = formatTitleCase(brand);
    const displayModel = formatTitleCase(model);
    const displayCode = code.toUpperCase();

    const isUnsupportedReport = isUnsupported;

    const unlockedList = parseUnlockedCookie(req.cookies?.unlocked_reports);
    const slug = `${brand.toLowerCase()}-${model.toLowerCase()}-${code.toLowerCase()}`;
    const isUnlockedForUser = isUnsupportedReport || (report && (report.is_paid || unlockedList.includes(report.id) || unlockedList.includes(slug)));

    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": isUnsupportedReport ? `Что означает неизвестный или незарегистрированный код ошибки?` : `Что означает ошибка ${displayCode} на ${displayBrand} ${displayModel}?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": report.teaser_text || report.summary || "Подробное описание ошибки доступно на сайте."
          }
        },
        {
          "@type": "Question",
          "name": `Можно ли починить своими руками?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `Сложность: ${report.diy_difficulty_text || 'Неизвестно'}. Примерное время: ${report.diy_time || 'Не указано'}. Потребуются: ${report.diy_tools || 'стандартные инструменты'}.`
          }
        },
        {
          "@type": "Question",
          "name": `Сколько примерная стоимость ремонта?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `Примерная стоимость запчастей: ${report.price_parts || 'Уточняется'}. Работа специалиста: ${report.price_labor || 'Уточняется'}.`
          }
        }
      ]
    };
    const baseUrl = process.env.SITE_URL || 'https://7set.pro';
    const pageUrl = isUnsupportedReport ? `${baseUrl}/diagnostic/unknown-code` : `${baseUrl}/diagnostic/${brand.toLowerCase()}/${model.toLowerCase()}/${code.toUpperCase()}`;
    const ogImage = isUnsupportedReport ? `${baseUrl}/og-default.png` : `${baseUrl}/og-images/${brand.toLowerCase()}-${model.toLowerCase()}-${code.toLowerCase()}.png`;
    let seoTitle = report.seoTitle || (isUnsupportedReport ? "Неизвестный код ошибки автомобиля: причины и проверка" : `Ошибка ${displayCode} ${displayBrand} ${displayModel}: расшифровка, причины и ремонт`);
    if (!isUnsupportedReport && seoTitle && !seoTitle.toLowerCase().includes(displayModel.toLowerCase())) {
      const brandReg = new RegExp(`(${displayBrand})`, 'i');
      if (brandReg.test(seoTitle)) {
        seoTitle = seoTitle.replace(brandReg, `$1 ${displayModel}`);
      } else {
        seoTitle = `Ошибка ${displayCode} ${displayBrand} ${displayModel}: ${seoTitle.replace(/^Ошибка\s+[PBUC][0-9A-F]{4}\s*[:\-]?\s*/i, '')}`;
      }
    }

    let seoDescription = report.seoDescription || (isUnsupportedReport ? "Код ошибки не найден в базе данных. Узнайте, почему диагностический сканер выдает неизвестную ошибку и как проверить ЭБУ." : `Узнайте точные симптомы, причины возникновения ошибки ${displayCode} на ${displayBrand} ${displayModel}, а также примерную стоимость ремонта на СТО и пошаговую инструкцию по самостоятельному устранению.`);
    if (!isUnsupportedReport && seoDescription && !seoDescription.toLowerCase().includes(displayModel.toLowerCase())) {
      const brandReg = new RegExp(`(${displayBrand})`, 'i');
      if (brandReg.test(seoDescription)) {
        seoDescription = seoDescription.replace(brandReg, `$1 ${displayModel}`);
      }
    }

    const techArticleSchema = {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      "headline": seoTitle,
      "description": seoDescription,
      "author": {
        "@type": "Organization",
        "name": "Редакция 7Set.pro"
      },
      "publisher": {
        "@type": "Organization",
        "name": "7Set.pro",
        "logo": {
          "@type": "ImageObject",
          "url": `${baseUrl}/logo.png`
        }
      },
      "mainEntityOfPage": pageUrl
    };

    const schemaHtml = `<script type="application/ld+json">${JSON.stringify(techArticleSchema)}</script>\n        <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`;

    res.send(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${seoTitle}</title>
        <meta name="description" content="${seoDescription}">
        <link rel="canonical" href="${pageUrl}">
        <meta property="og:url" content="${pageUrl}">
        <meta property="og:title" content="${seoTitle}">
        <meta property="og:description" content="${seoDescription}">
        <meta property="og:image" content="${ogImage}">
        <meta property="og:type" content="article">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="${seoTitle}">
        <meta name="twitter:description" content="${seoDescription}">
        <meta name="twitter:image" content="${ogImage}">
        ${schemaHtml}
        <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
        <script>tailwind.config = { theme: { extend: { colors: { brand: '#0077FF', surface: '#F5F5F7' } } } }</script>   
        <style> ::-webkit-details-marker { display: none; } </style>
        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        <script src="/main.js" defer></script>
        <script src="https://unpkg.com/lucide@latest"></script>
      </head>
      <body class="bg-surface text-gray-900 font-sans antialiased pb-20 md:pb-0">
        <div class="max-w-md mx-auto p-4 md:max-w-2xl md:p-6">
          <header class="flex justify-between items-center mb-6">
            <a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <i data-lucide="activity" style="color: #007bff;"></i>
              <span class="font-bold text-xl tracking-tight">7Set.Pro</span> <span class="font-normal text-sm opacity-80 ml-1 hidden md:inline">| Умная диагностика авто</span>
            </a>
            <button id="theme-toggle" class="p-2 rounded-full hover:bg-gray-200 transition-colors" aria-label="Переключить тему">
              <i data-lucide="moon" class="w-5 h-5 text-gray-700"></i>
            </button>
          </header>

          <div class="diagnostic-grid">
            <article class="bg-white rounded-2xl shadow-sm p-5 mb-4">
              <div class="flex justify-between items-start mb-4">
                <div class="flex flex-wrap gap-2">
                  <span class="${severityLevel === 'critical' || severityLevel === 'high' ? 'bg-red-100 text-red-800' : severityLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'} text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wide">${severity.text.replace(/<[^>]*>?/gm, '')}</span>
                  <span class="${drivabilityData.class}">${drivabilityData.text}</span>
                </div>
                <span class="text-xs text-gray-400 font-mono font-medium mt-1">Код: ${isUnsupportedReport ? 'Незарегистрированный' : displayCode}</span>
              </div>

              <h1 class="text-2xl font-bold mb-3">${seoTitle}</h1>
              <div class="flex flex-col items-center justify-center bg-gray-50 border border-gray-100 rounded-2xl p-8 mb-6">
                <i data-lucide="car-front" class="w-16 h-16 text-brand mb-3" aria-hidden="true"></i>
                <span class="text-gray-500 font-medium text-sm">Отчет об ошибке ${isUnsupportedReport ? 'UNSUPPORTED' : displayCode}</span>
                <img src="https://placehold.co/600x400/ffffff/0077FF?text=${isUnsupportedReport ? 'UNKNOWN' : displayCode}" alt="${isUnsupportedReport ? 'Диагностика и проверка неизвестного или ложного кода ошибки автомобиля' : `Детальная расшифровка и ремонт ошибки ${displayCode} для ${displayBrand} ${displayModel}`}" class="sr-only" />
              </div>
              <p class="text-gray-500 font-medium text-sm leading-relaxed mb-4">${summaryText}</p>
              <div class="h-px bg-gray-100 w-full mb-4"></div>
              <p class="text-gray-800 leading-relaxed">${teaserText}</p>
            </article>

            <div id="paywall-container" data-report-id="${reportId}">
              ${!isUnlockedForUser ? `
              <div class="report-content">
                <div class="relative overflow-hidden rounded-2xl mt-2 bg-white shadow-sm border border-gray-100">        
                  <div id="blurred-content" class="absolute inset-0 p-5 overflow-hidden pointer-events-none select-none blur-sm opacity-40 prose prose-blue prose-lg max-w-none text-gray-800">
                    ${cleanReportHtml(marked.parse(formatReportMarkdown(report.full_analysis_markdown || '')))}
                  </div>
                  <div id="paywall-overlay" class="relative z-10 flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm p-4 py-8">
                    <div class="bg-white border border-gray-100 shadow-2xl rounded-2xl p-6 md:p-8 w-full max-w-md transform transition-all">

                      <div class="flex flex-col items-center text-center mb-5">
                        <div class="bg-blue-50 p-3 rounded-full mb-3">
                          <i data-lucide="lock" class="w-6 h-6 text-brand"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-900">Разблокируйте полный отчет</h3>
                        <p class="text-sm text-gray-500 mt-1">Узнайте всё о поломке и сэкономьте на ремонте.</p>
                      </div>

                      <ul class="space-y-3 mb-6 text-sm text-gray-700">
                        <li class="flex items-start gap-3">
                          <i data-lucide="search-check" class="w-5 h-5 text-green-500 shrink-0"></i>
                          <span><strong>Причины и симптомы:</strong> точный диагноз проблемы.</span>
                        </li>
                        <li class="flex items-start gap-3">
                          <i data-lucide="shield-alert" class="w-5 h-5 text-red-500 shrink-0"></i>
                          <span><strong>Защита от обмана:</strong> как не лохануться на СТО.</span>
                        </li>
                        <li class="flex items-start gap-3">
                          <i data-lucide="wrench" class="w-5 h-5 text-orange-500 shrink-0"></i>
                          <span><strong>Сделай сам:</strong> пошаговая инструкция по ремонту.</span>
                        </li>
                        <li class="flex items-start gap-3">
                          <i data-lucide="calculator" class="w-5 h-5 text-blue-500 shrink-0"></i>
                          <span><strong>Фин. прогноз:</strong> реальная стоимость запчастей и работы.</span>
                        </li>
                      </ul>

                      <button id="unlock-btn" class="w-full bg-brand text-white font-medium rounded-xl py-4 text-lg hover:bg-blue-600 transition-colors shadow-md shadow-brand/30 active:scale-[0.98] flex justify-center items-center gap-2">    
                        <i data-lucide="unlock" class="w-5 h-5"></i>
                        Разблокировать за $1.99
                      </button>
                      <p class="text-xs text-center text-gray-400 mt-3 flex items-center justify-center gap-1">
                        <i data-lucide="shield-check" class="w-3 h-3"></i> Безопасная оплата
                      </p>

                    </div>
                  </div>
                </div>
              </div>
              ` : `
              <div class="report-content">
                <details class="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden border border-gray-50" open>
                  <summary class="flex items-center gap-3 font-semibold p-5 cursor-pointer hover:bg-gray-50 transition-colors list-none outline-none">
                    <h2 class="text-base md:text-lg font-semibold m-0 flex items-center gap-3 w-full font-inherit text-inherit"><i data-lucide="file-search" class="w-5 h-5 text-brand shrink-0"></i> Полный разбор причины</h2>
                  </summary>
                  <div class="p-5 border-t border-gray-50 bg-white prose prose-blue prose-lg max-w-none text-gray-800">  
                    ${cleanReportHtml(marked.parse(formatReportMarkdown(report.full_analysis_markdown || '')))}
                  </div>
                </details>

                <details class="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden border border-gray-50">
                  <summary class="flex items-center gap-3 font-semibold p-5 cursor-pointer hover:bg-gray-50 transition-colors list-none outline-none">
                    <h2 class="text-base md:text-lg font-semibold m-0 flex items-center gap-3 w-full font-inherit text-inherit"><i data-lucide="wrench" class="w-5 h-5 text-gray-500 shrink-0"></i> Сделай сам <span class="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 ml-auto font-normal shrink-0">${report.diy_difficulty_text || 'Неизвестно'}</span></h2>
                  </summary>
                  <div class="p-5 border-t border-gray-50 bg-white">
                     <div class="flex flex-col gap-3 mb-5">
                       <div class="grid grid-cols-2 gap-3">
                         <div class="bg-gray-50 rounded-xl p-3.5 text-center flex flex-col justify-center">
                           <span class="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Сложность</span>
                           <strong class="text-sm md:text-base font-bold text-gray-800">${(() => { const m = String(report.diy_difficulty_score || '3/5').match(/(\d+)\s*(?:[\/|из]\s*(\d+))?/i); return m ? `${m[1]} из ${m[2] || '5'}` : '3 из 5'; })()}</strong>
                         </div>
                         <div class="bg-gray-50 rounded-xl p-3.5 text-center flex flex-col justify-center">
                           <span class="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Время</span>
                           <strong class="text-sm md:text-base font-bold text-gray-800">${report.diy_time || 'Не указано'}</strong>
                         </div>
                       </div>
                       <div class="bg-gray-50 rounded-xl p-3.5 text-left flex flex-col">
                         <span class="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Инструменты</span>
                         <div class="text-sm md:text-base font-medium text-gray-800 leading-relaxed">${report.diy_tools || 'Не указаны'}</div>
                       </div>
                     </div>
                     <div class="bg-orange-50 border-l-4 border-orange-500 p-4 mb-4 rounded-r-xl">
                        <strong class="text-orange-600 flex items-center gap-2 mb-2 text-sm">
                           <i data-lucide="alert-triangle" class="w-4 h-4"></i> Внимание!
                        </strong>
                        <p class="text-orange-900 text-sm md:text-base m-0 leading-relaxed">
                           Автомобиль — это механизм повышенной опасности. Любое неквалифицированное вмешательство может привести к серьезным поломкам (вплоть до "окирпичивания" электронных блоков) или создать угрозу ДТП. Данная инструкция носит исключительно ознакомительный характер и не является прямым руководством к действию. Всю ответственность за последствия самостоятельного ремонта вы берете на себя.
                        </p>
                     </div>
                     <div class="prose prose-blue prose-lg max-w-none text-gray-800 mt-4">${cleanReportHtml(marked.parse(formatReportMarkdown(report.diy_instructions || '')))}</div>
                  </div>
                </details>

                <details class="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden border border-gray-50" open>
                  <summary class="flex items-center gap-3 font-semibold p-5 cursor-pointer hover:bg-gray-50 transition-colors list-none outline-none">
                    <h2 class="text-base md:text-lg font-semibold m-0 flex items-center gap-3 w-full font-inherit text-inherit"><i data-lucide="wallet" class="w-5 h-5 text-green-600 shrink-0"></i> Финансовый прогноз</h2>
                  </summary>
                  <div class="p-5 border-t border-gray-50 bg-white">
                     <div class="grid grid-cols-2 gap-4 mt-2">
                       <div class="bg-gray-50 rounded-xl p-4">
                         <h3 class="text-xs text-gray-500 mb-1 flex items-center gap-1"><i data-lucide="settings" class="w-3 h-3"></i> Запчасти</h3>
                         <div class="font-bold text-lg text-gray-800"><span class="text-gray-400 font-normal mr-1">~</span>${(report.price_parts || 'Уточняется').replace(/\\n/g, '<br>')}</div>
                       </div>
                       <div class="bg-gray-50 rounded-xl p-4">
                         <h3 class="text-xs text-gray-500 mb-1 flex items-center gap-1"><i data-lucide="user-cog" class="w-3 h-3"></i> Работа СТО</h3>
                         <div class="font-bold text-lg text-gray-800"><span class="text-gray-400 font-normal mr-1">~</span>${(report.price_labor || 'Уточняется').replace(/\\n/g, '<br>')}</div>
                       </div>
                     </div>
                     <div class="mt-4 p-3 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-xs text-gray-500 flex gap-2 items-start leading-relaxed">
                        <i data-lucide="banknote" class="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400"></i>
                        <span>Указанные цены сгенерированы на основе общих рыночных данных. Они являются ориентировочными, чтобы вы понимали примерный масштаб проблемы. Точную стоимость запчастей и работ может назвать только мастер на СТО после физической диагностики.</span>
                     </div>
                  </div>
                </details>
              </div>
              `}
            </div>
          </div>
        </div>

        <nav class="fixed bottom-0 w-full bg-white border-t border-gray-100 md:hidden z-50">
          <div class="flex justify-around items-center h-16">
            <button type="button" class="flex flex-col items-center justify-center w-full h-full text-brand bg-transparent border-0 cursor-pointer">
              <i data-lucide="activity" class="w-5 h-5 mb-1"></i>
              <span class="text-[10px] font-medium">Диагноз</span>
            </button>
            <button type="button" class="flex flex-col items-center justify-center w-full h-full text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer">
              <i data-lucide="history" class="w-5 h-5 mb-1"></i>
              <span class="text-[10px] font-medium">История</span>
            </button>
            <button type="button" class="flex flex-col items-center justify-center w-full h-full text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer">
              <i data-lucide="car" class="w-5 h-5 mb-1"></i>
              <span class="text-[10px] font-medium">Гараж</span>
            </button>
            <button type="button" class="flex flex-col items-center justify-center w-full h-full text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer">
              <i data-lucide="user" class="w-5 h-5 mb-1"></i>
              <span class="text-[10px] font-medium">Профиль</span>
            </button>
          </div>
        </nav>
        <script>
          lucide.createIcons();
        </script>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('🔴 Ошибка Gemini API:', error.message || error);
    res.status(500).send(`
      <div style="font-family: sans-serif; padding: 20px; color: #721c24; background: #f8d7da; border-radius: 8px; margin: 20px;">
        <h2 style="display: flex; items-center; gap: 8px;"><i data-lucide="alert-triangle" style="width:24px; height:24px;"></i> Сбой получения ответа от ИИ</h2>
        <p>${error.message || 'Ошибка подключения к API'}</p>
      </div>
      <script src="https://unpkg.com/lucide@latest"></script>
      <script>lucide.createIcons();</script>
    `);
  }
});

app.post('/api/unlock-report', async (req, res) => {
  const { reportId, paymentToken } = req.body;

  if (!reportId) {
    return res.status(400).json({ error: 'reportId обязателен' });
  }

  try {
    const report = await prisma.diagnosticReport.findUnique({
      where: { id: reportId }
    });

    if (!report) {
      return res.status(404).json({ error: 'Отчет не найден или устарел' });
    }

    if (!report.is_paid && !paymentToken) {
      return res.status(400).json({ error: 'Необходим платежный токен' });
    }

    const unlockedList = parseUnlockedCookie(req.cookies?.unlocked_reports);

    if (!unlockedList.includes(report.id)) {
      unlockedList.push(report.id);
    }
    const slug = `${report.brand.toLowerCase()}-${report.model.toLowerCase()}-${report.code.toLowerCase()}`;
    if (!unlockedList.includes(slug)) {
      unlockedList.push(slug);
    }

    res.cookie('unlocked_reports', JSON.stringify(unlockedList), {
      maxAge: 3 * 24 * 60 * 60 * 1000, // 3 дня доступа
      httpOnly: false,
      path: '/'
    });

    res.json({
      full_analysis_markdown: report.full_analysis_markdown,
      sto_protection_tips: report.sto_protection_tips
    });
  } catch (err) {
    console.error('Ошибка БД при разблокировке:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

app.listen(PORT, async () => {
  console.log(`✅ Prisma ORM подключена к MySQL!`);
  console.log(`🚀 Боевой сервер запущен на http://localhost:${PORT}`);
});
