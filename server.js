import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { analyzeCarErrorFast, analyzeCarErrorDeep, getFactFromDB } from './lib/gemini_clean.js';
import { renderErrorCodePage } from './lib/error_code.js';
import { marked } from 'marked';
import fs from 'fs';
import garageRouter from './routes/garage.js';
import generateSitemap from './controllers/sitemap.js';
import { seoConfig, getBrandSeo, getModelSeo, formatTitleCase } from './lib/seo_config.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3005;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// SEO-мидлвар: удаляем слеш на конце и делаем 301 редирект (борьба с дублями)
app.use((req, res, next) => {
  if (req.path.length > 1 && req.path.endsWith('/')) {
    const query = req.url.slice(req.path.length);
    const safePath = req.path.slice(0, -1).replace(/\/+/g, '/');
    return res.redirect(301, safePath + query);
  }
  next();
});

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
  str = str.replace(/^(Основные технические причины[^:]*:)/i, '### $1\n\n');
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


// Динамический Sitemap
app.get('/sitemap.xml', generateSitemap);

// 3. Главная страница (Landing Page)
app.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const brandsData = await prisma.diagnosticReport.groupBy({
      by: ['brand'],
      where: { is_complete: true, code: { not: "UNSUPPORTED" } },
      _count: { brand: true },
      orderBy: { _count: { brand: 'desc' } }
    });
    
    res.render('index', { brands: brandsData });
  } catch (err) {
    console.error("Ошибка главной:", err);
    res.status(500).send("Ошибка сервера");
  }
});

