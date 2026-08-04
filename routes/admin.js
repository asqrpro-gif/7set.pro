import express from 'express';
import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { calculateSeoScore } from '../lib/seo_scanner.js';

const router = express.Router();
const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptsPath = path.join(__dirname, '../scripts');
const STATE_FILE = path.join(scriptsPath, 'generation_state.json');
const REPORT_FILE = path.join(scriptsPath, 'bad_cards_report.json');

// HTTP Basic Auth Middleware
const basicAuth = (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    const adminUser = process.env.SUPER_ADMIN_USER;
    const adminPass = process.env.SUPER_ADMIN_PASS;

    if (!adminUser || !adminPass) {
        return res.status(500).send('SUPER_ADMIN credentials are not configured in .env');
    }

    if (login && password && login === adminUser && password === adminPass) {
        return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="7Set Super Admin"');
    res.status(401).send('Требуется авторизация супер-администратора');
};

router.use(basicAuth);

// Process Management State
const activeProcesses = new Map();
const processLogs = new Map();

const getLogs = (scriptName) => processLogs.get(scriptName) || '';

const appendLog = (scriptName, data) => {
    let logs = processLogs.get(scriptName) || '';
    logs += data.toString();
    if (logs.length > 200000) {
        logs = logs.substring(logs.length - 200000);
    }
    processLogs.set(scriptName, logs);
};

// ==========================================
// 1. ДАШБОРД (ГЛАВНАЯ)
// ==========================================
router.get('/', async (req, res) => {
    try {
        // Читаем список файлов в папке scripts
        let scriptFiles = [];
        if (fs.existsSync(scriptsPath)) {
            scriptFiles = fs.readdirSync(scriptsPath).filter(f => f.endsWith('.js') && f !== 'clean_test_cards.js');
        }

        // Человекочитаемые названия скриптов
        const scriptNames = {
            'generate_seo_cards.js': 'Генерация карточек (ИИ)',
            'scan_seo.js': 'SEO Сканер и Поиск дублей',
            'delete_bad_seo.js': 'Удаление мусорных карточек'
        };

        // Собираем статусы
        const scriptsStatus = scriptFiles.map(file => ({
            file: file,
            name: scriptNames[file] || file,
            running: activeProcesses.has(file)
        }));

        res.render('admin_dashboard', {
            scripts: scriptsStatus
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Ошибка админ-панели");
    }
});

// API для статистики дашборда
router.get('/api/stats', async (req, res) => {
    try {
        const totalReports = await prisma.diagnosticReport.count();
        const publishedReports = await prisma.diagnosticReport.count({
            where: { created_at: { lte: new Date() } }
        });
        const scheduledReports = await prisma.diagnosticReport.count({
            where: { created_at: { gt: new Date() } }
        });

        let generatedToday = 0;
        try {
            if (fs.existsSync(STATE_FILE)) {
                const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
                if (state.date === new Date().toDateString()) {
                    generatedToday = state.count;
                }
            }
        } catch (e) {}

        res.json({
            totalReports,
            publishedReports,
            scheduledReports,
            generatedToday
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});


// ==========================================
// 2. УПРАВЛЕНИЕ СКРИПТАМИ (API)
// ==========================================
router.post('/api/scripts/start', (req, res) => {
    const { script } = req.body;
    if (!script) return res.status(400).json({ error: 'Укажите скрипт' });

    if (activeProcesses.has(script)) {
        return res.status(400).json({ error: 'Скрипт уже запущен' });
    }

    const scriptPath = path.join(scriptsPath, script);
    if (!fs.existsSync(scriptPath)) {
        return res.status(404).json({ error: 'Файл скрипта не найден' });
    }
    
    processLogs.set(script, `[${new Date().toLocaleString()}] ЗАПУСК СКРИПТА ${script}...\n`);
    
    const child = spawn('node', [scriptPath], {
        cwd: path.join(__dirname, '../') // запускаем из корня проекта
    });

    activeProcesses.set(script, child);

    child.stdout.on('data', (data) => appendLog(script, data));
    child.stderr.on('data', (data) => appendLog(script, data));

    child.on('close', (code) => {
        appendLog(script, `\n[${new Date().toLocaleString()}] ПРОЦЕСС ЗАВЕРШЕН С КОДОМ ${code}\n`);
        activeProcesses.delete(script);
    });

    child.on('error', (err) => {
        appendLog(script, `\n[ОШИБКА: ${err.message}]\n`);
        activeProcesses.delete(script);
    });

    res.json({ success: true, message: 'Скрипт запущен' });
});

router.post('/api/scripts/stop', (req, res) => {
    const { script } = req.body;
    const child = activeProcesses.get(script);
    if (child) {
        child.kill();
        activeProcesses.delete(script);
        appendLog(script, `\n[${new Date().toLocaleString()}] ПРОЦЕСС ОСТАНОВЛЕН АДМИНИСТРАТОРОМ\n`);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Скрипт не запущен' });
    }
});

router.get('/api/scripts/logs', (req, res) => {
    const script = req.query.script;
    res.json({ 
        running: activeProcesses.has(script),
        logs: getLogs(script)
    });
});

// ==========================================
// 3. ОПЕРАЦИИ ПО СЕО (СКАНИРОВАНИЕ И МУСОР)
// ==========================================
router.get('/seo-ops', async (req, res) => {
    try {
        let badCards = [];
        if (fs.existsSync(REPORT_FILE)) {
            const data = fs.readFileSync(REPORT_FILE, 'utf-8');
            badCards = JSON.parse(data);
        }

        res.render('admin_seo_ops', {
            cards: badCards,
            scanRunning: activeProcesses.has('scan_seo.js')
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Ошибка чтения отчета сканирования");
    }
});

router.post('/api/seo-ops/delete', async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Нет выбранных карточек' });
    }

    try {
        const result = await prisma.diagnosticReport.deleteMany({
            where: {
                id: { in: ids }
            }
        });

        // Также удаляем их из JSON отчета, чтобы они сразу пропали из UI
        if (fs.existsSync(REPORT_FILE)) {
            let badCards = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf-8'));
            badCards = badCards.filter(card => !ids.includes(card.id));
            fs.writeFileSync(REPORT_FILE, JSON.stringify(badCards, null, 2), 'utf-8');
        }

        res.json({ success: true, count: result.count });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

// ==========================================
// 4. ПОЛЬЗОВАТЕЛИ (ЗАГЛУШКА)
// ==========================================
router.get('/users', (req, res) => {
    res.render('admin_users');
});

// ==========================================
// 5. SEO ДЕТЕКТОР
// ==========================================
router.get('/seo-detector', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const take = 50;
        const skip = (page - 1) * take;

        const total = await prisma.diagnosticReport.count();
        const reports = await prisma.diagnosticReport.findMany({
            take,
            skip,
            orderBy: [
                { seoScore: 'asc' }, // Сначала самые проблемные
                { created_at: 'desc' }
            ]
        });

        res.render('admin_seo_detector', {
            reports: reports,
            page,
            totalPages: Math.ceil(total / take)
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Ошибка загрузки SEO детектора");
    }
});

// API для получения детального разбора баллов (асинхронно, при открытии модалки)
router.get('/api/seo-detector/details/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const report = await prisma.diagnosticReport.findUnique({ where: { id } });
        if (!report) return res.status(404).json({ error: 'Отчет не найден' });
        
        const { details } = await calculateSeoScore(report, prisma);
        res.json({ success: true, details });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения деталей' });
    }
});

router.post('/api/seo-detector/update', async (req, res) => {
    const { id, seoTitle, seoDescription, teaser_text, full_analysis_markdown } = req.body;
    if (!id) return res.status(400).json({ error: 'ID обязателен' });

    try {
        // Получаем текущую запись, чтобы не потерять другие поля при пересчете
        const currentReport = await prisma.diagnosticReport.findUnique({ where: { id } });
        if (!currentReport) return res.status(404).json({ error: 'Отчет не найден' });

        // Подготавливаем обновленные данные для скоринга
        const updatedData = {
            ...currentReport,
            seoTitle,
            seoDescription,
            teaser_text,
            full_analysis_markdown
        };

        const { score, risk, uniquenessScore, details } = await calculateSeoScore(updatedData, prisma);

        // Сохраняем в БД
        await prisma.diagnosticReport.update({
            where: { id },
            data: {
                seoTitle,
                seoDescription,
                teaser_text,
                full_analysis_markdown,
                seoScore: score,
                seoRisk: risk,
                uniquenessScore
            }
        });

        res.json({ success: true, score, risk, uniquenessScore, details });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сохранения' });
    }
});

// Асинхронный процесс массового сканирования
router.post('/api/seo-detector/rescan', async (req, res) => {
    // В идеале это нужно запускать через child_process, как другие скрипты, 
    // но для простоты сделаем быстрый батч-апдейт прямо тут без блокировки
    res.json({ success: true, message: 'Массовое сканирование запущено в фоне' });

    // Запускаем асинхронно
    (async () => {
        try {
            const allReports = await prisma.diagnosticReport.findMany();
            for (const report of allReports) {
                const { score, risk, uniquenessScore } = await calculateSeoScore(report, prisma);
                await prisma.diagnosticReport.update({
                    where: { id: report.id },
                    data: { seoScore: score, seoRisk: risk, uniquenessScore }
                });
            }
            console.log(`[SEO Detector] Массовое пересканирование завершено. Обновлено: ${allReports.length}`);
        } catch (e) {
            console.error('[SEO Detector] Ошибка массового сканирования:', e);
        }
    })();
});

export default router;
