import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { enrichSeoCard } from '../services/seoEnrichmentService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, 'enrichment_state.json');

const prisma = new PrismaClient();
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getDailyState() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { date: new Date().toDateString(), count: 0, pausedUntil: 0 };
  }
}

async function saveDailyState(state) {
  await fs.writeFile(STATE_FILE, JSON.stringify(state), 'utf-8');
}

async function runBatchEnrichment() {
  console.log('🚀 Запуск автономного процесса пакетного pSEO обогащения...');
  
  while (true) {
    try {
      let state = await getDailyState();
      let today = new Date().toDateString();

      // Сброс лимитов при наступлении нового дня
      if (state.date !== today) {
        state = { date: today, count: 0, pausedUntil: 0 };
        await saveDailyState(state);
        console.log(`🌅 Наступили новые сутки. Лимиты сброшены.`);
      }

      // Проверка паузы (например, после 30 карточек)
      if (state.pausedUntil > Date.now()) {
        const waitTime = state.pausedUntil - Date.now();
        console.log(`⏳ Скрипт на паузе. Ожидание ${Math.ceil(waitTime / 60000)} минут...`);
        await sleep(waitTime);
        continue;
      }

      // Проверка суточного лимита (60 карточек)
      if (state.count >= 60) {
        console.log(`🛑 Достигнут суточный лимит обогащений (60). Засыпаем до завтра...`);
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const msUntilTomorrow = tomorrow.getTime() - now.getTime();
        await sleep(msUntilTomorrow);
        continue;
      }

      // Ищем самую старую проблемную карточку
      const report = await prisma.diagnosticReport.findFirst({
        where: {
          seoRisk: {
            in: ['WARNING', 'DANGER']
          }
        },
        orderBy: {
          created_at: 'asc'
        }
      });

      if (!report) {
        console.log('✅ Нет карточек для обогащения (WARNING/DANGER). Спим 1 час...');
        await sleep(60 * 60 * 1000); // 1 час
        continue; // После сна проверяем заново
      }

      console.log(`\n⏳ Обогащение карточки: ${report.brand} ${report.model} ${report.code} (ID: ${report.id})`);
      
      const result = await enrichSeoCard(report, prisma);
      
      if (result.success) {
        console.log(`✅ Успешно обогащена.`);
        
        state.count += 1;
        
        if (state.count === 30) {
          console.log(`⏳ Достигнуто 30 обогащений. Ставим скрипт на паузу 1 час...`);
          state.pausedUntil = Date.now() + 60 * 60 * 1000;
          await saveDailyState(state);
          await sleep(60 * 60 * 1000);
        } else if (state.count >= 60) {
          console.log(`🛑 Достигнуто 60 обогащений. Суточный лимит исчерпан.`);
          await saveDailyState(state);
        } else {
          console.log(`⏳ Ожидание 3.5 минуты перед следующей карточкой... (Выполнено ${state.count}/60 за сегодня)`);
          await saveDailyState(state);
          await sleep(210000);
        }
      } else {
        console.error(`❌ Ошибка обогащения:`, result.error);
        
        // Проверяем лимиты API (429, quota)
        const errorStr = String(result.error).toLowerCase();
        if (errorStr.includes('quota') || errorStr.includes('429') || errorStr.includes('too many') || errorStr.includes('exhausted')) {
          console.log(`🛑 Достигнут лимит API Gemini! Ставим скрипт на паузу на 1 час...`);
          await sleep(60 * 60 * 1000); // 1 час паузы
        } else {
          // Иные ошибки API (500 и т.д.) - ждем 5 минут
          console.log(`⏳ Неизвестная ошибка API, пауза 5 минут перед новой попыткой...`);
          await sleep(5 * 60 * 1000); // 5 минут
        }
      }

    } catch (err) {
      console.error('❌ Критическая ошибка в цикле обогащения:', err);
      console.log(`⏳ Спим 5 минут перед перезапуском цикла...`);
      await sleep(5 * 60 * 1000);
    }
  }
}

// Запускаем бесконечный процесс. PM2 будет держать его живым.
runBatchEnrichment();
