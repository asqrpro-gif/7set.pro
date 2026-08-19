import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/feedback/:id
router.post('/:id', async (req, res) => {
    const reportId = req.params.id;
    const { type, comment } = req.body;
    console.log(`[FEEDBACK API] ID: ${reportId}, Type: ${type}, Comment: ${comment}`);

    try {
        // Проверяем, существует ли отчет
        const report = await prisma.diagnosticReport.findUnique({
            where: { id: reportId }
        });

        if (!report) {
            return res.status(404).json({ success: false, error: 'Отчет не найден' });
        }

        if (type === 'like') {
            await prisma.diagnosticReport.update({
                where: { id: reportId },
                data: { likes: { increment: 1 } }
            });
        } else if (type === 'dislike') {
            await prisma.diagnosticReport.update({
                where: { id: reportId },
                data: { dislikes: { increment: 1 } }
            });
        } else if (type === 'share_tg') {
            await prisma.diagnosticReport.update({
                where: { id: reportId },
                data: { shareTg: { increment: 1 } }
            });
        } else if (type === 'share_wa') {
            await prisma.diagnosticReport.update({
                where: { id: reportId },
                data: { shareWa: { increment: 1 } }
            });
        } else if (type === 'share_link') {
            await prisma.diagnosticReport.update({
                where: { id: reportId },
                data: { shareLink: { increment: 1 } }
            });
            console.log('[FEEDBACK API] share_link incremented!');
        }

        console.log(`[FEEDBACK API] Success for ${type}`);

        // Если передан комментарий, сохраняем его
        if (comment && comment.trim() !== '') {
            await prisma.reportFeedback.create({
                data: {
                    reportId: reportId,
                    message: comment.trim()
                }
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка при сохранении обратной связи:', error);
        res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера' });
    }
});

export default router;