// 3.7. Страница Условий подписки
app.get('/legal/subscription', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Условия подписки — 7Set.pro</title>
      <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
      <script>
        tailwind.config = { 
          darkMode: 'class', 
          theme: { extend: { colors: { brand: '#0077FF', surface: '#F5F5F7' } } } 
        }
      </script>
      <link rel="stylesheet" href="/style.css?v=2">
      <script src="/main.js?v=2" defer></script>
      <script src="https://unpkg.com/lucide@latest"></script>
        <!-- Yandex.Metrika counter -->
        <script type="text/javascript">
            (function(m,e,t,r,i,k,a){
                m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                m[i].l=1*new Date();
                for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
                k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
            })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=111154643', 'ym');

            ym(111154643, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
        </script>
        <noscript><div><img src="https://mc.yandex.ru/watch/111154643" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
        <!-- /Yandex.Metrika counter -->
    </head>
    <body class="bg-surface dark:bg-slate-900 text-gray-900 dark:text-white font-sans antialiased min-h-screen flex flex-col justify-between">
      <div class="max-w-5xl mx-auto p-4 md:p-6 w-full">
        
        <!-- Шапка (Header) -->
        <header class="flex justify-between items-center mb-8 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
          <a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <i data-lucide="activity" style="color: #007bff;"></i>
            <span class="font-bold text-xl tracking-tight text-gray-900 dark:text-white">7Set.Pro</span> <span class="font-normal text-sm text-gray-500 dark:text-gray-400 ml-1 hidden md:inline">| Умная автодиагностика</span>
          </a>
          <div class="flex items-center gap-3">
            <a href="/garage" class="text-sm font-semibold bg-brand/10 dark:bg-brand/20 text-brand dark:text-blue-400 px-3.5 py-2 rounded-xl hover:bg-brand hover:text-white dark:hover:bg-brand dark:hover:text-white transition-all flex items-center gap-1.5 shadow-sm">
              <i data-lucide="car" class="w-4 h-4"></i> Гараж & ТО
            </a>
            <button id="theme-toggle" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors" aria-label="Переключить тему">
              <i data-lucide="moon" class="w-5 h-5 text-gray-700 dark:text-gray-300"></i>
            </button>
          </div>
        </header>

        <!-- Главное содержимое -->
        <main class="mb-12">
          <article class="prose prose-slate prose-brand dark:prose-invert max-w-4xl mx-auto bg-white dark:bg-slate-800 p-8 md:p-12 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700">
            <h1 class="text-center mb-8 text-3xl font-black">Условия предоставления платных услуг и подписки</h1>
            
            <h2 class="text-xl font-bold mt-8 mb-4 flex items-center gap-2"><i data-lucide="file-text" class="w-5 h-5 text-brand"></i> 1. Общие положения</h2>
            <p>1.1. Настоящий документ (далее — «Условия») регулирует порядок и условия предоставления платных цифровых услуг и сервисов на сайте 7Set.pro (далее — «Сайт»).</p>
            <p>1.2. Оплачивая услуги Сайта, Пользователь подтверждает, что ознакомился с настоящими Условиями, Пользовательским соглашением и Политикой конфиденциальности, и полностью с ними согласен.</p>
            <p>1.3. Исполнителем услуг выступает ИП «Штамп Сервис», ИИН/БИН 840930402816.</p>
            
            <h2 class="text-xl font-bold mt-8 mb-4 flex items-center gap-2"><i data-lucide="unlock" class="w-5 h-5 text-brand"></i> 2. Описание платных услуг</h2>
            <p>Сайт предоставляет пользователям доступ к цифровому контенту двух типов:</p>
            <p><strong>2.1. Разовая разблокировка Премиум-отчета (Единоразовый платеж):</strong></p>
            <ul>
              <li>Предоставление расширенной информации по конкретному коду ошибки OBD-II (детальное описание, инструкции по ремонту «сделай сам», финансовый прогноз, советы по защите от обмана на СТО).</li>
              <li>Доступ к оплаченному отчету предоставляется бессрочно в рамках работы Сайта.</li>
            </ul>
            <p><strong>2.2. Сервисная подписка (в разработке):</strong></p>
            <ul>
              <li>Периодическое (ежемесячное/ежегодное) предоставление доступа к расширенному функционалу Сайта (например, «Умная сервисная книжка», хранение истории автомобиля, персональные рекомендации).</li>
            </ul>
            <p><strong>2.3. Режим Бета-тестирования (Soft Launch):</strong></p>
            <ul>
              <li>На период проведения открытого бета-тестирования Сайта Исполнитель оставляет за собой право предоставлять доступ к платному контенту (Премиум-отчетам) на безвозмездной основе. Об окончании периода бесплатного доступа Пользователи будут уведомлены интерфейсом Сайта (появлением окна оплаты).</li>
            </ul>
            
            <h2 class="text-xl font-bold mt-8 mb-4 flex items-center gap-2"><i data-lucide="credit-card" class="w-5 h-5 text-brand"></i> 3. Порядок оплаты и безопасность</h2>
            <p>3.1. Стоимость разового Премиум-отчета составляет эквивалент 1,99 USD (или иную сумму, указанную на странице оплаты).</p>
            <p>3.2. Все расчеты производятся в национальной валюте (тенге / рублях / и т.д.) по курсу банка-эмитента или платежной системы на день совершения транзакции.</p>
            <p>3.3. Прием платежей осуществляется через безопасный интегрированный платежный шлюз (включая систему Robokassa). Сайт 7Set.pro не собирает, не обрабатывает и не хранит данные банковских карт Пользователей. Ввод реквизитов карты происходит на защищенной стороне платежной системы.</p>
            <p>3.4. При оформлении регулярной подписки (при наличии такого функционала) Пользователь дает согласие на автоматическое рекуррентное списание средств со своей банковской карты в начале каждого расчетного периода.</p>
            
            <h2 class="text-xl font-bold mt-8 mb-4 flex items-center gap-2"><i data-lucide="zap" class="w-5 h-5 text-brand"></i> 4. Условия доставки цифрового контента</h2>
            <p>4.1. Услуга считается оказанной в полном объеме в момент предоставления Пользователю электронного доступа к Премиум-отчету или функционалу подписки (мгновенно после успешного подтверждения транзакции платежной системой).</p>
            <p>4.2. Доступ к контенту осуществляется путем вывода информации на экран устройства Пользователя и/или отправки ссылки на указанный Пользователем адрес электронной почты.</p>
            
            <h2 class="text-xl font-bold mt-8 mb-4 flex items-center gap-2"><i data-lucide="refresh-ccw" class="w-5 h-5 text-brand"></i> 5. Политика возврата денежных средств (Refund Policy)</h2>
            <p>5.1. Поскольку Сайт предоставляет услуги по доставке цифрового контента, который предоставляется Пользователю моментально, возврат денежных средств за успешно сгенерированные и предоставленные Премиум-отчеты не осуществляется (в соответствии с законодательством о защите прав потребителей в отношении цифровых товаров).</p>
            <p>5.2. <strong>Исключения:</strong> Возврат средств возможен исключительно в следующих случаях технического сбоя на стороне Исполнителя:</p>
            <ul>
              <li>Оплата была списана, но доступ к Премиум-отчету не был предоставлен в течение 24 часов;</li>
              <li>Произошло ошибочное двойное списание средств за один и тот же запрос.</li>
            </ul>
            <p>5.3. Для оформления возврата Пользователь должен обратиться в службу поддержки по адресу <a href="mailto:support@7set.pro" class="text-brand hover:underline">support@7set.pro</a> в течение 3 (трех) календарных дней с момента списания средств, приложив квитанцию об оплате и описание технической ошибки. Срок рассмотрения заявки — до 5 рабочих дней.</p>
            <p>5.4. В случае одобрения возврата, средства возвращаются на ту же банковскую карту, с которой была произведена оплата.</p>
            
            <h2 class="text-xl font-bold mt-8 mb-4 flex items-center gap-2"><i data-lucide="x-circle" class="w-5 h-5 text-brand"></i> 6. Отмена регулярной подписки</h2>
            <p>6.1. Пользователь имеет право в любой момент отменить автопродление регулярной подписки (если она активирована) в настройках своего Личного кабинета на Сайте.</p>
            <p>6.2. При отмене подписки доступ к платному функционалу сохраняется до конца уже оплаченного расчетного периода. Пропорциональный возврат средств за неиспользованные дни не производится.</p>
            
            <h2 class="text-xl font-bold mt-8 mb-4 flex items-center gap-2"><i data-lucide="building" class="w-5 h-5 text-brand"></i> 7. Контактные данные</h2>
            <div class="bg-gray-50 dark:bg-slate-700/50 p-6 rounded-2xl not-prose text-sm text-gray-700 dark:text-gray-300">
              <p class="font-bold mb-2">ИП «Штамп Сервис»</p>
              <p><span class="text-gray-500 dark:text-gray-400">Эл. почта:</span> <a href="mailto:support@7set.pro" class="text-brand hover:underline">support@7set.pro</a></p>
              <p><span class="text-gray-500 dark:text-gray-400">Фактический адрес:</span> РК, г. Алматы, ул. Муратбаева, 136, 3 этаж, 318 офис</p>
            </div>
          </article>
        </main>

        <!-- Подвал (Footer) -->
        <footer class="mt-8 pt-8 border-t border-gray-200/80 dark:border-slate-700 text-xs text-gray-500 dark:text-gray-400">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div class="md:col-span-2">
              <a href="/" class="flex items-center gap-2 font-bold text-base text-gray-900 dark:text-white mb-2">
                <i data-lucide="activity" class="text-brand w-5 h-5"></i> 7Set.pro
              </a>
              <p class="max-w-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Интеллектуальная система экспресс-диагностики, расшифровки кодов неисправностей и точного регламентного обслуживания автомобилей.
              </p>
            </div>
            <div>
              <h4 class="font-bold text-gray-900 dark:text-gray-300 mb-2.5 uppercase tracking-wider text-[11px]">Навигация</h4>
              <ul class="space-y-2 font-medium">
                <li><a href="/" class="hover:text-brand transition-colors">Каталог ошибок OBD-II</a></li>
                <li><a href="/garage" class="hover:text-brand transition-colors">Персональный Гараж</a></li>
                <li><a href="/garage" class="hover:text-brand transition-colors">Подбор расходников</a></li>
              </ul>
            </div>
            <div>
              <h4 class="font-bold text-gray-900 dark:text-gray-300 mb-2.5 uppercase tracking-wider text-[11px]">Юридическая информация</h4>
              <ul class="space-y-2 font-medium">
                <li><a href="/legal/terms" class="hover:text-brand transition-colors">Пользовательское соглашение</a></li>
                <li><a href="/legal/privacy" class="hover:text-brand transition-colors">Политика конфиденциальности</a></li>
                <li><a href="/legal/subscription" class="hover:text-brand transition-colors">Условия подписки</a></li>
              </ul>
            </div>
          </div>
          <div class="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 text-[11px] bg-transparent">
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


// 3.1. Страница марки (Catalog Level 2)
app.get('/catalog/:make', async (req, res) => {
  const make = req.params.make.toLowerCase().trim();
  const brandName = formatTitleCase(make);
  try {
    const modelsData = await prisma.diagnosticReport.groupBy({
      by: ['model'],
      where: { brand: make, is_complete: true, code: { not: "UNSUPPORTED" } },
      _count: { model: true },
      orderBy: { _count: { model: 'desc' } }
    });
    
    const brandMap = {
      'toyota': 'toyota', 'hyundai': 'hyundai', 'kia': 'kia', 'lada': 'lada',
      'volkswagen': 'vw', 'vw': 'vw', 'skoda': 'skoda', 'renault': 'renault',
      'nissan': 'nissan', 'chevrolet': 'chevrolet', 'ford': 'ford', 'bmw': 'bmw',
      'mercedes-benz': 'mercedes-benz', 'mercedes': 'mercedes-benz', 'audi': 'audi',
      'mazda': 'mazda', 'geely': 'geely', 'chery': 'chery',
      'mitsubishi': 'mitsubishi', 'honda': 'honda', 'lexus': 'lexus', 'haval': 'haval',
      'subaru': 'subaru', 'suzuki': 'suzuki', 'opel': 'opel', 'daewoo': 'daowoo',
      'peugeot': 'peugeot', 'uaz': 'uaz', 'gaz': 'gaz', 'changan': 'changan',
      'exeed': 'exeed', 'tank': 'tank', 'jac': 'jac', 'jetour': 'jetour',
      'omoda': 'omoda', 'faw': 'faw', 'dongfeng': 'dongfeng', 'gwm': 'gwm',
      'gac': 'gac', 'byd': 'byd', 'zeekr': 'zeekr', 'voyah': 'voyah'
    };
    const logoSlug = brandMap[make] || null;
    const seoData = getBrandSeo(make);

    res.render('catalog_brand', { 
      brandName: brandName, 
      models: modelsData, 
      logoSlug,
      seoTitle: seoData?.title || null,
      seoDescription: seoData?.description || null 
    });
  } catch (err) {
    console.error("Ошибка catalog brand:", err);
    res.status(500).send("Ошибка сервера");
  }
});

// 3.2. Страница модели (Catalog Level 3)
app.get('/catalog/:make/:model', async (req, res) => {
  const make = req.params.make.toLowerCase().trim();
  const model = req.params.model.toLowerCase().trim();
  const brandName = formatTitleCase(make);
  const modelName = formatTitleCase(model);
  try {
    const codesData = await prisma.diagnosticReport.findMany({
      where: { brand: make, model: model, is_complete: true, code: { not: "UNSUPPORTED" } },
      select: { code: true, summary: true, severity: true },
      orderBy: { code: 'asc' }
    });
    
    const seoData = getModelSeo(make, model);

    res.render('catalog_model', { 
      brandName: brandName, 
      modelName: modelName, 
      codes: codesData,
      seoTitle: seoData?.title || null,
      seoDescription: seoData?.description || null
    });
  } catch (err) {
    console.error("Ошибка catalog model:", err);
    res.status(500).send("Ошибка сервера");
  }
});

// 3.3. 301 Redirect со старых ссылок
app.get('/diagnostic/:make/:model/:code', (req, res) => {
  res.redirect(301, `/catalog/${req.params.make}/${req.params.model}/${req.params.code}`);
});

// 4. Обработчик формы -> Редирект на SEO URL
app.get('/search', (req, res) => {
  const { brand, model, code } = req.query;
  if (!brand || !model || !code) return res.redirect('/');
  res.redirect(`/catalog/${brand.toLowerCase().trim()}/${model.toLowerCase().trim()}/${code.toUpperCase().trim()}`);
});

// 5. Публичная SEO-страница диагностики
app.get('/catalog/:brand/:model/:code', async (req, res) => {
  const brand = req.params.brand.toLowerCase().trim();
  const model = req.params.model.toLowerCase().trim();
  const code = req.params.code.toLowerCase().trim();

  console.log(`📡 [SEO REQ] Запрос страницы: ${brand} ${model} [${code}]`);

  const cleanRequestedCode = req.params.code.toUpperCase().trim();
  const obdRegex = /^[PBUC][0-9A-F]{4}$/i;

  const baseDescription = getFactFromDB(cleanRequestedCode);

  if (!obdRegex.test(cleanRequestedCode) || !baseDescription) {
    return res.status(404).send(renderErrorCodePage(brand, cleanRequestedCode));
  }


  try {
    let reportId;
    let severityLevel;
    let summaryText;
    let teaserText;
    let report;

    // Проверка, является ли код ложным/несуществующим до запросов к БД и ИИ
    const obdRegex = /^[PBUC][0-9A-F]{4}$/i;
    let isUnsupported = !obdRegex.test(cleanRequestedCode) || !baseDescription;

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
      // Защита от бесконечного цикла (лимиты Gemini): не удаляем свежие заглушки (созданные менее 1 часа назад)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const isRecentStub = existingReport.created_at && new Date(existingReport.created_at) > oneHourAgo;

      if (isCachedStub && !isUnsupported) {
        if (isRecentStub) {
          console.log('⏳ [АВТО-БЛОКИРОВКА] Обнаружена свежая заглушка (менее 1 часа). Оставляем кэш, чтобы не спамить ИИ при исчерпанных лимитах.');
        } else {
          console.log('🔄 [ОЧИСТКА КЭША] В БД обнаружен старый ошибочный кэш заглушки для реального кода! Удаляем и запрашиваем свежий ИИ-отчет...');
          await prisma.diagnosticReport.delete({ where: { id: existingReport.id } }).catch(() => { });
          existingReport = null;
        }
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
          try {
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
          } catch (error) {
            if (error.code === 'P2025') {
              console.log('Запись удалена, игнорируем');
              return;
            }
            console.error("❌ Ошибка при фоновом обновлении отчета:", error);
          }
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

    let relatedReports = [];
    if (!isUnsupportedReport) {
      relatedReports = await prisma.diagnosticReport.findMany({
        where: { brand: targetBrand, model: targetModel, is_complete: true, code: { not: targetCode } },
        take: 6,
        orderBy: { created_at: 'desc' }
      });
    }

    const baseUrl = process.env.SITE_URL || 'https://7set.pro';

    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Главная", "item": baseUrl },
        { "@type": "ListItem", "position": 2, "name": displayBrand, "item": `${baseUrl}/catalog/${encodeURIComponent(brand.toLowerCase())}` },
        { "@type": "ListItem", "position": 3, "name": displayModel, "item": `${baseUrl}/catalog/${encodeURIComponent(brand.toLowerCase())}/${encodeURIComponent(model.toLowerCase())}` },
        { "@type": "ListItem", "position": 4, "name": isUnsupportedReport ? 'Неизвестный' : displayCode }
      ]
    };
    const pageUrl = isUnsupportedReport ? `${baseUrl}/catalog/unknown-code` : `${baseUrl}/catalog/${brand.toLowerCase()}/${model.toLowerCase()}/${code.toUpperCase()}`;
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
      "image": ogImage,
      "datePublished": report && report.created_at ? report.created_at.toISOString() : new Date().toISOString(),
      "dateModified": report && report.updated_at ? report.updated_at.toISOString() : new Date().toISOString(),
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

    if (!isUnlockedForUser) {
      techArticleSchema.isAccessibleForFree = "False";
      techArticleSchema.hasPart = [
        {
          "@type": "WebPageElement",
          "isAccessibleForFree": "False",
          "cssSelector": ".paywall-blur-container"
        }
      ];
    }

    let rawFullAnalysis = report.full_analysis_markdown || '';
    let rawScamProtection = '';

    const splitRegex = /###\s*(<i[^>]*>\s*<\/i>\s*)?Как не лохануться на СТО/i;
    const splitMatch = rawFullAnalysis.match(splitRegex);

    if (splitMatch) {
      rawScamProtection = rawFullAnalysis.substring(splitMatch.index + splitMatch[0].length).trim();
      rawFullAnalysis = rawFullAnalysis.substring(0, splitMatch.index).trim();
    } else {
      rawScamProtection = report.sto_protection_tips || '';
    }

    let fullAnalysisHtml = cleanReportHtml(marked.parse(formatReportMarkdown(rawFullAnalysis)));
    let scamProtectionHtml = cleanReportHtml(marked.parse(formatReportMarkdown(rawScamProtection)));
    let diyInstructionsHtml = cleanReportHtml(marked.parse(formatReportMarkdown(report.diy_instructions || '')));

    let relatedReportsHtml = '';
    if (relatedReports.length > 0) {
      relatedReportsHtml = `
        <div class="mt-8 mb-6">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><i data-lucide="link" class="w-5 h-5 text-brand"></i> Другие ошибки ${displayBrand} ${displayModel}</h2>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            ${relatedReports.map(r => `
              <a href="${baseUrl}/diagnostic/${encodeURIComponent(r.brand.toLowerCase())}/${encodeURIComponent(r.model.toLowerCase())}/${encodeURIComponent(r.code.toUpperCase())}" class="bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-brand/40 transition-all flex flex-col group">
                <span class="font-bold text-gray-900 dark:text-white group-hover:text-brand transition-colors text-sm">${r.code.toUpperCase()}</span>
                <span class="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">${(r.summary || '').substring(0, 60)}...</span>
              </a>
            `).join('')}
          </div>
        </div>
      `;
    }

    const schemaHtml = `<script type="application/ld+json">${JSON.stringify(techArticleSchema)}</script>\n        <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>`;

    res.render('diagnostic', {
      seoTitle,
      seoDescription,
      pageUrl,
      ogImage,
      schemaHtml,
      brand,
      model,
      displayBrand,
      displayModel,
      displayCode,
      isUnsupportedReport,
      severityClass: severityLevel === 'critical' || severityLevel === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : severityLevel === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      severityText: severity.text.replace(/<[^>]*>?/gm, ''),
      drivabilityDataClass: drivabilityData.class.replace('bg-green-100', 'bg-green-100 dark:bg-green-900/30').replace('text-green-800', 'text-green-800 dark:text-green-300').replace('bg-orange-100', 'bg-orange-100 dark:bg-orange-900/30').replace('text-orange-800', 'text-orange-800 dark:text-orange-300').replace('bg-red-100', 'bg-red-100 dark:bg-red-900/30').replace('text-red-800', 'text-red-800 dark:text-red-300'),
      drivabilityData,
      summaryText,
      teaserText,
      reportId: report ? report.id : '',
      isUnlockedForUser,
      fullAnalysisHtml,
      scamProtectionHtml,
      pricePartsHtml: (report.price_parts && report.price_parts !== 'Уточняется' ? report.price_parts.replace(/\$/g, '').trim() + ' $' : 'Уточняется').replace(/\\n/g, '<br>'),
      priceLaborHtml: (report.price_labor && report.price_labor !== 'Уточняется' ? report.price_labor.replace(/\$/g, '').trim() + ' $' : 'Уточняется').replace(/\\n/g, '<br>'),
      report,
      difficultyScoreHtml: (() => { const m = String(report && report.diy_difficulty_score ? report.diy_difficulty_score : '3/5').match(/(\d+)\s*(?:[\/|из]\s*(\d+))?/i); return m ? `${m[1]} из ${m[2] || '5'}` : '3 из 5'; })(),
      diyInstructionsHtml,
      relatedReportsHtml
    });

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

// API для поллинга статуса готовности полного отчета
app.get('/api/report-status/:id', async (req, res) => {
  try {
    const report = await prisma.diagnosticReport.findUnique({
      where: { id: req.params.id },
      select: { is_complete: true }
    });
    if (!report) {
      return res.status(404).json({ error: 'Отчет не найден' });
    }
    res.json({ is_complete: report.is_complete });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Глобальный обработчик 404 (должен быть последним маршрутом)
app.use((req, res) => {
  res.status(404).render('404', {
    seoTitle: 'Страница не найдена (404) | 7Set.Pro',
    seoDescription: 'Запрашиваемая страница не существует или была удалена.',
    pageUrl: `${process.env.SITE_URL || 'https://7set.pro'}${req.originalUrl}`
  });
});

app.listen(PORT, async () => {
  console.log(`✅ Prisma ORM подключена к MySQL!`);
  console.log(`🚀 Боевой сервер запущен на http://localhost:${PORT}`);
});
