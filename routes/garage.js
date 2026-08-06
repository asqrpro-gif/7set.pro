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
    res.render('garage', { page: 'garage', cars: cars });
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
