const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const JWT_SECRET = process.env.JWT_SECRET || 'mindmap-secret-key-2026';

/**
 * 인증 미들웨어
 * - 유저 활동이 있을 때마다 last_login_at(최근 접속일)을 갱신합니다.
 */
const authenticateToken = async (req, res, next) => {
    let token = null;

    // 1. Authorization Header 확인
    const authHeader = req.headers['authorization'];
    const cookieToken = req.cookies ? req.cookies.token : null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (cookieToken) {
        token = cookieToken;
    }

    if (!token) {
        return res.status(401).json({ success: false, message: '인증 오류 (로그인이 필요합니다)' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;

        // 비동기로 활동 시간 업데이트 (필요 시 속도 최적화를 위해 await 생략 가능하지만 여기선 확실히 함)
        // last_login_at 필드를 '최근 활동일' 개념으로 활용
        pool.query('UPDATE tba_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [decoded.id])
          .catch(err => console.error('[AuthMiddleware] 활동 시간 갱신 실패:', err));

        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: '유효하지 않은 토큰입니다.' });
    }
};

module.exports = { authenticateToken, JWT_SECRET };
