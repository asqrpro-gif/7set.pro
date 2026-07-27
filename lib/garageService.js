import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Лимиты для тарифов (количество автомобилей в Гараже)
export const PLAN_LIMITS = {
  single: 1,
  multi: 5,
  pro: Infinity // Безлимит для СТО и автоподборщиков
};

/**
 * Проверка возможности добавить авто в гараж по тарифу пользователя
 */
export async function canAddCar(userId, userPlan = 'single') {
  const currentCount = await prisma.carGarage.count({
    where: { userId: userId }
  });
  
  const limit = PLAN_LIMITS[userPlan] || 1;
  return currentCount < limit;
}

/**
 * Получить все автомобили пользователя из гаража
 */
export async function getUserCars(userId) {
  return await prisma.carGarage.findMany({
    where: { userId: userId },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Получить конкретный автомобиль по ID из гаража пользователя
 */
export async function getCarById(userId, carId) {
  return await prisma.carGarage.findFirst({
    where: {
      id: carId,
      userId: userId
    }
  });
}

/**
 * Добавить автомобиль в гараж с предварительной проверкой лимита тарифа
 */
export async function addCarToGarage(userId, userPlan, carData) {
  const allowed = await canAddCar(userId, userPlan);
  if (!allowed) {
    const limit = PLAN_LIMITS[userPlan] || 1;
    throw new Error(`Достигнут лимит автомобилей (${limit}) для тарифа "${userPlan.toUpperCase()}". Обновите подписку для добавления новых машин!`);
  }

  return await prisma.carGarage.create({
    data: {
      userId: userId,
      brand: carData.brand.trim(),
      model: carData.model.trim(),
      engine: carData.engine ? carData.engine.trim() : 'Стандартный',
      year: parseInt(carData.year, 10) || new Date().getFullYear(),
      consumablesJson: typeof carData.consumablesJson === 'string' 
        ? carData.consumablesJson 
        : JSON.stringify(carData.consumablesJson || {})
    }
  });
}

/**
 * Удалить автомобиль из гаража
 */
export async function removeCarFromGarage(userId, carId) {
  return await prisma.carGarage.deleteMany({
    where: {
      id: carId,
      userId: userId
    }
  });
}

export default {
  PLAN_LIMITS,
  canAddCar,
  getUserCars,
  getCarById,
  addCarToGarage,
  removeCarFromGarage
};
