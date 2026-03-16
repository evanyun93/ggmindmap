const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { JWT_SECRET, authenticateToken } = require('../middleware/authHandler');
const { sendPasswordResetEmail } = require('../utils/emailService');

/**
 * 소셜 로그인 시도 전 기존 사용자 확인 API (legacy - 이제 사용 안 함)
 * - 새 로직에서는 /social-login이 자동 처리
 */
router.post('/social-check', async (req, res) => {
    try {
        const { email, provider } = req.body;
        
        if (!email || !provider) {
            return res.status(400).json({ success: false, message: '이메일과 제공자가 필요합니다.' });
        }

        // email 필드로 기존 사용자 확인
        const userResult = await pool.query(
            'SELECT id, login_id, display_name, provider, email FROM tba_users WHERE email = $1',
            [email]
        );
        
        if (userResult.rows.length > 0) {
            const existingUser = userResult.rows[0];
            // 이미 소셜로 가입된 계정인지 확인
            if (existingUser.provider) {
                return res.json({
                    success: true,
                    exists: true,
                    type: 'social',
                    message: '이미 소셜로 가입된 계정입니다.'
                });
            }
            // 일반 계정이 존재함 - 연동 가능
            return res.json({
                success: true,
                exists: true,
                type: 'link',
                message: '일반 계정이 존재합니다. 연동하시겠습니까?',
                email: email
            });
        }

        // 새 사용자
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
 * 소셜 계정 연동 또는 가입 API
 * - 프론트엔드에서 login_id/password를 입력받아 연동 또는 가입 후 토큰 발급
 */
router.post('/social-register', async (req, res) => {
    try {
        const { socialId, provider, displayName, login_id, password, email, mode } = req.body;

        if (!socialId || !provider) {
            return res.status(400).json({ success: false, message: '소셜 정보가 부족합니다.' });
        }

        // mode: 'link' (기존 계정 연동) 또는 'register' (새 회원가입)
        
        if (mode === 'link') {
            // 기존 일반 계정에 소셜 연동
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

            // 기존 social_ids 배열에 새 소셜 정보 추가 (신规 로직)
            const currentSocialIds = user.social_ids || [];
            const newSocialIds = [...currentSocialIds, { provider: provider, socialId: socialId }];
            
            await pool.query(
                'UPDATE tba_users SET social_ids = $1, social_id = $2, provider = $3, display_name = COALESCE($5, display_name) WHERE id = $4',
                [JSON.stringify(newSocialIds), socialId, provider, user.id, displayName]
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
            // 새 회원가입
            if (!login_id || !password) {
                return res.status(400).json({ success: false, message: '아이디와 비밀번호를 입력해주세요.' });
            }

            // 아이디 중복 확인
            const check = await pool.query('SELECT id FROM tba_users WHERE login_id = $1', [login_id]);
            if (check.rows.length > 0) {
                return res.status(409).json({ success: false, message: '이미 존재하는 아이디입니다.' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const newSocialIds = [{ provider: provider, socialId: socialId }];
            
            const newUserResult = await pool.query(
                'INSERT INTO tba_users (login_id, password, display_name, social_ids, social_id, provider) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                [login_id, hashedPassword, displayName || login_id, JSON.stringify(newSocialIds), socialId, provider]
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
                    hasPassword: true, // 새 가입이므로 비밀번호가 항상 있음
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
 * 소셜 로그인/자동 가입 API
 * - social_ids JSONB 컬럼 사용 (신规)
 * - social_id + provider로 기존 유저 확인
 * - 없으면 email로 기존 유저 확인
 * - email이 다른 소셜에 연동되어 있으면 경고 후 기존 계정으로 로그인 유도
 * - 같은 email로 이미 일반 계정이 있으면 소셜 연동
 * - 그래도 없으면 자동 회원가입
 * - 계정 병합 시 데이터 이전 로직 포함
 */
router.post('/social-login', async (req, res) => {
    try {
        const { socialId, provider, displayName, login_id, email } = req.body;

        if (!socialId || !provider) {
            return res.status(400).json({ success: false, message: '소셜 정보가 부족합니다.' });
        }

        // Helper function to transfer user data (todos, mindmaps, widgets)
        const transferUserData = async (fromUserId, toUserId) => {
            try {
                // Transfer todos
                await pool.query(
                    'UPDATE tba_todos SET user_id = $1 WHERE user_id = $2',
                    [toUserId, fromUserId]
                );
                
                // Transfer mindmaps
                await pool.query(
                    'UPDATE tba_mindmaps SET user_id = $1 WHERE user_id = $2',
                    [toUserId, fromUserId]
                );
                
                // Transfer widgets
                await pool.query(
                    'UPDATE tba_widgets SET user_id = $1 WHERE user_id = $2',
                    [toUserId, fromUserId]
                );
                
                console.log(`[Account Merge] Data transferred from user ${fromUserId} to ${toUserId}`);
            } catch (error) {
                console.error('[Account Merge] Error transferring data:', error);
                throw error;
            }
        };

        // 1. social_ids JSONB 컬럼에서 기존 유저 확인 (신규 로직)
        console.log(`[Social Login] Checking for provider=${provider}, socialId=${socialId}, email=${email}`);
        
        // 먼저 social_ids에서 찾기 (social_ids가 NULL이 아닌 경우만)
        let userResult = await pool.query(
            'SELECT id, login_id, social_ids, email FROM tba_users WHERE (social_ids IS NOT NULL) AND (social_ids @> $1)',
            [JSON.stringify([{ provider: provider, socialId: String(socialId) }])]
        );
        console.log(`[Social Login] Found by social_ids: ${userResult.rows.length} users`);
        if (userResult.rows.length > 0) {
            console.log(`[Social Login] Found user:`, JSON.stringify(userResult.rows[0]));
        }
        let user = userResult.rows[0];
        
        // Fallback: 기존 social_id + provider 컬럼 확인 (하위 호환)
        if (!user) {
            console.log(`[Social Login] Not found in social_ids, checking legacy columns...`);
            userResult = await pool.query(
                'SELECT id, login_id, social_ids, email, social_id, provider FROM tba_users WHERE social_id = $1 AND provider = $2',
                [socialId, provider]
            );
            if (userResult.rows.length > 0) {
                console.log(`[Social Login] Found by legacy columns:`, JSON.stringify(userResult.rows[0]));
                user = userResult.rows[0];
            }
        }

        // Fallback: 기존 social_id + provider 컬럼 확인 (하위 호환)
        if (!user) {
            userResult = await pool.query(
                'SELECT * FROM tba_users WHERE social_id = $1 AND provider = $2',
                [socialId, provider]
            );
            user = userResult.rows[0];
            
            // 기존 사용자가 social_ids로 이전되지 않은 경우, 업데이트
            if (user) {
                const socialIdsArray = [{ provider: provider, socialId: socialId }];
                await pool.query(
                    'UPDATE tba_users SET social_ids = $1 WHERE id = $2',
                    [JSON.stringify(socialIdsArray), user.id]
                );
                console.log(`[Social Login] Migrated old user to social_ids: ${user.login_id}`);
            }
        }

        // 2. 없으면 email로 기존 유저 확인 (중복 가입 방지)
        if (!user && email) {
            // email 필드로 찾기
            userResult = await pool.query(
                'SELECT * FROM tba_users WHERE email = $1',
                [email]
            );
            const existingUser = userResult.rows[0];
            
            if (existingUser) {
                console.log(`[Social Login] Found user by email: ${existingUser.login_id}, social_ids: ${JSON.stringify(existingUser.social_ids)}`);
                
                // 현재 사용자의 social_ids 배열 확인
                const currentSocialIds = existingUser.social_ids || [];
                
                // Case 1: 이미 같은 provider로 연동되어 있음
                const hasSameProvider = currentSocialIds.some(s => s.provider === provider);
                if (hasSameProvider) {
                    // 그냥 로그인
                    user = existingUser;
                    console.log(`[Social Login] 기존 ${provider} 계정으로 로그인: ${existingUser.login_id}`);
                }
                // Case 2: 다른 소셜에 연동되어 있음 - 같은 이메일なので自動リンク + 데이터 병합
                else if (currentSocialIds.length > 0) {
                    // 같은 이메일인데 다른 소셜에 연동되어 있음
                    // 사용자에게 확인 없이 자동으로 연동 (같은 사람이므로)
                    const newSocialIds = [...currentSocialIds, { provider: provider, socialId: socialId }];
                    
                    // 소셜 IDs 업데이트
                    await pool.query(
                        'UPDATE tba_users SET social_ids = $1 WHERE id = $2',
                        [JSON.stringify(newSocialIds), existingUser.id]
                    );
                    
                    // 이전 social_id/provider도 백업으로 유지
                    await pool.query(
                        'UPDATE tba_users SET social_id = $1, provider = $2 WHERE id = $3',
                        [socialId, provider, existingUser.id]
                    );
                    
                    userResult = await pool.query('SELECT * FROM tba_users WHERE id = $1', [existingUser.id]);
                    user = userResult.rows[0];
                    console.log(`[Social Login] 기존 계정에 ${provider} 추가 연동: ${existingUser.login_id}`);
                }
                // Case 3: social_ids가 비어있으면 (일반 가입 or 첫 소셜 연동) - 소셜 연동
                else {
                    // social_ids에 소셜 계정을 추가
                    const newSocialIds = [{ provider: provider, socialId: socialId }];
                    await pool.query(
                        'UPDATE tba_users SET social_ids = $1, social_id = $2, provider = $3 WHERE id = $4',
                        [JSON.stringify(newSocialIds), socialId, provider, existingUser.id]
                    );
                    userResult = await pool.query('SELECT * FROM tba_users WHERE id = $1', [existingUser.id]);
                    user = userResult.rows[0];
                    console.log(`[Social Login] 일반 계정에 ${provider} 연동: ${existingUser.login_id}`);
                }
            }
        }

        // 3. 그래도 없으면 자동 회원가입
        if (!user) {
            // email이 있으면 login_id으로 사용, 없으면 socialId 기반
            const uniqueLogin_id = email || login_id || `${provider}_${socialId.substring(0, 10)}`;
            
            const newSocialIds = [{ provider: provider, socialId: socialId }];
            
            const newUserResult = await pool.query(
                'INSERT INTO tba_users (login_id, email, display_name, social_ids, social_id, provider) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                [uniqueLogin_id, email || null, displayName || uniqueLogin_id, JSON.stringify(newSocialIds), socialId, provider]
            );
            user = newUserResult.rows[0];
            console.log(`[Social Login] 자동 회원가입: ${uniqueLogin_id}`);
        } else {
            // 기존 유저 - 마지막 로그인 시간 업데이트
            // display_name이 기본값이거나 비어있으면 새로 전달받은 소셜 이름으로 업데이트
            const isGenericName = !user.display_name || 
                                 user.display_name === '네이버 사용자' || 
                                 user.display_name === '카카오 사용자' || 
                                 user.display_name === '사용자' ||
                                 user.display_name.startsWith('google_');

            if (displayName && isGenericName && displayName !== user.display_name) {
                await pool.query(
                    'UPDATE tba_users SET display_name = $1 WHERE id = $2',
                    [displayName, user.id]
                );
                user.display_name = displayName;
                console.log(`[Social Login] Updated display_name to: ${displayName}`);
            }
            console.log(`[Social Login] 기존 계정 로그인: ${user.login_id}`);
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
        console.error('소셜 로그인 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 로그인 API
 * - 일반 로그인
 * - social_ids JSONB 컬럼 사용 (신规)
 * - 카카오로 가입한 회원이 일반 로그인으로 로그인 시도 시 카카오 계정으로 로그인
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
            // 사용자가 없으면 카카오로 가입한 회원이 일반 로그인으로 로그인 시도하는 것일 수 있음
            // social_ids JSONB 컬럼에서 카카오 계정 확인
            let kakaoResult = await pool.query(
                'SELECT * FROM tba_users WHERE (social_ids IS NOT NULL) AND (social_ids @> $1)',
                [JSON.stringify([{ provider: 'kakao', socialId: login_id }])]
            );
            
            // Fallback: 기존 social_id + provider 컬럼 확인 (하위 호환)
            if (kakaoResult.rows.length === 0) {
                kakaoResult = await pool.query(
                    'SELECT * FROM tba_users WHERE social_id = $1 AND provider = $2',
                    [login_id, 'kakao']
                );
            }
            
            if (kakaoResult.rows.length > 0) {
                // 카카오 계정을 일반 로그인으로 전환
                const kakaoUser = kakaoResult.rows[0];
                const hashedPassword = await bcrypt.hash(password, 10);
                await pool.query(
                    'UPDATE tba_users SET login_id = $1, password = $2, social_ids = $4, social_id = NULL, provider = NULL WHERE id = $3',
                    [login_id, hashedPassword, kakaoUser.id, JSON.stringify([])]
                );
                // 업데이트된 사용자 조회
                const updatedResult = await pool.query('SELECT * FROM tba_users WHERE id = $1', [kakaoUser.id]);
                const updatedUser = updatedResult.rows[0];
                
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

        // social_ids 배열 확인 (신규) + 기존 social_id 컬럼 (하위 호환)
        const hasSocialId = (user.social_ids && user.social_ids.length > 0) || user.social_id;
        
        // 비밀번호가 있으면 일반 로그인 가능 (소셜 연동되어 있어도)
        if (!user.password) {
            // 비밀번호가 없으면 소셜 로그인 필요
            if (hasSocialId) {
                return res.status(401).json({ success: false, message: '이 계정은 소셜로 가입한 계정입니다. 소셜로 로그인 해주세요.' });
            }
            return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
        }
        
        // 비밀번호 확인
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
 * 소셜 계정 연동 API (로그인된 사용자)
 * - social_ids JSONB 컬럼 사용 (신规)
 * - 이미 로그인한 사용자가 다른 소셜 계정을 추가 연동할 때
 */
router.post('/link-social', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { socialId, provider, displayName, email } = req.body;

        if (!socialId || !provider) {
            return res.status(400).json({ success: false, message: '소셜 정보가 부족합니다.' });
        }

        // 1. 해당 socialId가 다른 사용자에게 연동되어 있는지 확인 (social_ids JSONB 컬럼)
        console.log(`[Link Social] Checking - provider=${provider}, socialId=${socialId}, email=${email}`);
        let checkResult = await pool.query(
            'SELECT id, login_id, social_ids FROM tba_users WHERE (social_ids IS NOT NULL) AND (social_ids @> $1)',
            [JSON.stringify([{ provider: provider, socialId: socialId }])]
        );

        // Fallback: 기존 social_id + provider 컬럼 확인 (하위 호환)
        if (checkResult.rows.length === 0) {
            checkResult = await pool.query(
                'SELECT id, login_id FROM tba_users WHERE social_id = $1 AND provider = $2',
                [socialId, provider]
            );
        }

        if (checkResult.rows.length > 0) {
            const linkedUser = checkResult.rows[0];
            // 같은 사용자면 OK
            if (linkedUser.id === userId) {
                return res.json({ success: true, message: '이미 연동되어 있습니다.' });
            }
            return res.status(409).json({ success: false, message: '이미 다른 계정에 연동된 소셜 정보입니다.' });
        }

        // 2. email로도 확인 (다른 소셜에 연동된 경우)
        if (email) {
            const emailCheck = await pool.query(
                'SELECT id, login_id, provider FROM tba_users WHERE email = $1 AND id != $2',
                [email, userId]
            );
            if (emailCheck.rows.length > 0) {
                return res.status(409).json({ 
                    success: false, 
                    message: '이 이메일은 이미 다른 계정에 등록되어 있습니다.' 
                });
            }
        }

        // 3. 현재 사용자에게 소셜 정보 연동 (social_ids 배열에 추가)
        // 먼저 현재 social_ids 가져오기
        const userResult = await pool.query('SELECT social_ids FROM tba_users WHERE id = $1', [userId]);
        const currentSocialIds = userResult.rows[0]?.social_ids || [];
        console.log(`[Link Social] Current social_ids for user ${userId}:`, JSON.stringify(currentSocialIds));
        const newSocialIds = [...currentSocialIds, { provider: provider, socialId: socialId }];
        console.log(`[Link Social] New social_ids to save:`, JSON.stringify(newSocialIds));
        
        await pool.query(
            'UPDATE tba_users SET social_ids = $1, social_id = $2, provider = $3, email = COALESCE($5, email) WHERE id = $4',
            [JSON.stringify(newSocialIds), socialId, provider, userId, email]
        );

        // 업데이트된 사용자 정보 조회
        const updatedUser = await pool.query('SELECT * FROM tba_users WHERE id = $1', [userId]);
        const user = updatedUser.rows[0];

        res.json({ 
            success: true, 
            message: `${provider} 계정이 연동되었습니다!`,
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
        console.error('소셜 연동 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * Naver 사용자 정보 조회 (프록시 - CORS 우회)
 * - 프론트엔드에서 직접 Naver API를 호출할 수 없으므로 백엔드를 통해 호출
 */
router.post('/naver-user-info', async (req, res) => {
    try {
        const { accessToken } = req.body;
        
        if (!accessToken) {
            return res.status(400).json({ success: false, message: '액세스 토큰이 필요합니다.' });
        }
        
        // Naver API 호출
        const naverResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        const data = await naverResponse.json();
        
        if (data.response) {
            res.json({ success: true, data: data.response });
        } else {
            res.status(400).json({ success: false, message: '네이버 사용자 정보를 가져올 수 없습니다.' });
        }
    } catch (error) {
        console.error('네이버 API 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 소셜 계정 연동 API (legacy - 로그인 안 한 상태에서 연동)
 * - social_ids JSONB 컬럼 사용 (신规)
 * - 이미 카카오로 가입한 회원이 일반 로그인 후 카카오 연동을 시도할 때
 * - 카카오 이메일이 현재 login_id과 일치하면 연동 허용
 */
router.post('/link-social-legacy', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: '인증이 필요합니다.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.id;

        const { socialId, provider, displayName, email } = req.body;

        if (!socialId || !provider) {
            return res.status(400).json({ success: false, message: '소셜 정보가 부족합니다.' });
        }

        // 1. 카카오 socialId가 다른 계정에 연동되어 있는지 확인 (social_ids JSONB 컬럼)
        let checkResult = await pool.query(
            'SELECT id, login_id, social_ids FROM tba_users WHERE (social_ids IS NOT NULL) AND (social_ids @> $1)',
            [JSON.stringify([{ provider: provider, socialId: socialId }])]
        );

        // Fallback: 기존 social_id + provider 컬럼 확인 (하위 호환)
        if (checkResult.rows.length === 0) {
            checkResult = await pool.query(
                'SELECT id, login_id FROM tba_users WHERE social_id = $1 AND provider = $2',
                [socialId, provider]
            );
        }

        if (checkResult.rows.length > 0) {
            const linkedUser = checkResult.rows[0];
            // 만약 카카오 계정의 login_id이 현재 사용자의 login_id과 같으면 (같은 이메일)
            // 이는 같은 사람으로 보고 연동 허용
            if (linkedUser.login_id === decoded.login_id || (email && linkedUser.login_id === email)) {
                // 이미 연동되어 있음 - 그대로 성공 응답
                return res.json({ success: true, message: '이미 연동되어 있습니다.' });
            }
            return res.status(409).json({ success: false, message: '이미 다른 계정에 연동된 소셜 정보입니다.' });
        }

        // 2. 현재 사용자에게 카카오 정보 연동 (social_ids 배열에 추가)
        const userResult = await pool.query('SELECT social_ids FROM tba_users WHERE id = $1', [userId]);
        const currentSocialIds = userResult.rows[0]?.social_ids || [];
        const newSocialIds = [...currentSocialIds, { provider: provider, socialId: socialId }];
        
        await pool.query(
            'UPDATE tba_users SET social_ids = $1, social_id = $2, provider = $3 WHERE id = $4',
            [JSON.stringify(newSocialIds), socialId, provider, userId]
        );

        res.json({ success: true, message: '소셜 계정 연동 성공!' });
    } catch (error) {
        console.error('소셜 연동 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 회원가입 API
 * - 이메일 필드 추가
 */
router.post('/register', async (req, res) => {
    try {
        const { login_id, password, displayName, email } = req.body;
        if (!login_id || !password) {
            return res.status(400).json({ success: false, message: '필수 정보를 모두 입력해주세요.' });
        }

        const check = await pool.query('SELECT id FROM tba_users WHERE login_id = $1', [login_id]);
        if (check.rows.length > 0) {
            return res.status(409).json({ success: false, message: '이미 존재하는 아이디입니다.' });
        }

        // 이메일 중복 확인
        if (email) {
            const emailCheck = await pool.query('SELECT id FROM tba_users WHERE email = $1', [email]);
            if (emailCheck.rows.length > 0) {
                return res.status(409).json({ success: false, message: '이미 사용 중인 이메일입니다.' });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO tba_users (login_id, password, display_name, email) VALUES ($1, $2, $3, $4)',
            [login_id, hashedPassword, displayName || login_id, email || null]
        );

        res.status(201).json({ success: true, message: '회원가입 성공!' });
    } catch (error) {
        console.error('회원가입 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});


/**
 * 관리자용 가입자 목록 및 사용시간 조회 API
 * GET /api/auth/admin/users
 * (추후 관리자 인증 필요)
 */
router.get('/admin/users', async (req, res) => {
    try {
        // TODO: 관리자 인증 추가
        const query = `
            SELECT 
                u.id, 
                u.login_id, 
                u.display_name, 
                u.provider, 
                u.created_at, 
                u.last_login_at,
                COALESCE((SELECT SUM(duration_minutes) FROM tba_usage_logs WHERE user_id = u.id AND login_at >= date_trunc('month', CURRENT_DATE)), 0) as monthly_usage_minutes,
                (
                    COALESCE((SELECT SUM(OCTET_LENGTH(task)) FROM tba_todos WHERE user_id = u.id), 0) +
                    COALESCE((SELECT SUM(OCTET_LENGTH(data::text)) FROM tba_mindmaps WHERE user_id = u.id), 0)
                ) as data_size_bytes
            FROM tba_users u
            ORDER BY u.created_at DESC
        `;
        const result = await pool.query(query);
        res.json({
            success: true,
            users: result.rows
        });
    } catch (error) {
        console.error('관리자 가입자 목록 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 사용자 설정 업데이트 API
 * PATCH /api/auth/settings
 * - todoAutoDelete: 투두 자동 삭제
 * - email: 이메일
 * - newPassword: 새 비밀번호 (소셜 로그인 사용자가 일반 로그인 전환 시)
 */
router.patch('/settings', authenticateToken, async (req, res) => {
    try {
        const { todoAutoDelete, email, newPassword } = req.body;

        // 이메일 업데이트
        if (email !== undefined) {
            // 이메일 중복 확인
            if (email) {
                const emailCheck = await pool.query(
                    'SELECT id FROM tba_users WHERE email = $1 AND id != $2',
                    [email, req.user.id]
                );
                if (emailCheck.rows.length > 0) {
                    return res.status(409).json({ success: false, message: '이미 사용 중인 이메일입니다.' });
                }
            }
            await pool.query(
                'UPDATE tba_users SET email = $1 WHERE id = $2',
                [email || null, req.user.id]
            );
        }

        // 투두 자동 삭제 설정
        if (todoAutoDelete !== undefined) {
            await pool.query(
                'UPDATE tba_users SET todo_auto_delete = $1 WHERE id = $2',
                [todoAutoDelete, req.user.id]
            );
        }

        // 비밀번호 설정 (소셜 로그인 사용자의 일반 로그인 전환)
        if (newPassword !== undefined) {
            // 현재 사용자 정보 조회
            const userResult = await pool.query('SELECT * FROM tba_users WHERE id = $1', [req.user.id]);
            const user = userResult.rows[0];
            
            if (!user) {
                return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
            }
            
            // 이미 비밀번호가 있는 경우
            if (user.password) {
                return res.status(400).json({ success: false, message: '이미 비밀번호가 설정되어 있습니다.' });
            }
            
            // 소셜 계정이 연결되어 있는지 확인
            const hasSocialId = (user.social_ids && user.social_ids.length > 0) || user.social_id;
            if (!hasSocialId) {
                return res.status(400).json({ success: false, message: '소셜 계정이 연결되어 있지 않습니다.' });
            }
            
            // 비밀번호 해시화 후 저장
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await pool.query(
                'UPDATE tba_users SET password = $1 WHERE id = $2',
                [hashedPassword, req.user.id]
            );
            
            return res.json({ success: true, message: '비밀번호가 설정되었습니다. 이제 일반 로그인으로 로그인할 수 있습니다.' });
        }

        res.json({ success: true, message: '설정이 저장되었습니다.' });
    } catch (error) {
        console.error('설정 업데이트 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

/**
 * 비밀번호 재설정 - 1. 인증번호 요청 API
 * POST /api/auth/request-password-reset
 */
router.post('/request-password-reset', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, message: '이메일을 입력해 주세요.' });
        }

        // 1. 해당 이메일로 가입된 유저 찾기
        const userResult = await pool.query('SELECT id, login_id FROM tba_users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: '해당 이메일로 가입된 계정을 찾을 수 없습니다.' });
        }

        const user = userResult.rows[0];

        // 2. 6자리 랜덤 인증번호 생성
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // 3. 만료 시간 설정 (10분 후)
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        // 4. DB에 인증번호와 만료 시간 저장
        await pool.query(
            'UPDATE tba_users SET reset_code = $1, reset_code_expires_at = $2 WHERE id = $3',
            [resetCode, expiresAt, user.id]
        );

        // 5. 이메일 발송
        await sendPasswordResetEmail(email, resetCode);

        res.json({ success: true, message: '이메일로 인증번호가 발송되었습니다. 10분 내에 입력해 주세요.' });
    } catch (error) {
        console.error('인증번호 요청 에러:', error);
        res.status(500).json({ success: false, message: '인증번호 발송 중 서버 오류가 발생했습니다.' });
    }
});

/**
 * 비밀번호 재설정 - 2. 인증번호 확인 및 비밀번호 변경 API
 * POST /api/auth/verify-password-reset
 */
router.post('/verify-password-reset', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;

        if (!email || !code || !newPassword) {
            return res.status(400).json({ success: false, message: '모든 정보를 입력해 주세요.' });
        }

        if (newPassword.length < 4) {
            return res.status(400).json({ success: false, message: '새 비밀번호는 4자 이상이어야 합니다.' });
        }

        // 1. 사용자 찾기 및 인증번호 확인
        const userResult = await pool.query(
            'SELECT id, reset_code, reset_code_expires_at FROM tba_users WHERE email = $1',
            [email]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }

        const user = userResult.rows[0];

        // 2. 인증번호 검증
        if (!user.reset_code || user.reset_code !== code) {
            return res.status(400).json({ success: false, message: '잘못된 인증번호입니다.' });
        }

        // 3. 만료 시간 검증
        if (new Date() > new Date(user.reset_code_expires_at)) {
            // 토큰 만료됨, 초기화
            await pool.query(
                'UPDATE tba_users SET reset_code = NULL, reset_code_expires_at = NULL WHERE id = $1',
                [user.id]
            );
            return res.status(400).json({ success: false, message: '인증번호가 만료되었습니다. 다시 요청해 주세요.' });
        }

        // 4. 비밀번호 암호화 및 업데이트 (인증 정보 초기화 포함)
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query(
            'UPDATE tba_users SET password = $1, reset_code = NULL, reset_code_expires_at = NULL WHERE id = $2',
            [hashedPassword, user.id]
        );

        res.json({ success: true, message: '비밀번호가 성공적으로 변경되었습니다! 새 비밀번호로 로그인해 주세요.' });
    } catch (error) {
        console.error('비밀번호 변경 에러:', error);
        res.status(500).json({ success: false, message: '비밀번호 변경 중 서버 오류가 발생했습니다.' });
    }
});

/**
 * 아이디 중복 확인 API
 * GET /api/auth/check-login-id?login_id=...
 */
router.get('/check-login-id', async (req, res) => {
    try {
        const { login_id } = req.query;

        if (!login_id) {
            return res.status(400).json({ success: false, message: '아이디를 입력해 주세요.' });
        }

        const userResult = await pool.query('SELECT id FROM tba_users WHERE login_id = $1', [login_id]);

        if (userResult.rows.length > 0) {
            res.json({ available: false, message: '이미 사용 중인 아이디입니다.' });
        } else {
            res.json({ available: true, message: '사용 가능한 아이디입니다.' });
        }
    } catch (error) {
        console.error('아이디 중복 확인 에러:', error);
        res.status(500).json({ success: false, message: '아이디 중복 확인 중 서버 오류가 발생했습니다.' });
    }
});

module.exports = router;
