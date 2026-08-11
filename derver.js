import 'dotenv/config';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { analyzeCarError } from './lib/gemini.js';
import { marked } from 'marked';
import fs from 'fs';

const obd2Codes = JSON.parse(fs.readFileSync('./codes.json', 'utf-8'));

const app = express();
const PORT = process.env.PORT || 3005;

// Инициализация Prisma Client
const prisma = new PrismaClient();

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

// Глобальный запрет индексации (до релиза)
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send("User-agent: *\nDisallow: /");
});

// 3. Главная страница
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Умный Бортовик — ИИ Экспресс-Диагностика</title>
      <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
      <script>tailwind.config = { theme: { extend: { colors: { brand: '#0077FF', surface: '#F5F5F7' } } } }</script>     
      <script src="/main.js" defer></script>
      <script src="https://unpkg.com/lucide@latest"></script>
    </head>
    <body class="bg-surface text-gray-900 font-sans antialiased">
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

        <main class="bg-white rounded-2xl shadow-sm p-5 md:p-8 mt-4">
          <h1 class="text-2xl md:text-3xl font-bold mb-2">Расшифровка ошибок за 5 секунд</h1>
          <p class="text-gray-500 text-sm mb-6">
            Узнайте реальную причину поломки и защитите себя от обмана на СТО.
          </p>

          <form action="/search" method="GET" class="search-form">
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-1.5 ml-1">Марка авто</label>
              <input list="brand-options" name="brand" id="inputBrand" placeholder="Например: Toyota" class="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 text-base focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none" autocomplete="off" required>
              <datalist id="brand-options"></datalist>
            </div>
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-1.5 ml-1">Модель авто</label>
              <input list="model-options" name="model" id="inputModel" placeholder="Например: Camry" class="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 text-base focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none" autocomplete="off" required>
              <datalist id="model-options"></datalist>
            </div>
            <div class="mb-5">
              <label class="block text-sm font-medium text-gray-700 mb-1.5 ml-1">Код ошибки</label>
              <div class="flex gap-2">
                <select id="codePrefix" name="prefix" class="bg-gray-50 border border-gray-100 rounded-xl px-3 py-3.5 text-base font-bold text-brand focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none cursor-pointer">
                  <option value="P">P</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="U">U</option>
                </select>
                <input type="text" name="codeNumber" id="inputCode" placeholder="0171" class="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 text-base focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none" autocomplete="off" required>
              </div>
              <div id="codeErrorHint" class="text-red-500 text-sm mt-2 mb-1 px-2" style="display: none;"></div>
            </div>
            <button type="submit" id="btnSearch" class="w-full bg-brand text-white font-medium rounded-xl py-4 text-lg hover:bg-blue-600 transition-colors shadow-sm active:scale-[0.98]">Расшифровать через ИИ</button>
          </form>
        </main>
      </div>
    </body>
    </html>
  `);
});

// 4. Обработчик формы -> Редирект на SEO URL (с поддержкой склейки prefix + codeNumber)
app.get('/search', (req, res) => {
  const { brand, model, prefix, codeNumber, code } = req.query;
  let finalCode = code;
  if (!finalCode && prefix && codeNumber) {
    finalCode = (prefix + codeNumber).trim();
  }
  if (!brand || !model || !finalCode) return res.redirect('/');
  res.redirect(`/diagnostic/${brand.toLowerCase().trim()}/${model.toLowerCase().trim()}/${finalCode.toUpperCase().trim()}`);  
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
          <h2 style="color: #dc3545; margin-bottom: 10px;">❌ Неверный формат кода</h2>
          <p style="margin-bottom: 20px;">Код OBD2 должен начинаться с буквы P, B, U или C и содержать 4 цифры или буквы (A-F).<br>Например: <b>P0171</b>.</p>
          <a href="/" class="btn-primary" style="text-decoration: none;">Вернуться на главную</a>
        </div>
      </body>
      </html>
    `);
  }

  let baseDescription = "Специфичный код производителя (Manufacturer Specific)";
  const codeMatch = obd2Codes.find(item => item.Code && item.Code.includes(cleanRequestedCode));
  if (codeMatch && codeMatch.Description) {
    baseDescription = codeMatch.Description;
  }

  try {
    let reportId;
    let severityLevel;
    let summaryText;
    let teaserText;
    let report;

    // Ищем в кэше
    const existingReport = await prisma.diagnosticReport.findFirst({
      where: { brand, model, code }
    });

    if (existingReport) {
      console.log('⚡ Отчет найден в БД (кэш)!');
      report = existingReport;
      reportId = existingReport.id;
      severityLevel = existingReport.severity;
      summaryText = existingReport.summary;
      teaserText = existingReport.teaser_text;
    } else {
      console.log('🤖 Запрос к Gemini API...');
      const data = await analyzeCarError(brand, model, code, baseDescription);
      console.log('✅ Ответ ИИ получен!');

      const newReport = await prisma.diagnosticReport.create({
        data: {
          brand,
          model,
          code,
          severity: data.severity,
          summary: data.summary,
          teaser_text: data.teaser_text,
          full_analysis_markdown: data.full_analysis_markdown,
          sto_protection_tips: data.sto_protection_tips,
          drivability: data.drivability,
          diy_difficulty_text: data.diy_difficulty_text,
          diy_difficulty_score: data.diy_difficulty_score,
          diy_time: data.diy_time,
          diy_tools: data.diy_tools,
          price_parts: data.price_parts,
          price_labor: data.price_labor,
          diy_instructions: data.diy_instructions,
          seoTitle: data.seoTitle,
          seoDescription: data.seoDescription,
          is_paid: false
        }
      });

      console.log(`💾 Отчет сохранен в MySQL! ID: ${newReport.id}`);
      report = newReport;
      reportId = newReport.id;
      severityLevel = data.severity;
      summaryText = data.summary;
      teaserText = data.teaser_text;
    }

    const severityMap = {
      low: { text: 'Низкая опасность', class: 'badge-low' },
      medium: { text: 'Средняя опасность', class: 'badge-medium' },
      high: { text: 'Высокая опасность', class: 'badge-high' },
      critical: { text: 'Критично (не ездить)', class: 'badge-critical' }
    };

    const severity = severityMap[severityLevel] || severityMap.medium;

    let drivabilityValue = report.drivability;
    if (!drivabilityValue) {
      if (severityLevel === 'low') drivabilityValue = 'safe';
      else if (severityLevel === 'critical') drivabilityValue = 'tow';
      else drivabilityValue = 'caution';
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

    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": `Что означает ошибка ${displayCode} на ${displayBrand} ${displayModel}?`,
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
    const canonicalUrl = `https://7set.pro/diagnostic/${brand.toLowerCase()}/${model.toLowerCase()}/${code.toUpperCase()}`;
    const seoTitle = report.seoTitle || `Ошибка ${displayCode} ${displayBrand} ${displayModel}: расшифровка, причины и ремонт`;
    const seoDescription = report.seoDescription || `Узнайте точные симптомы, причины возникновения ошибки ${displayCode} на ${displayBrand} ${displayModel}, а также примерную стоимость ремонта на СТО и пошаговую инструкцию по самостоятельному устранению.`;

    const schemaHtml = `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`;

    res.send(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${seoTitle}</title>
        <meta name="description" content="${seoDescription}">
        <link rel="canonical" href="${canonicalUrl}">
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
                <span class="text-xs text-gray-400 font-mono font-medium mt-1">Код: ${displayCode}</span>
              </div>

              <h1 class="text-2xl font-bold mb-3">${displayBrand} ${displayModel}: Ошибка ${displayCode}</h1>
              <div class="flex flex-col items-center justify-center bg-gray-50 border border-gray-100 rounded-2xl p-8 mb-6">
                <i data-lucide="car-front" class="w-16 h-16 text-brand mb-3" aria-hidden="true"></i>
                <span class="text-gray-500 font-medium text-sm">Отчет об ошибке ${displayCode}</span>
                <img src="https://placehold.co/600x400/ffffff/0077FF?text=${displayCode}" alt="Детальная расшифровка и ремонт ошибки ${displayCode} для ${displayBrand} ${displayModel}" class="sr-only" />
              </div>
              <p class="text-gray-500 font-medium text-sm leading-relaxed mb-4">${summaryText}</p>
              <div class="h-px bg-gray-100 w-full mb-4"></div>
              <p class="text-gray-800 leading-relaxed">${teaserText}</p>
            </article>

            <div id="paywall-container" data-report-id="${reportId}">
              ${!report.is_paid ? `
              <div class="report-content">
                <div class="relative overflow-hidden rounded-2xl mt-2 bg-white shadow-sm border border-gray-100">        
                  <div id="blurred-content" class="absolute inset-0 p-5 overflow-hidden pointer-events-none select-none blur-sm opacity-40 prose prose-blue prose-lg max-w-none text-gray-800">
                    ${marked.parse((report.full_analysis_markdown || '').replace(/\\n/g, '\n'))}
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
                    <i data-lucide="file-search" class="w-5 h-5 text-brand"></i> Полный разбор причины
                  </summary>
                  <div class="p-5 border-t border-gray-50 bg-white prose prose-blue prose-lg max-w-none text-gray-800">  
                    ${marked.parse((report.full_analysis_markdown || '').replace(/\\n/g, '\n'))}
                  </div>
                </details>

                <details class="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden border border-gray-50">
                  <summary class="flex items-center gap-3 font-semibold p-5 cursor-pointer hover:bg-gray-50 transition-colors list-none outline-none">
                    <i data-lucide="wrench" class="w-5 h-5 text-gray-500"></i> Сделай сам
                    <span class="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 ml-auto">${report.diy_difficulty_text || 'Неизвестно'}</span>
                  </summary>
                  <div class="p-5 border-t border-gray-50 bg-white">
                     <div class="flex flex-col gap-3 mb-5">
                       <div class="grid grid-cols-2 gap-3">
                         <div class="bg-gray-50 rounded-xl p-3 text-center">
                           <span class="text-xs text-gray-500 uppercase">Сложность</span><br>
                           <strong class="text-sm">${report.diy_difficulty_score || '?'} / 10</strong>
                         </div>
                         <div class="bg-gray-50 rounded-xl p-3 text-center">
                           <span class="text-xs text-gray-500 uppercase">Время</span><br>
                           <strong class="text-sm">${report.diy_time || 'Не указано'}</strong>
                         </div>
                       </div>
                       <div class="bg-gray-50 rounded-xl p-3 text-center">
                         <span class="text-xs text-gray-500 uppercase">Инструменты</span><br>
                         <strong class="text-sm">${report.diy_tools || 'Не указаны'}</strong>
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
                     <div class="prose prose-blue prose-lg max-w-none text-gray-800 mt-4">${marked.parse((report.diy_instructions || '').replace(/\\n/g, '\n'))}</div>
                  </div>
                </details>

                <details class="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden border border-gray-50" open>
                  <summary class="flex items-center gap-3 font-semibold p-5 cursor-pointer hover:bg-gray-50 transition-colors list-none outline-none">
                    <i data-lucide="wallet" class="w-5 h-5 text-green-600"></i> Финансовый прогноз
                  </summary>
                  <div class="p-5 border-t border-gray-50 bg-white">
                     <div class="grid grid-cols-2 gap-4 mt-2">
                       <div class="bg-gray-50 rounded-xl p-4">
                         <h4 class="text-xs text-gray-500 mb-1 flex items-center gap-1"><i data-lucide="settings" class="w-3 h-3"></i> Запчасти</h4>
                         <div class="font-bold text-lg text-gray-800"><span class="text-gray-400 font-normal mr-1">~</span>${(report.price_parts || 'Уточняется').replace(/\\n/g, '<br>')}</div>
                       </div>
                       <div class="bg-gray-50 rounded-xl p-4">
                         <h4 class="text-xs text-gray-500 mb-1 flex items-center gap-1"><i data-lucide="user-cog" class="w-3 h-3"></i> Работа СТО</h4>
                         <div class="font-bold text-lg text-gray-800"><span class="text-gray-400 font-normal mr-1">~</span>${(report.price_labor || 'Уточняется').replace(/\\n/g, '<br>')}</div>
                       </div>
                     </div>
                     <div class="mt-4 p-3 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-xs text-gray-500 flex gap-2 items-start leading-relaxed">
                        <i data-lucide="banknote" class="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400"></i>
                        <span>Указанные цены сгенерированы на основе общих рыночных данных. Они являются ориентировочными, чтобы вы понимали примерный масштаб проблемы. Точную стоимость запчастей и работ может назвать только мастер на СТО после физической диагностики.</span>
                     </div>
                  </div>
                </details>

                <div class="bg-white rounded-2xl shadow-sm border border-brand/20 p-6 text-center mt-6">
                  <div class="text-xl font-bold flex items-center justify-center gap-2 mb-2"><i data-lucide="shield-check" class="text-brand w-6 h-6"></i> Выберите план подписки</div>
                  <p class="text-green-600 font-bold mb-5 text-sm">🎁 Скидка 20% при оплате за год!</p>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
                    <div class="border border-gray-200 rounded-xl p-4 hover:border-brand/40 hover:shadow-md transition-all text-left flex flex-col justify-between cursor-pointer">
                      <div>
                        <strong class="block text-gray-800">Разовый отчет</strong>
                        <small class="text-gray-500 text-xs block mb-2">Только эта ошибка</small>
                      </div>
                      <span class="text-3xl font-extrabold text-gray-900 block mt-2">$1.99</span>
                    </div>
                    <div class="border-2 border-brand bg-blue-50/50 rounded-xl p-4 relative hover:shadow-md transition-all text-left flex flex-col justify-between cursor-pointer">
                      <span class="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-brand text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">Хит продаж</span>
                      <div>
                        <strong class="block text-brand">Мой Гараж (1 авто)</strong>
                        <small class="text-gray-600 text-xs block mb-2">Безлимит + Трекер ТО</small>
                      </div>
                      <span class="text-3xl font-extrabold text-brand block mt-2">$2.99<span class="text-sm font-normal text-gray-500">/мес</span></span>
                    </div>
                    <div class="border border-gray-200 rounded-xl p-4 hover:border-brand/40 hover:shadow-md transition-all text-left flex flex-col justify-between cursor-pointer">
                      <div>
                        <strong class="block text-gray-800">Семья (до 5 авто)</strong>
                      </div>
                      <span class="text-3xl font-extrabold text-gray-900 block mt-2">$6.99<span class="text-sm font-normal text-gray-500">/мес</span></span>
                    </div>
                    <div class="border border-gray-200 rounded-xl p-4 hover:border-brand/40 hover:shadow-md transition-all text-left flex flex-col justify-between cursor-pointer">
                      <div>
                        <strong class="block text-gray-800">Автосервис (Безлимит)</strong>
                      </div>
                      <span class="text-3xl font-extrabold text-gray-900 block mt-2">$19.99<span class="text-sm font-normal text-gray-500">/мес</span></span>
                    </div>
                  </div>
                </div>
              </div>
              `}
            </div>
          </div>
        </div>

        <nav class="fixed bottom-0 w-full bg-white border-t border-gray-100 md:hidden z-50">
          <div class="flex justify-around items-center h-16">
            <a href="#" class="flex flex-col items-center justify-center w-full h-full text-brand">
              <i data-lucide="activity" class="w-5 h-5 mb-1"></i>
              <span class="text-[10px] font-medium">Диагноз</span>
            </a>
            <a href="#" class="flex flex-col items-center justify-center w-full h-full text-gray-400 hover:text-gray-600">
              <i data-lucide="history" class="w-5 h-5 mb-1"></i>
              <span class="text-[10px] font-medium">История</span>
            </a>
            <a href="#" class="flex flex-col items-center justify-center w-full h-full text-gray-400 hover:text-gray-600">
              <i data-lucide="car" class="w-5 h-5 mb-1"></i>
              <span class="text-[10px] font-medium">Гараж</span>
            </a>
            <a href="#" class="flex flex-col items-center justify-center w-full h-full text-gray-400 hover:text-gray-600">
              <i data-lucide="user" class="w-5 h-5 mb-1"></i>
              <span class="text-[10px] font-medium">Профиль</span>
            </a>
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
        <h2>❌ Сбой получения ответа от ИИ</h2>
        <p>${error.message || 'Ошибка подключения к API'}</p>
      </div>
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

    if (!report.is_paid) {
      if (!paymentToken) {
        return res.status(400).json({ error: 'Необходим платежный токен' });
      }

      await prisma.diagnosticReport.update({
        where: { id: reportId },
        data: { is_paid: true }
      });
    }

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
