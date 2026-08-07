import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function run() {
    const report = await prisma.diagnosticReport.findFirst({
        where: { brand: 'hyundai', model: 'tucson', code: 'p0134' }
    });
    fs.writeFileSync(path.join(__dirname, 'tucson_dump.txt'), report.pro_tips_md);
    process.exit(0);
}
run();
