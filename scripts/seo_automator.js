import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCAN_SCRIPT = path.join(__dirname, 'scan_seo.js');
const RESET_SCRIPT = path.join(__dirname, 'reset_bad_seo_cards.js');

function runScript(scriptPath, name) {
  return new Promise((resolve, reject) => {
    console.log(`[Автоматизатор] Запуск ${name}...`);
    const proc = spawn('node', [scriptPath], { stdio: 'inherit' });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`[Автоматизатор] ✅ ${name} успешно завершен.`);
        resolve();
      } else {
        console.error(`[Автоматизатор] ❌ ${name} завершился с ошибкой (Код: ${code}).`);
        reject(new Error(`${name} failed with code ${code}`));
      }
    });
  });
}

async function runSeoCycle() {
  console.log(`\n======================================================`);
  console.log(`🕒 Запуск автоматического SEO-цикла: ${new Date().toLocaleString()}`);
  console.log(`======================================================\n`);
  
  try {
    // Шаг 1: Сканируем базу на наличие мусора и нарушений SEO-стандартов
    await runScript(SCAN_SCRIPT, 'Сканнер SEO (scan_seo.js)');
    
    console.log('[Автоматизатор] Ожидание 5 секунд перед сбросом статуса...');
    await new Promise(res => setTimeout(res, 5000));
    
    // Шаг 2: Сбрасываем статус найденных карточек в DANGER
    await runScript(RESET_SCRIPT, 'Сброс карточек (reset_bad_seo_cards.js)');
    
    console.log(`\n======================================================`);
    console.log(`✅ SEO-цикл завершен. Забракованные карточки переданы в очередь.`);
    console.log(`Они будут автоматически подхвачены скриптом enrich_seo_batch.js.`);
    console.log(`Следующий запуск через 24 часа.`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error(`[Автоматизатор] ❌ Ошибка в SEO-цикле:`, err);
  }
}

// Интервал - 24 часа
const INTERVAL_MS = 24 * 60 * 60 * 1000;

console.log('🚀 Запущен Автоматизатор SEO-циклов.');
console.log(`Скрипты сканирования и сброса будут запускаться раз в сутки.`);

// Делаем первый запуск через 10 секунд после старта автоматизатора
setTimeout(() => {
  runSeoCycle();
  
  // Последующие запуски раз в 24 часа
  setInterval(runSeoCycle, INTERVAL_MS);
}, 10000);
