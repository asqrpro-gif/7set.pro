import express from 'express';
import { PrismaClient } from '@prisma/client';
import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { calculateSeoScore } from '../lib/seo_scanner.js';
import { enrichSeoCard } from '../services/seoEnrichmentService.js';
import { enrichReportText } from '../lib/seoEnricher.js';
const router = express.Router();
const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptsPath = path.join(__dirname, '../scripts');
const STATE_FILE = path.join(scriptsPath, 'generation_state.json');
const REPORT_FILE = path.join(scriptsPath, 'bad_cards_report.json');
const PING_FILE = path.join(scriptsPath, 'sitemap_ping.json');

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
            scriptFiles = fs.readdirSync(scriptsPath).filter(f => f.endsWith('.js') && !['clean_test_cards.js', 'migrate_retroactive.js', 'clean_artifacts.js'].includes(f));
        }

        // Человекочитаемые названия скриптов
        const scriptNames = {
            'enrich_seo_batch.js': 'Массовое pSEO обогащение',
            'generate_seo_cards.js': 'Генерация карточек (ИИ)',
            'reset_seo.js': 'Сброс SEO оценок',
            'scan_seo.js': 'SEO Сканер и Поиск дублей',
            'deduplicate.js': 'Удаление дублей',
            'delete_bad_seo.js': 'Удаление мусорных карточек',
            'scan_links.js': 'Радар ссылок (Orphans/404)',
            'update_site.js': 'Обновление сайта (Git Pull)'
        };

        const scriptOrder = [
            'update_site.js',
            'enrich_seo_batch.js',
            'generate_seo_cards.js',
            'reset_seo.js',
            'scan_seo.js',
            'deduplicate.js',
            'delete_bad_seo.js'
        ];

        scriptFiles.sort((a, b) => {
            let indexA = scriptOrder.indexOf(a);
            let indexB = scriptOrder.indexOf(b);
            if (indexA === -1) indexA = 999;
            if (indexB === -1) indexB = 999;
            return indexA - indexB;
        });

        // Собираем статусы
        const scriptsStatus = scriptFiles.map(file => {
            let gitInfo = null;
            if (file === 'update_site.js') {
                try {
                    const repoPath = path.join(__dirname, '..');
                    const gitMsg = execSync('git log -1 --format="%s"', { encoding: 'utf-8', cwd: repoPath }).trim();
                    const gitDate = execSync('git log -1 --format="%cd" --date=format:"%d.%m.%Y %H:%M"', { encoding: 'utf-8', cwd: repoPath }).trim();
                    gitInfo = `${gitMsg} (${gitDate})`;
                } catch (e) {
                    console.error('Ошибка получения git info:', e.message);
                }
            }
            return {
                file: file,
                name: scriptNames[file] || file,
                running: activeProcesses.has(file),
                gitInfo: gitInfo
            };
        });

        // Собираем статистику для умного Sitemap
        let sitemapUrlCount = await prisma.diagnosticReport.count({
            where: {
                code: { not: 'UNSUPPORTED' },
                seoRisk: { not: 'DANGER' },
                created_at: { lte: new Date() }
            }
        });
        
        // Добавляем статические страницы (Главная, Каталог, Оферта)
        sitemapUrlCount += 3;

        let lastPing = null;
        try {
            if (fs.existsSync(PING_FILE)) {
                const pingData = JSON.parse(fs.readFileSync(PING_FILE, 'utf-8'));
                lastPing = pingData.date;
            }
        } catch (e) {}

        const sitemapStats = {
            urlCount: sitemapUrlCount,
            limit: 45000,
            lastPing: lastPing,
            isIndex: sitemapUrlCount > 45000,
            chunksCount: Math.ceil(sitemapUrlCount / 45000)
        };

        // Собираем стату для Радара перелинковки
        let linksStats = { orphansCount: 0, brokenLinksCount: 0, lastScan: null };
        const LINKS_REPORT_FILE = path.join(__dirname, '../scripts/links_report.json');
        try {
            if (fs.existsSync(LINKS_REPORT_FILE)) {
                const linksData = JSON.parse(fs.readFileSync(LINKS_REPORT_FILE, 'utf-8'));
                linksStats.orphansCount = Array.isArray(linksData.orphans) ? linksData.orphans.length : 0;
                linksStats.brokenLinksCount = Array.isArray(linksData.brokenLinks) ? linksData.brokenLinks.length : 0;
                
                if (linksData.last_scan) {
                    const scanDate = new Date(linksData.last_scan);
                    linksStats.lastScan = scanDate.toLocaleString('ru-RU', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });
                }
            }
        } catch (e) {
            console.error('Error reading links_report.json:', e);
        }

        res.render('admin_dashboard', {
            scripts: scriptsStatus,
            sitemapStats: sitemapStats,
            linksStats: linksStats
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

// API для пинга Sitemap
router.post('/api/sitemap/ping', async (req, res) => {
    try {
        const sitemapUrl = encodeURIComponent('https://7set.pro/sitemap.xml');
        // Google отключил свой /ping endpoint в начале 2024 года (возвращает 404).
        // Поэтому мы пингуем Bing и Яндекс, которые всё ещё поддерживают этот метод.
        const bingUrl = `https://www.bing.com/ping?sitemap=${sitemapUrl}`;
        const yandexUrl = `https://webmaster.yandex.ru/ping?sitemap=${sitemapUrl}`;
        
        // Отправляем запросы (не дожидаясь ответа, чтобы не вешать интерфейс)
        fetch(bingUrl).catch(() => {});
        fetch(yandexUrl).catch(() => {});
        
        const dateStr = new Date().toLocaleString('ru-RU');
        fs.writeFileSync(PING_FILE, JSON.stringify({ date: dateStr }), 'utf-8');
        return res.json({ success: true, date: dateStr });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Ошибка при отправке запроса' });
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
        child.kill('SIGKILL');
        activeProcesses.delete(script);
        appendLog(script, `\n[${new Date().toLocaleString()}] ПРОЦЕСС ЖЕСТКО ОСТАНОВЛЕН АДМИНИСТРАТОРОМ (SIGKILL)\n`);
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
        const riskFilter = req.query.risk;
        const showDuplicates = req.query.duplicates === 'true';
        const publishStatus = req.query.publish_status;
        const sortField = req.query.sort || 'seoScore';
        const sortOrder = req.query.order === 'desc' ? 'desc' : 'asc';

        const baseWhere = {};
        if (publishStatus === 'PUBLISHED') {
            baseWhere.created_at = { lte: new Date() };
        } else if (publishStatus === 'UNPUBLISHED') {
            baseWhere.created_at = { gt: new Date() };
        }

        const whereClause = { ...baseWhere };
        if (riskFilter && riskFilter !== 'ALL') {
            if (riskFilter === 'WARNING') {
                whereClause.seoRisk = { in: ['WARNING', 'DANGER'] };
            } else {
                whereClause.seoRisk = riskFilter;
            }
        }

        const duplicatesGrouped = await prisma.diagnosticReport.groupBy({
            by: ['brand', 'model', 'code'],
            having: {
                id: { _count: { gt: 1 } }
            },
            _count: { id: true }
        });

        const duplicatesCount = duplicatesGrouped.reduce((sum, d) => sum + d._count.id, 0);

        if (showDuplicates) {
            if (duplicatesGrouped.length > 0) {
                whereClause.OR = duplicatesGrouped.map(d => ({
                    brand: d.brand,
                    model: d.model,
                    code: d.code
                }));
            } else {
                // Если дубликатов нет, возвращаем пустой результат
                whereClause.id = 'none';
            }
        }

        // Получаем общее количество для пагинации
        const total = await prisma.diagnosticReport.count({ where: whereClause });
        
        // Получаем общую статистику для вкладок Risk (с учетом текущего publishStatus)
        const safeCount = await prisma.diagnosticReport.count({ where: { ...baseWhere, seoRisk: 'SAFE' } });
        const warningCount = await prisma.diagnosticReport.count({ where: { ...baseWhere, seoRisk: { in: ['WARNING', 'DANGER'] } } });
        const totalCount = await prisma.diagnosticReport.count({ where: baseWhere });

        // Базовое условие для подсчета статусов публикации (с учетом текущего riskFilter)
        const baseWhereForPublish = {};
        if (riskFilter && riskFilter !== 'ALL') {
            if (riskFilter === 'WARNING') baseWhereForPublish.seoRisk = { in: ['WARNING', 'DANGER'] };
            else baseWhereForPublish.seoRisk = riskFilter;
        }

        // Получаем статистику для вкладок Publish
        const publishedCount = await prisma.diagnosticReport.count({ where: { ...baseWhereForPublish, created_at: { lte: new Date() } } });
        const unpublishedCount = await prisma.diagnosticReport.count({ where: { ...baseWhereForPublish, created_at: { gt: new Date() } } });
        const totalPublishCount = await prisma.diagnosticReport.count({ where: baseWhereForPublish });

        let orderBy = [];
        if (sortField === 'seoScore') {
            orderBy.push({ seoScore: sortOrder });
        } else if (sortField === 'uniquenessScore') {
            orderBy.push({ uniquenessScore: sortOrder });
        } else if (sortField === 'seoRisk') {
            orderBy.push({ seoRisk: sortOrder });
        } else if (sortField === 'brand') {
            orderBy.push({ brand: sortOrder });
            orderBy.push({ model: sortOrder });
            orderBy.push({ code: sortOrder });
        } else if (sortField === 'created_at') {
            orderBy.push({ created_at: sortOrder });
        }
        
        if (sortField !== 'created_at') {
            orderBy.push({ created_at: 'desc' });
        }

        const reports = await prisma.diagnosticReport.findMany({
            where: whereClause,
            take,
            skip,
            orderBy: orderBy
        });

        // Статистика фонового сканирования
        const totalCards = await prisma.diagnosticReport.count();
        const unscannedCount = await prisma.diagnosticReport.count({ where: { seoScore: 0 } });
        const scannedCount = totalCards - unscannedCount;
        
        let lastScanTime = null;
        try {
            const scanStatePath = path.join(__dirname, '../scripts', 'last_scan_time.json');
            if (fs.existsSync(scanStatePath)) {
                const stateData = JSON.parse(fs.readFileSync(scanStatePath, 'utf-8'));
                lastScanTime = new Date(stateData.time).toLocaleString('ru-RU');
            }
        } catch (e) {
            console.error(e);
        }

        // Собираем стату для Радара перелинковки
        let linksStats = { lastScan: null };
        let orphans = [];
        let brokenLinks = [];
        const LINKS_REPORT_FILE = path.join(__dirname, '../scripts/links_report.json');
        try {
            if (fs.existsSync(LINKS_REPORT_FILE)) {
                const data = JSON.parse(fs.readFileSync(LINKS_REPORT_FILE, 'utf-8'));
                orphans = Array.isArray(data.orphans) ? data.orphans : [];
                brokenLinks = Array.isArray(data.brokenLinks) ? data.brokenLinks : [];
                if (data.last_scan) {
                    const scanDate = new Date(data.last_scan);
                    linksStats.lastScan = scanDate.toLocaleString('ru-RU', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });
                }
            }
        } catch (e) {
            console.error('Ошибка чтения links_report.json', e);
        }

        const mode = req.query.mode || 'seo';

        res.render('admin_seo_detector', {
            reports: reports,
            page,
            totalPages: Math.ceil(total / take) || 1,
            currentRisk: riskFilter || 'ALL',
            currentPublishStatus: publishStatus || '',
            showDuplicates: showDuplicates,
            duplicatesCount: duplicatesCount,
            currentSort: sortField,
            currentOrder: sortOrder,
            mode: mode,
            linksStats: linksStats,
            orphans: orphans,
            brokenLinks: brokenLinks,
            stats: {
                safe: safeCount,
                warning: warningCount,
                total: totalCount
            },
            publishStats: {
                published: publishedCount,
                unpublished: unpublishedCount,
                total: totalPublishCount
            },
            scanStats: {
                scanned: scannedCount,
                total: totalCards,
                lastScanTime: lastScanTime
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Ошибка загрузки SEO детектора");
    }
});

// API для ручного pSEO обогащения
router.post('/api/seo/enrich-single', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID обязателен' });

    try {
        const report = await prisma.diagnosticReport.findUnique({ where: { id } });
        if (!report) return res.status(404).json({ error: 'Отчет не найден' });

        const result = await enrichSeoCard(report, prisma);
        if (result.success) {
            res.json({ success: true, report: result.report });
        } else {
            res.status(500).json({ error: result.error });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера при обогащении' });
    }
});

// API для получения детального разбора баллов (асинхронно, при открытии модалки)
// Получение полных данных карточки по ID (для модалки из таблицы битых ссылок)
router.get('/api/seo-detector/report/:id', async (req, res) => {
    try {
        const report = await prisma.diagnosticReport.findUnique({
            where: { id: req.params.id }
        });
        if (!report) return res.json({ success: false, error: 'Не найдено' });
        res.json({ success: true, report });
    } catch (e) {
        console.error(e);
        res.json({ success: false, error: 'Ошибка' });
    }
});

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

router.post('/api/seo-detector/publish', async (req, res) => {
    try {
        const { id } = req.body;
        // Устанавливаем created_at в текущее время (Опубликовано)
        await prisma.diagnosticReport.update({
            where: { id },
            data: { created_at: new Date() }
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка публикации' });
    }
});

router.post('/api/seo-detector/unpublish', async (req, res) => {
    try {
        const { id } = req.body;
        // Устанавливаем created_at в 2099 год (Отложено)
        const futureDate = new Date('2099-01-01T00:00:00Z');
        await prisma.diagnosticReport.update({
            where: { id },
            data: { created_at: futureDate }
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка снятия с публикации' });
    }
});

router.post('/api/seo-detector/delete', async (req, res) => {
    try {
        const { id } = req.body;
        await prisma.diagnosticReport.delete({
            where: { id }
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка удаления' });
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

// УДАЛЕНИЕ 404 ССЫЛКИ
router.post('/api/links/remove-404', async (req, res) => {
    try {
        const { id, url } = req.body;
        const report = await prisma.diagnosticReport.findUnique({ where: { id } });
        if (!report) return res.status(404).json({ error: 'Карточка не найдена' });

        // Экранируем URL для Regex
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\[([^\\]]+)\\]\\(${escapeRegExp(url)}\\)`, 'g');

        const fields = ['full_analysis_markdown', 'pro_tips_md', 'tools_table_md', 'oem_parts_table_md'];
        const updates = {};
        let modified = false;

        for (const field of fields) {
            if (report[field]) {
                const newContent = report[field].replace(regex, '$1');
                if (newContent !== report[field]) {
                    updates[field] = newContent;
                    modified = true;
                }
            }
        }

        if (modified) {
            await prisma.diagnosticReport.update({ where: { id }, data: updates });
            
            // Обновляем локальный JSON файл, чтобы ссылка исчезла из UI без ресканирования
            const LINKS_REPORT_FILE = path.join(__dirname, '../scripts/links_report.json');
            if (fs.existsSync(LINKS_REPORT_FILE)) {
                const data = JSON.parse(fs.readFileSync(LINKS_REPORT_FILE, 'utf-8'));
                data.brokenLinks = data.brokenLinks.filter(l => !(l.id === id && l.url === url));
                fs.writeFileSync(LINKS_REPORT_FILE, JSON.stringify(data, null, 2), 'utf-8');
            }
            
            return res.json({ success: true });
        } else {
            return res.json({ success: false, error: 'Ссылка не найдена в тексте' });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Ошибка сервера при удалении ссылки' });
    }
});


// ==========================================
// 6. РЕТРОАКТИВНОЕ SEO-ОБОГАЩЕНИЕ
// ==========================================
router.post('/api/seo-enrich/all', async (req, res) => {
    try {
        const reports = await prisma.diagnosticReport.findMany({ where: { is_complete: true } });
        let updatedCount = 0;
        
        for (const report of reports) {
            const rawText = report.full_analysis_markdown || report.summary || '';
            const newText = enrichReportText(rawText, report.brand, report.model, report.code, report.drivability);
            
            if (newText !== rawText) {
                await prisma.diagnosticReport.update({
                    where: { id: report.id },
                    data: { full_analysis_markdown: newText }
                });
                updatedCount++;
            }
        }
        
        res.json({ success: true, updatedCount });
    } catch (err) {
        console.error('Ошибка массового обогащения:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/api/seo-enrich/single/:id', async (req, res) => {
    try {
        const report = await prisma.diagnosticReport.findUnique({ where: { id: req.params.id } });
        if (!report) return res.status(404).json({ error: 'Отчет не найден' });
        
        const rawText = report.full_analysis_markdown || report.summary || '';
        const newText = enrichReportText(rawText, report.brand, report.model, report.code, report.drivability);
        
        if (newText !== rawText) {
            await prisma.diagnosticReport.update({
                where: { id: report.id },
                data: { full_analysis_markdown: newText }
            });
        }
        
        // Всегда возвращаем recreated: true для одиночного запроса, чтобы интерфейс обновился
        return res.json({ success: true, recreated: true });
    } catch (err) {
        console.error('Ошибка одиночного обогащения:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

export default router;
