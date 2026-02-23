const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { JWT_SECRET } = require('../middleware/authHandler');

/**
 * 소셜 로그인/자동 가입 API
 */
router.post('/social-login', async (req, res) => {
    try {
        const { socialId, provider, displayName, username } = req.body;

        if (!socialId || !provider) {
            return res.status(400).json({ success: false, message: '소셜 정보가 부족합니다.' });
        }

        // 1. 기존 유저인지 소셜 ID로 확인
        let userResult = await pool.query(
            'SELECT * FROM tba_users WHERE social_id = $1 AND provider = $2',
            [socialId, provider]
        );
        let user = userResult.rows[0];

        // 2. 기존 유저 정보 업데이트 또는 신규 가입
        if (user) {
            if (displayName && user.display_name !== displayName) {
                await pool.query('UPDATE tba_users SET display_name = $1 WHERE id = $2', [displayName, user.id]);
                user.display_name = displayName;
            }
        } else {
            const uniqueUsername = username || `${provider}_${socialId.substring(0, 10)}`;
            const newUserResult = await pool.query(
                'INSERT INTO tba_users (username, display_name, social_id, provider) VALUES ($1, $2, $3, $4) RETURNING *',
                [uniqueUsername, displayName || uniqueUsername, socialId, provider]
            );
            user = newUserResult.rows[0];
        }

        // 3. JWT 토큰 발급
        const token = jwt.sign(
            { id: user.id, username: user.username, displayName: user.display_name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: `${provider} 로그인 성공!`,
            token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.display_name
            }
        });
    } catch (error) {
        console.error('소셜 로그인 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 로그인 API
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: '아이디와 비밀번호를 모두 입력해주세요.' });
        }

        const result = await pool.query('SELECT * FROM tba_users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (!user || user.social_id || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, displayName: user.display_name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: '로그인 성공!',
            token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.display_name
            }
        });
    } catch (error) {
        console.error('로그인 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 토큰 검증 API (자동 로그인)
 */
router.get('/verify', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: '토큰이 없습니다.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const userResult = await pool.query(
            'SELECT id, username, display_name, provider FROM tba_users WHERE id = $1',
            [decoded.id]
        );
        const user = userResult.rows[0];

        if (!user) {
            return res.status(401).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.display_name,
                socialProvider: user.provider
            }
        });
    } catch (error) {
        res.status(401).json({ success: false, message: '토큰이 유효하지 않습니다.' });
    }
});

/**
 * 소셜 계정 연동 API (기존 유저 전용)
 */
router.post('/link-social', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: '인증이 필요합니다.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.id;

        const { socialId, provider, displayName } = req.body;

        if (!socialId || !provider) {
            return res.status(400).json({ success: false, message: '소셜 정보가 부족합니다.' });
        }

        const checkResult = await pool.query(
            'SELECT id FROM tba_users WHERE social_id = $1 AND provider = $2',
            [socialId, provider]
        );

        if (checkResult.rows.length > 0) {
            return res.status(409).json({ success: false, message: '이미 다른 계정에 연동된 소셜 정보입니다.' });
        }

        await pool.query(
            'UPDATE tba_users SET social_id = $1, provider = $2, display_name = COALESCE($4, display_name) WHERE id = $3',
            [socialId, provider, userId, displayName]
        );

        res.json({ success: true, message: '소셜 계정 연동 성공!' });
    } catch (error) {
        console.error('소셜 연동 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 회원가입 API
 */
router.post('/register', async (req, res) => {
    try {
        const { username, password, displayName } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: '필수 정보를 모두 입력해주세요.' });
        }

        const check = await pool.query('SELECT id FROM tba_users WHERE username = $1', [username]);
        if (check.rows.length > 0) {
            return res.status(409).json({ success: false, message: '이미 존재하는 아이디입니다.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO tba_users (username, password, display_name) VALUES ($1, $2, $3)',
            [username, hashedPassword, displayName || username]
        );

        res.status(201).json({ success: true, message: '회원가입 성공!' });
    } catch (error) {
        console.error('회원가입 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

module.exports = router;
