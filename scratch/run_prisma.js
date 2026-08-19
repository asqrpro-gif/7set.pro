import { execSync } from 'child_process';
try {
  const result = execSync('npx prisma db push', { stdio: 'inherit' });
} catch (e) {
  console.error(e);
}
