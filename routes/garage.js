import express from 'express';
import { PrismaClient } from '@prisma/client';
import { canAddCar, getUserCars } from '../lib/garageService.js';
import { analyzeCarConsumables } from '../lib/gemini_clean.js';

const router = express.Router();
const prisma = new PrismaClient();

// Временная заглушка для тестов (пока не прикрутим реальную авторизацию)
const MOCK_USER_ID = "user-12345"; 
const MOCK_PLAN = "single"; // Лимит: 1 авто

// GET: Отрисовка страницы гаража и вывод списка машин
router.get('/', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : MOCK_USER_ID;
    const cars = await getUserCars(userId);
    
    // Если клиент запрашивает чистый JSON
    if (req.query.format === 'json' || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html'))) {
      return res.json({ title: "Мой Гараж", cars: cars });
    }

    // Иначе рендерим красивый HTML интерфейс кабинета и гаража
    const carsHtml = cars.length > 0 ? cars.map(car => {
      let cons = {};
      try { cons = typeof car.consumablesJson === 'string' ? JSON.parse(car.consumablesJson) : car.consumablesJson; } catch(e){}
      return `
        <div class="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative">
          <div class="flex justify-between items-start mb-3">
            <div>
              <h3 class="font-bold text-lg text-gray-900">${car.brand} ${car.model}</h3>
              <p class="text-xs text-gray-500">${car.engine} • ${car.year} г.в.</p>
            </div>
            <button onclick="deleteCarFromGarage('${car.id}')" class="text-red-400 hover:text-red-600 p-1 rounded-lg transition-colors" title="Удалить авто">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
          <div class="space-y-1.5 text-xs text-gray-700 bg-gray-50 p-3.5 rounded-xl border border-gray-100">
            <div><b>💧 Масло:</b> ${cons.oil?.type || 'N/A'} (${cons.oil?.spec || 'N/A'}, ${cons.oil?.volume_liters || 0} л)</div>
            <div><b>🧹 Дворники:</b> Водитель ${cons.wipers?.driver_mm || 0} мм / Пассажир ${cons.wipers?.passenger_mm || 0} мм</div>
            <div><b>⛽ Топливо:</b> ${cons.fuel?.type || 'N/A'}</div>
            <div><b>❄️ Антифриз:</b> ${cons.coolant?.type || 'N/A'} (${cons.coolant?.color || ''})</div>
          </div>
        </div>
      `;
    }).join('') : `<p class="text-gray-500 text-sm italic col-span-full text-center py-8">В вашем гараже пока нет автомобилей. Добавьте первую машину выше!</p>`;

    res.send(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Мой Гараж и Тарифы — 7Set.Pro</title>
        <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
        <script>tailwind.config = { theme: { extend: { colors: { brand: '#0077FF', surface: '#F5F5F7' } } } }</script>     
        <link rel="stylesheet" href="/style.css">
        <script src="/main.js" defer></script>
        <script src="https://unpkg.com/lucide@latest"></script>
      </head>
      <body class="bg-surface text-gray-900 font-sans antialiased min-h-screen flex flex-col justify-between">
        <div class="max-w-4xl mx-auto p-4 md:p-6 w-full">
          <!-- Шапка -->
          <header class="flex justify-between items-center mb-8 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <i data-lucide="activity" style="color: #007bff;"></i>
              <span class="font-bold text-xl tracking-tight">7Set.Pro</span> 
              <span class="font-normal text-sm text-gray-500 ml-1 hidden md:inline">| Умный Гараж & ТО</span>
            </a>
            <div class="flex items-center gap-3">
              <a href="/" class="text-sm font-medium text-gray-600 hover:text-brand transition-colors">На главную</a>
              <button id="theme-toggle" class="p-2 rounded-full hover:bg-gray-100 transition-colors" aria-label="Переключить тему">
                <i data-lucide="moon" class="w-5 h-5 text-gray-700"></i>
              </button>
            </div>
          </header>

          <!-- Секция Тарифов -->
          <div class="pricing-section bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 mb-8">
            <div class="text-center max-w-lg mx-auto mb-6">
              <h2 class="text-2xl md:text-3xl font-bold mb-2">Выберите тариф для Гаража</h2>
              <p class="text-gray-500 text-sm">Подписка дает доступ к мгновенному ИИ-подбору заправочных объемов, допусков масел и размеров запчастей.</p>
            </div>
            <div class="tariffs grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="border border-gray-200 rounded-2xl p-5 text-center flex flex-col justify-between hover:border-brand/40 transition-colors">
                <div>
                  <h3 class="font-bold text-lg mb-1">1 Авто</h3>
                  <p class="text-xs text-gray-500 mb-4">Для личного пользования</p>
                  <div class="text-2xl font-black text-brand mb-4">$3 <span class="text-xs font-normal text-gray-500">/ мес</span></div>
                </div>
                <button type="button" onclick="selectPlan('single')" class="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold py-2.5 rounded-xl text-sm transition-colors">Выбрать базовый</button>
              </div>

              <div class="border-2 border-brand rounded-2xl p-5 text-center flex flex-col justify-between relative shadow-md bg-blue-50/20">
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">Популярный</div>
                <div>
                  <h3 class="font-bold text-lg mb-1">До 5 Авто</h3>
                  <p class="text-xs text-gray-500 mb-4">Для семьи и автолюбителей</p>
                  <div class="text-2xl font-black text-brand mb-4">$7 <span class="text-xs font-normal text-gray-500">/ мес</span></div>
                </div>
                <button type="button" onclick="selectPlan('multi')" class="w-full bg-brand hover:bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors shadow-sm">Подключить семью</button>
              </div>

              <div class="border border-gray-200 rounded-2xl p-5 text-center flex flex-col justify-between hover:border-brand/40 transition-colors">
                <div>
                  <h3 class="font-bold text-lg mb-1">Безлимит</h3>
                  <p class="text-xs text-gray-500 mb-4">Для автоподбора и СТО</p>
                  <div class="text-2xl font-black text-brand mb-4">$29 <span class="text-xs font-normal text-gray-500">/ мес</span></div>
                </div>
                <button type="button" onclick="selectPlan('pro')" class="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">Тариф для профи</button>
              </div>
            </div>
          </div>

          <!-- Форма Добавления Авто -->
          <div class="garage-add-car bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 mb-8">
            <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
              <i data-lucide="plus-circle" class="text-brand"></i>
              Добавить автомобиль в Гараж
            </h2>
            <form id="add-car-form" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <input type="text" id="car-brand" placeholder="Марка (напр. Toyota)" class="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none" required>
              <input type="text" id="car-model" placeholder="Модель (напр. Camry)" class="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none" required>
              <input type="text" id="car-engine" placeholder="Двигатель (напр. 2.5 2AR-FE)" class="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none" required>
              <input type="number" id="car-year" placeholder="Год (напр. 2018)" class="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none" required>
              <div class="sm:col-span-2 md:col-span-4 mt-2">
                <button type="submit" class="w-full bg-brand text-white font-semibold rounded-xl py-3.5 hover:bg-blue-600 transition-colors shadow-sm flex justify-center items-center gap-2">
                  <i data-lucide="sparkles" class="w-4 h-4"></i> Подобрать ТО через ИИ
                </button>
              </div>
            </form>
            <div id="consumables-result" class="result-card" style="display: none;"></div>
          </div>

          <!-- Список Автомобилей в Гараже -->
          <div class="saved-cars-section mb-12">
            <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
              <i data-lucide="car" class="text-brand"></i>
              Сохранённый автопарк (${cars.length})
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              ${carsHtml}
            </div>
          </div>
        </div>

        <!-- Подвал -->
        <footer class="bg-white border-t border-gray-100 py-6 text-center text-xs text-gray-500 mt-auto">
          <div class="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>© ${new Date().getFullYear()} 7Set.Pro — Умная автодиагностика и регламент ТО.</div>
            <div class="flex gap-4">
              <a href="/legal/terms" class="hover:underline">Оферта</a>
              <a href="/legal/privacy" class="hover:underline">Конфиденциальность</a>
            </div>
          </div>
        </footer>
        <script>lucide.createIcons();</script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка загрузки гаража" });
  }
});

