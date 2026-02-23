const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'mindmap-secret-key-2026';

/**
 * 인증 미들웨어
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: '유효하지 않은 토큰입니다.' });
    }
};

module.exports = { authenticateToken, JWT_SECRET };
