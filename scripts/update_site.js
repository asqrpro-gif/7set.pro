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
    
    // Используем exec, чтобы получить список процессов, исключить seo-generator и перезагрузить остальные
    exec('pm2 jlist', (error, stdout, stderr) => {
        if (error) {
            console.log('⚠️ PM2 не обнаружен (вероятно, локальная среда). Бэкенд не был перезапущен.');
            return;
        }
        
        try {
            const processes = JSON.parse(stdout);
            // Исключаем seo-generator из списка перезагрузки
            const targetNames = processes
                .map(p => p.name)
                .filter(name => !name.includes('seo-generator') && !name.includes('generate_seo_cards'));
                
            if (targetNames.length > 0) {
                const reloadCmd = `pm2 reload ${targetNames.join(' ')}`;
                console.log(`🔄 Исключаем seo-generator. Выполняем: ${reloadCmd}`);
                exec(reloadCmd, (err, out, std) => {
                    if (out) console.log(out);
                    console.log('✅ Команда принята PM2. Сервер плавно перезагружается (Zero-Downtime Reload).');
                    console.log('⏳ Админка может быть недоступна пару секунд во время релоада...');
                });
            } else {
                 console.log('⚠️ Не найдено процессов для перезагрузки (кроме исключенных).');
            }
        } catch (err) {
            // Фолбэк на случай ошибки парсинга
            console.log('⚠️ Не удалось получить список процессов. Фолбэк: pm2 reload all');
            exec('pm2 reload all', (err, out) => {
                if (out) console.log(out);
            });
        }
    });
    
} catch (e) {
    console.error('❌ Ошибка при обновлении:');
    console.error(e.stderr || e.message);
}
