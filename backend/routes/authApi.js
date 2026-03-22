const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { JWT_SECRET, authenticateToken } = require('../middleware/authHandler');
const { sendPasswordResetEmail } = require('../utils/emailService');

/**
 * 소셜 로그인 시도 전 기존 사용자 확인 API (legacy - 이제 사용 안 함) - UI 대응을 위해 유지
 */
router.post('/social-check', async (req, res) => {
    try {
        const { email, provider } = req.body;
        
        if (!email || !provider) {
            return res.status(400).json({ success: false, message: '이메일과 제공자가 필요합니다.' });
        }

        const userResult = await pool.query(
            'SELECT id, login_id, display_name, provider, email FROM tba_users WHERE email = $1',
            [email]
        );
        
        if (userResult.rows.length > 0) {
            const existingUser = userResult.rows[0];
            if (existingUser.provider) {
                return res.json({
                    success: true,
                    exists: true,
                    type: 'social',
                    message: '이미 소셜로 가입된 계정입니다.'
                });
            }
            return res.json({
                success: true,
                exists: true,
                type: 'link',
                message: '일반 계정이 존재합니다. 연동하시겠습니까?',
                email: email
            });
        }

        return res.json({
            success: true,
            exists: false,
            type: 'register',
            message: '새로운 회원입니다. 자동 회원가입 됩니다.'
        });
    } catch (error) {
        console.error('소셜 체크 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 소셜 계정 연동 또는 가입 API (사용자 직접 입력 버전)
 */
router.post('/social-register', async (req, res) => {
    try {
        const { socialId, provider, displayName, login_id, password, email, mode } = req.body;

        if (!socialId || !provider) {
            return res.status(400).json({ success: false, message: '소셜 정보가 부족합니다.' });
        }

        if (mode === 'link') {
            if (!login_id || !password) {
                return res.status(400).json({ success: false, message: '아이디와 비밀번호를 입력해주세요.' });
            }

            const userResult = await pool.query('SELECT * FROM tba_users WHERE login_id = $1', [login_id]);
            const user = userResult.rows[0];

            if (!user) {
                return res.status(404).json({ success: false, message: '존재하지 않는 아이디입니다.' });
            }

            if (!(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ success: false, message: '비밀번호가 올바르지 않습니다.' });
            }

            const currentSocialIds = Array.isArray(user.social_ids) ? user.social_ids : [];
            const newSocialIds = [...currentSocialIds, { provider: provider, socialId: String(socialId) }];
            
            await pool.query(
                'UPDATE tba_users SET social_ids = $1, social_id = $2, provider = $3 WHERE id = $4',
                [JSON.stringify(newSocialIds), String(socialId), provider, user.id]
            );

            const token = jwt.sign(
                { id: user.id, login_id: user.login_id, displayName: user.display_name },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            await pool.query('UPDATE tba_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

            return res.json({
                success: true,
                message: `${provider} 계정이 연동되었습니다!`,
                token,
                user: {
                    id: user.id,
                    login_id: user.login_id,
                    displayName: user.display_name,
                    email: user.email,
                    socialProvider: user.provider,
                    socialIds: user.social_ids || [],
                    hasPassword: !!user.password,
                    todoAutoDelete: user.todo_auto_delete
                }
            });
        } else {
            if (!login_id || !password) {
                return res.status(400).json({ success: false, message: '아이디와 비밀번호를 입력해주세요.' });
            }

            const check = await pool.query('SELECT id FROM tba_users WHERE login_id = $1', [login_id]);
            if (check.rows.length > 0) {
                return res.status(409).json({ success: false, message: '이미 존재하는 아이디입니다.' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const newSocialIds = [{ provider: provider, socialId: String(socialId) }];
            
            const newUserResult = await pool.query(
                'INSERT INTO tba_users (login_id, password, display_name, social_ids, social_id, provider) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                [login_id, hashedPassword, displayName || login_id, JSON.stringify(newSocialIds), String(socialId), provider]
            );
            const user = newUserResult.rows[0];

            const token = jwt.sign(
                { id: user.id, login_id: user.login_id, displayName: user.display_name },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            await pool.query('UPDATE tba_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

            return res.json({
                success: true,
                message: `${provider} 회원가입 완료!`,
                token,
                user: {
                    id: user.id,
                    login_id: user.login_id,
                    displayName: user.display_name,
                    email: user.email,
                    socialProvider: user.provider,
                    socialIds: user.social_ids || [],
                    hasPassword: !!user.password,
                    todoAutoDelete: user.todo_auto_delete
                }
            });
        }
    } catch (error) {
        console.error('소셜 등록 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 소셜 로그인/자동 가입 API (메인)
 */
router.post('/social-login', async (req, res) => {
    try {
        const { socialId, provider, displayName, email } = req.body;

        if (!socialId || !provider) {
            return res.status(400).json({ success: false, message: '소셜 정보가 부족합니다.' });
        }

        console.log(`[Social Login] Request: provider=${provider}, socialId=${socialId}, email=${email}`);

        // 1. social_ids JSONB 컬럼에서 기존 유저 확인
        let userResult = await pool.query(
            'SELECT * FROM tba_users WHERE (social_ids IS NOT NULL) AND (social_ids @> $1::jsonb)',
            [JSON.stringify([{ provider: provider, socialId: String(socialId) }])]
        );
        let user = userResult.rows[0];
        
        // Fallback: 기존 social_id + provider 컬럼 확인 (하위 호환 및 마이그레이션)
        if (!user) {
            console.log(`[Social Login] Not found in social_ids, checking legacy columns...`);
            userResult = await pool.query(
                'SELECT * FROM tba_users WHERE social_id = $1 AND provider = $2',
                [String(socialId), provider]
            );
            user = userResult.rows[0];
            
            if (user) {
                console.log(`[Social Login] Found by legacy columns: ID ${user.id}. Migrating to social_ids...`);
                // 기존 사용자가 social_ids로 이전되지 않은 경우 업데이트
                const socialIdsArray = Array.isArray(user.social_ids) ? user.social_ids : [];
                const alreadyHas = socialIdsArray.some(s => s.provider === provider && String(s.socialId) === String(socialId));
                if (!alreadyHas) {
                    const newSocialIds = [...socialIdsArray, { provider: provider, socialId: String(socialId) }];
                    await pool.query(
                        'UPDATE tba_users SET social_ids = $1 WHERE id = $2',
                        [JSON.stringify(newSocialIds), user.id]
                    );
                }
            }
        }

        // 2. 없으면 email로 기존 유저 확인 (중복 가입 방지 및 계정 통합)
        if (!user && email) {
            userResult = await pool.query('SELECT * FROM tba_users WHERE email = $1', [email]);
            const existingUser = userResult.rows[0];
            
            if (existingUser) {
                console.log(`[Social Login] Found user by email: ${existingUser.login_id || 'ID ' + existingUser.id}`);
                const currentSocialIds = Array.isArray(existingUser.social_ids) ? existingUser.social_ids : [];
                
                // 이미 같은 provider로 연동되어 있는지 확인
                const alreadyLinked = currentSocialIds.some(s => s.provider === provider);
                if (alreadyLinked) {
                    user = existingUser;
                } else {
                    // 새 소셜 계정 추가 연동 (같은 이메일이면 본인으로 간주하여 자동 연동)
                    const newSocialIds = [...currentSocialIds, { provider: provider, socialId: String(socialId) }];
                    await pool.query(
                        'UPDATE tba_users SET social_ids = $1, social_id = $2, provider = $3 WHERE id = $4',
                        [JSON.stringify(newSocialIds), String(socialId), provider, existingUser.id]
                    );
                    user = { ...existingUser, social_ids: newSocialIds, social_id: String(socialId), provider: provider };
                    console.log(`[Social Login] Linked ${provider} to existing account: ${existingUser.login_id || existingUser.id}`);
                }
            }
        }

        // 3. 그래도 없으면 자동 회원가입
        if (!user) {
            console.log(`[Social Login] No existing user found. Creating new social user...`);
            const newSocialIds = [{ provider: provider, socialId: String(socialId) }];
            const newUserResult = await pool.query(
                'INSERT INTO tba_users (login_id, password, email, display_name, social_ids, social_id, provider) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
                [null, null, email || null, displayName || '사용자', JSON.stringify(newSocialIds), String(socialId), provider]
            );
            user = newUserResult.rows[0];
            console.log(`[Social Login] Registered new social user: ID ${user.id}`);
        }

        // JWT 토큰 발급
        const token = jwt.sign(
            { id: user.id, login_id: user.login_id, displayName: user.display_name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        await pool.query('UPDATE tba_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

        res.json({
            success: true,
            message: `${provider} 로그인 성공!`,
            token,
            user: {
                id: user.id,
                login_id: user.login_id,
                displayName: user.display_name,
                email: user.email,
                socialProvider: user.provider,
                socialIds: user.social_ids || [],
                hasPassword: !!user.password,
                todoAutoDelete: user.todo_auto_delete
            }
        });
    } catch (error) {
        console.error('❌ [Social Login Error]:', error);
        res.status(500).json({ 
            success: false, 
            message: '서버 오류가 발생했습니다.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined 
        });
    }
});

/**
 * 로그인 API (일반)
 */
router.post('/login', async (req, res) => {
    try {
        const { login_id, password } = req.body;
        if (!login_id || !password) {
            return res.status(400).json({ success: false, message: '아이디와 비밀번호를 모두 입력해주세요.' });
        }

        const result = await pool.query('SELECT * FROM tba_users WHERE login_id = $1', [login_id]);
        const user = result.rows[0];

        if (!user) {
            // 카카오 연동 계정 확인 (login_id가 카카오 ID인 경우 대응)
            let kakaoResult = await pool.query(
                'SELECT * FROM tba_users WHERE (social_ids IS NOT NULL) AND (social_ids @> $1::jsonb)',
                [JSON.stringify([{ provider: 'kakao', socialId: String(login_id) }])]
            );
            
            if (kakaoResult.rows.length === 0) {
                kakaoResult = await pool.query(
                    'SELECT * FROM tba_users WHERE social_id = $1 AND provider = $2',
                    [String(login_id), 'kakao']
                );
            }
            
            if (kakaoResult.rows.length > 0) {
                const kakaoUser = kakaoResult.rows[0];
                const hashedPassword = await bcrypt.hash(password, 10);
                await pool.query(
                    'UPDATE tba_users SET login_id = $1, password = $2, social_id = NULL, provider = NULL WHERE id = $3',
                    [login_id, hashedPassword, kakaoUser.id]
                );
                const updatedUser = (await pool.query('SELECT * FROM tba_users WHERE id = $1', [kakaoUser.id])).rows[0];
                
                const token = jwt.sign(
                    { id: updatedUser.id, login_id: updatedUser.login_id, displayName: updatedUser.display_name },
                    JWT_SECRET,
                    { expiresIn: '7d' }
                );
                await pool.query('UPDATE tba_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [updatedUser.id]);
                
                return res.json({
                    success: true,
                    message: '카카오 계정을 일반 로그인으로 전환했습니다!',
                    token,
                    user: {
                        id: updatedUser.id,
                        login_id: updatedUser.login_id,
                        displayName: updatedUser.display_name,
                        socialProvider: updatedUser.provider,
                        socialIds: updatedUser.social_ids || [],
                        todoAutoDelete: updatedUser.todo_auto_delete
                    }
                });
            }
            return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
        }

        if (!user.password) {
            const hasSocial = (user.social_ids && user.social_ids.length > 0) || user.social_id;
            if (hasSocial) {
                return res.status(401).json({ success: false, message: '이 계정은 소셜로 가입한 계정입니다. 소셜로 로그인 해주세요.' });
            }
            return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
        }
        
        if (!(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
        }

        const token = jwt.sign(
            { id: user.id, login_id: user.login_id, displayName: user.display_name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        await pool.query('UPDATE tba_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

        res.json({
            success: true,
            message: '로그인 성공!',
            token,
            user: {
                id: user.id,
                login_id: user.login_id,
                displayName: user.display_name,
                email: user.email,
                socialProvider: user.provider,
                socialIds: user.social_ids || [],
                hasPassword: !!user.password,
                todoAutoDelete: user.todo_auto_delete
            }
        });
    } catch (error) {
        console.error('로그인 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 토큰 검증 API
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
            'SELECT id, login_id, display_name, provider, email, todo_auto_delete, social_ids, password FROM tba_users WHERE id = $1',
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
                login_id: user.login_id,
                displayName: user.display_name,
                email: user.email,
                socialProvider: user.provider,
                socialIds: user.social_ids || [],
                hasPassword: !!user.password,
                todoAutoDelete: user.todo_auto_delete
            }
        });
    } catch (error) {
        res.status(401).json({ success: false, message: '토큰이 유효하지 않습니다.' });
    }
});

/**
 * 소셜 계정 연동 API (로그인된 상태)
 */
router.post('/link-social', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { socialId, provider, email } = req.body;

        if (!socialId || !provider) {
            return res.status(400).json({ success: false, message: '소셜 정보가 부족합니다.' });
        }

        // 1. 중복 연동 확인
        let checkResult = await pool.query(
            'SELECT id FROM tba_users WHERE (social_ids IS NOT NULL) AND (social_ids @> $1::jsonb)',
            [JSON.stringify([{ provider: provider, socialId: String(socialId) }])]
        );

        if (checkResult.rows.length === 0) {
            checkResult = await pool.query(
                'SELECT id FROM tba_users WHERE social_id = $1 AND provider = $2',
                [String(socialId), provider]
            );
        }

        if (checkResult.rows.length > 0) {
            const linkedUser = checkResult.rows[0];
            if (linkedUser.id === userId) {
                return res.json({ success: true, message: '이미 연동되어 있습니다.' });
            }
            return res.status(409).json({ success: false, message: '이미 다른 계정에 연동된 소셜 정보입니다.' });
        }

        // 2. 소셜 정보 추가
        const userResult = await pool.query('SELECT social_ids FROM tba_users WHERE id = $1', [userId]);
        const currentSocialIds = Array.isArray(userResult.rows[0]?.social_ids) ? userResult.rows[0].social_ids : [];
        const newSocialIds = [...currentSocialIds, { provider: provider, socialId: String(socialId) }];
        
        await pool.query(
            'UPDATE tba_users SET social_ids = $1, social_id = $2, provider = $3, email = COALESCE($5, email) WHERE id = $4',
            [JSON.stringify(newSocialIds), String(socialId), provider, userId, email]
        );

        const updatedUser = (await pool.query('SELECT * FROM tba_users WHERE id = $1', [userId])).rows[0];

        res.json({ 
            success: true, 
            message: `${provider} 계정이 연동되었습니다!`,
            user: {
                id: updatedUser.id,
                login_id: updatedUser.login_id,
                displayName: updatedUser.display_name,
                email: updatedUser.email,
                socialProvider: updatedUser.provider,
                socialIds: updatedUser.social_ids || [],
                hasPassword: !!updatedUser.password,
                todoAutoDelete: updatedUser.todo_auto_delete
            }
        });
    } catch (error) {
        console.error('소셜 연동 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * Naver 사용자 정보 프록시
 */
router.post('/naver-user-info', async (req, res) => {
    try {
        const { accessToken } = req.body;
        if (!accessToken) return res.status(400).json({ success: false, message: '토큰이 필요합니다.' });
        
        const response = await fetch('https://openapi.naver.com/v1/nid/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        if (data.response) res.json({ success: true, data: data.response });
        else res.status(400).json({ success: false, message: '정보 조회 실패' });
    } catch (error) {
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * 회원가입 API (일반)
 */
router.post('/register', async (req, res) => {
    try {
        const { login_id, password, displayName, email } = req.body;
        if (!login_id || !password) return res.status(400).json({ success: false, message: '필수 정보 누락' });

        const check = await pool.query('SELECT id FROM tba_users WHERE login_id = $1', [login_id]);
        if (check.rows.length > 0) return res.status(409).json({ success: false, message: '이미 존재하는 아이디' });

        if (email) {
            const emailCheck = await pool.query('SELECT id FROM tba_users WHERE email = $1', [email]);
            if (emailCheck.rows.length > 0) return res.status(409).json({ success: false, message: '이미 사용 중인 이메일' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO tba_users (login_id, password, display_name, email) VALUES ($1, $2, $3, $4)',
            [login_id, hashedPassword, displayName || login_id, email || null]
        );

        res.status(201).json({ success: true, message: '회원가입 성공!' });
    } catch (error) {
        console.error('회원가입 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * 사용자 설정 업데이트
 */
router.patch('/settings', authenticateToken, async (req, res) => {
    try {
        const { todoAutoDelete, email, newPassword, displayName } = req.body;

        if (displayName !== undefined) {
            await pool.query('UPDATE tba_users SET display_name = $1 WHERE id = $2', [displayName || null, req.user.id]);
        }

        if (email !== undefined) {
            if (email) {
                const emailCheck = await pool.query('SELECT id FROM tba_users WHERE email = $1 AND id != $2', [email, req.user.id]);
                if (emailCheck.rows.length > 0) return res.status(409).json({ success: false, message: '이미 사용 중인 이메일' });
            }
            await pool.query('UPDATE tba_users SET email = $1 WHERE id = $2', [email || null, req.user.id]);
        }

        if (todoAutoDelete !== undefined) {
            await pool.query('UPDATE tba_users SET todo_auto_delete = $1 WHERE id = $2', [todoAutoDelete, req.user.id]);
        }

        if (newPassword !== undefined) {
            const user = (await pool.query('SELECT * FROM tba_users WHERE id = $1', [req.user.id])).rows[0];
            if (!user.password) {
                const hashedPassword = await bcrypt.hash(newPassword, 10);
                await pool.query('UPDATE tba_users SET password = $1 WHERE id = $2', [hashedPassword, req.user.id]);
                return res.json({ success: true, message: '비밀번호가 설정되었습니다.' });
            }
        }

        res.json({ success: true, message: '설정이 저장되었습니다.' });
    } catch (error) {
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * 비밀번호 재설정 관련 (인증번호 요청/확인) - 생략 (기존 로직 유지 가능하나 간소화)
 */
router.post('/request-password-reset', async (req, res) => {
    try {
        const { email } = req.body;
        const userResult = await pool.query('SELECT id FROM tba_users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) return res.status(404).json({ success: false, message: '이메일을 찾을 수 없음' });

        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await pool.query('UPDATE tba_users SET reset_code = $1, reset_code_expires_at = $2 WHERE id = $3', [resetCode, expiresAt, userResult.rows[0].id]);
        await sendPasswordResetEmail(email, resetCode);

        res.json({ success: true, message: '발송 완료' });
    } catch (error) {
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

router.post('/verify-password-reset', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        const user = (await pool.query('SELECT id, reset_code, reset_code_expires_at FROM tba_users WHERE email = $1', [email])).rows[0];

        if (!user || user.reset_code !== code || new Date() > new Date(user.reset_code_expires_at)) {
            return res.status(400).json({ success: false, message: '유효하지 않거나 만료된 코드' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE tba_users SET password = $1, reset_code = NULL, reset_code_expires_at = NULL WHERE id = $2', [hashedPassword, user.id]);

        res.json({ success: true, message: '변경 완료' });
    } catch (error) {
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

router.get('/check-login-id', async (req, res) => {
    const { login_id } = req.query;
    const result = await pool.query('SELECT id FROM tba_users WHERE login_id = $1', [login_id]);
    res.json({ available: result.rows.length === 0 });
});

module.exports = router;
