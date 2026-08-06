import { execSync, exec } from 'child_process';

console.log('🔄 Запуск обновления сайта (git pull)...');
try {
    const pullOutput = execSync('git pull', { encoding: 'utf-8', stdio: 'pipe' });
    console.log(pullOutput);
    
    console.log('✅ Обновление (git pull) завершено.');
    console.log('---------------------------------');
    console.log('Текущая версия (последний коммит):');
    
    // Получаем лог коммита
    const logOutput = execSync('git log -1 --format="%s (%cd)" --date=format:"%d.%m.%Y %H:%M"', { encoding: 'utf-8', stdio: 'pipe' });
    console.log(logOutput);
    
    console.log('---------------------------------');
    console.log('🔄 Запрос на мягкую перезагрузку сервера (pm2 reload all)...');
    
    // Используем exec, чтобы скрипт успел отдать команду до того, как PM2 убьет родительский процесс
    exec('pm2 reload all', (error, stdout, stderr) => {
        if (error) {
            console.log('⚠️ PM2 не обнаружен (вероятно, локальная среда). Бэкенд не был перезапущен.');
            return;
        }
        if (stdout) console.log(stdout);
        console.log('✅ Команда принята PM2. Сервер плавно перезагружается (Zero-Downtime Reload).');
        console.log('⏳ Админка может быть недоступна пару секунд во время релоада...');
    });
    
} catch (e) {
    console.error('❌ Ошибка при обновлении:');
    console.error(e.stderr || e.message);
}
