import { execSync } from 'child_process';

console.log('🔄 Запуск обновления сайта (git pull)...');
try {
    const pullOutput = execSync('git pull', { encoding: 'utf-8', stdio: 'pipe' });
    console.log(pullOutput);
    
    console.log('✅ Обновление завершено.');
    console.log('---------------------------------');
    console.log('Текущая версия (последний коммит):');
    
    // Получаем лог коммита
    const logOutput = execSync('git log -1 --format="%s (%cd)" --date=format:"%d.%m.%Y %H:%M"', { encoding: 'utf-8', stdio: 'pipe' });
    console.log(logOutput);
    
} catch (e) {
    console.error('❌ Ошибка при обновлении:');
    console.error(e.stderr || e.message);
}
