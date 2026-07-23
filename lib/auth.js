import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'car-7set-pro-secret-2024';
const JWT_EXPIRES_IN = '7d';

export async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
}

export async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}

export function generateToken(userId) {
    return jwt.sign({ id: userId }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN
    });
}

export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

// Middleware для защиты HTML-страниц (редирект на логин)
export function requireAuth(req, res, next) {
    const token = req.cookies?.token;
    if (!token) {
        return res.redirect('/login');
    }
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.redirect('/login');
    }
    req.user = decoded;
    next();
}

// Middleware для защиты API-запросов (JSON ответ)
export function requireAuthApi(req, res, next) {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Токен устарел или недействителен' });
    }
    req.user = decoded;
    next();
}
