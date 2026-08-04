import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.diagnosticReport.updateMany({data: {seoScore: 0}}).then(res => console.log('Reset ' + res.count + ' cards')).catch(console.error).finally(() => prisma.$disconnect());