// POST: Добавление нового авто в гараж
router.post('/add', async (req, res) => {
  try {
    const { brand, model, engine, year } = req.body;
    if (!brand || !model || !year) {
      return res.status(400).json({ error: "Укажите марку, модель и год выпуска автомобиля" });
    }

    const userId = req.user ? req.user.id : MOCK_USER_ID;
    const userPlan = req.user ? req.user.planType : MOCK_PLAN;

    // 1. Проверяем лимиты тарифа
    const allowed = await canAddCar(userId, userPlan);
    if (!allowed) {
      return res.status(403).json({ 
        error: "Достигнут лимит автомобилей для вашего тарифа. Обновите подписку (planType)." 
      });
    }

    // 2. Спрашиваем расходники у ИИ
    const consumables = await analyzeCarConsumables(brand, model, engine || "Стандартный", year);

    // 3. Сохраняем результат в базу данных (кешируем)
    const newCar = await prisma.carGarage.create({
      data: {
        userId,
        brand: brand.trim(),
        model: model.trim(),
        engine: engine ? engine.trim() : "Стандартный",
        year: parseInt(year, 10) || new Date().getFullYear(),
        consumablesJson: JSON.stringify(consumables) // Кладем чистый JSON
      }
    });

    res.json({ success: true, message: "Авто добавлено!", car: newCar });

  } catch (error) {
    console.error("Сбой при добавлении авто:", error);
    res.status(500).json({ error: error.message || "Ошибка сервера при подборе ТО" });
  }
});

// DELETE: Удаление авто из гаража
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : MOCK_USER_ID;
    const carId = req.params.id;
    await prisma.carGarage.deleteMany({
      where: { id: carId, userId }
    });
    res.json({ success: true, message: "Автомобиль удален из гаража" });
  } catch (error) {
    console.error("Ошибка при удалении авто:", error);
    res.status(500).json({ error: "Ошибка при удалении авто" });
  }
});

export default router;
