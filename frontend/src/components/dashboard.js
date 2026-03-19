/**
 * @file dashboard.js
 * @description 대시보드의 HTML 구조를 생성하고 UI 레이아웃을 관리합니다.
 */

/**
 * 대시보드 기본 레이아웃 HTML을 반환합니다.
 * @param {object} user - 유저 정보
 * @returns {string} 대시보드 HTML 문자열
 */
export function getDashboardHTML(user) {
  // 디버깅
  console.log('[Dashboard] user info:', user);

  // social_ids 배열에서 연결된 provider 목록 추출 (하위 호환성: socialProvider도 확인)
  const socialIds = user.socialIds || [];
  const connectedProviders = socialIds.map(s => s.provider).filter(Boolean);

  // 단일 provider 필드도 하위 호환성을 위해 확인
  if (user.socialProvider && !connectedProviders.includes(user.socialProvider)) {
    connectedProviders.push(user.socialProvider);
  }

  // 프로바이더 배지 생성 함수
  const getProviderBadge = (provider, isLinked = true) => {
    const label = provider === 'kakao' ? 'K' : (provider === 'naver' ? 'N' : (provider === 'github' ? 'G' : (provider === 'google' ? '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>' : provider.charAt(0).toUpperCase())));
    const title = isLinked ? `${provider} 계정으로 연동되었습니다.` : `${provider} 계정 연동`;
    const className = isLinked ? 'badge-social linked' : `btn-link-mini ${provider}`;
    const content = isLinked ? label : `Link ${label}`;
    const id = isLinked ? '' : `id="link${provider.charAt(0).toUpperCase() + provider.slice(1)}Btn"`;
    return `<span class="${className} ${provider}" title="${title}" ${id}>${content}</span>`;
  };

  // 연결된 모든 프로바이더에 대한 배지 HTML 생성
  const connectedBadgesHtml = connectedProviders
    .map(provider => getProviderBadge(provider, true))
    .join(' ');

  // 연결되지 않은 프로바이더에 대한 링크 버튼 생성 (모달 창 내부용)
  const allProviders = ['kakao', 'naver', 'google'];
  const unconnectedProviders = allProviders.filter(p => !connectedProviders.includes(p));
  
  const socialLinkCards = unconnectedProviders.map(provider => {
      let bgColor, textColor, label, icon;
      if (provider === 'kakao') { bgColor = '#FEE500'; textColor = '#000000'; label = '카카오 계정 연동'; icon = 'K'; }
      else if (provider === 'naver') { bgColor = '#03C75A'; textColor = '#FFFFFF'; label = '네이버 계정 연동'; icon = 'N'; }
      else if (provider === 'google') { 
          bgColor = '#FFFFFF'; 
          textColor = '#000000'; 
          label = 'Google 계정 연동'; 
          icon = '<svg viewBox="0 0 24 24" width="20" height="20" style="display:block;"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>'; 
      }
      
      return `
        <button id="link${provider.charAt(0).toUpperCase() + provider.slice(1)}Btn" style="
            width: 100%; padding: 12px; margin-bottom: 8px; border: ${provider==='google'?'1px solid #ddd':'none'};
            border-radius: 8px; background: ${bgColor}; color: ${textColor};
            font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
            transition: opacity 0.2s;
        " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
            <span style="font-weight: 800; font-size: 16px;">${icon}</span> ${label}
        </button>
      `;
  }).join('');
  
  const connectedSocialCards = connectedProviders.map(provider => {
      let label = provider === 'kakao' ? '카카오' : (provider === 'naver' ? '네이버' : (provider === 'github' ? 'GitHub' : 'Google'));
      return `
        <div style="width: 100%; padding: 12px; margin-bottom: 8px; border: 1px solid #eee; border-radius: 8px; background: #f8f9fa; color: #6c757d; font-weight: 500; display: flex; justify-content: space-between; align-items: center;">
            <span>✔️ ${label} 연동됨</span>
            <span style="font-size: 12px; color: #17a2b8; font-weight: 600;">연결됨</span>
        </div>
      `;
  }).join('');

  const socialIntegrationSection = `
    <div style="margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px;">
        <h4 style="margin: 0 0 12px 0; color: #495057; font-size: 14px;">소셜 계정 연동</h4>
        ${connectedSocialCards}
        ${socialLinkCards}
    </div>
  `;

  // 이메일 미등록 알림
  const needsEmail = !user.email;
  const needsPassword = !user.hasPassword;

  let warningsCards = '';
  if (needsEmail) {
    warningsCards += `
      <div style="background: #fff3cd; color: #856404; padding: 12px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #ffeeba; display: flex; flex-direction: column; gap: 8px;">
        <span style="font-size: 14px;">📧 이메일을 등록하면 카카오/네이버 계정과 연동할 수 있습니다.</span>
        <button id="addEmailBtn" style="background: #ffc107; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: 600; text-align: center;">이메일 추가</button>
      </div>
    `;
  }
  if (needsPassword) {
    warningsCards += `
      <div style="background: #cce5ff; color: #004085; padding: 12px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #b8daff; display: flex; flex-direction: column; gap: 8px;">
        <span style="font-size: 14px;">🔐 일반 로그인을 위해 아이디와 비밀번호를 설정 해보세요.</span>
        <button id="setPasswordBtn" style="background: #007bff; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: 600; text-align: center;">비밀번호 설정</button>
      </div>
    `;
  }
  
  if (!needsEmail && !needsPassword) {
      warningsCards = `
        <div style="text-align: center; padding: 24px; color: #28a745; background: #e8f5e9; border-radius: 8px; margin-bottom: 16px; font-weight: 500;">
           ✔️ 모든 권장 설정이 완료되었습니다.
        </div>
      `;
  }

  const securitySection = `
    <div style="margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px;">
        <h4 style="margin: 0 0 12px 0; color: #495057; font-size: 14px;">보안</h4>
        <button id="openNicknameChangeSubBtn" style="width: 100%; padding: 10px; margin-bottom: 8px; background: #f8f9fa; color: #495057; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; text-align: left; font-weight: 500; font-size: 14px;">👤 닉네임 변경</button>
        <button id="openPasswordResetSubBtn" style="width: 100%; padding: 10px; background: #f8f9fa; color: #495057; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; text-align: left; font-weight: 500; font-size: 14px;">🔒 비밀번호 변경</button>
    </div>
  `;

  const displaySection = `
    <div style="margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px;">
        <h4 style="margin: 0 0 12px 0; color: #495057; font-size: 14px;">디스플레이</h4>
        <button id="openThemeChangeSubBtn" style="width: 100%; padding: 10px; background: #f8f9fa; color: #495057; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; text-align: left; font-weight: 500; font-size: 14px;">🎨 테마 변경</button>
    </div>
  `;

  // --- Sub-View for Theme Change ---
  const themeChangeSubView = `
    <div id="themeChangeSubView" style="display: none; margin-top: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h4 style="margin: 0; color: #333; font-size: 16px;">테마 변경</h4>
            <button id="closeThemeChangeSubBtn" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">&times;</button>
        </div>
        <p style="font-size: 13px; color: #666; margin-bottom: 16px;">대시보드의 분위기를 선택해 보세요.</p>
        <div class="theme-picker-premium" style="display: flex; justify-content: space-around; background: #f8f9fa; padding: 20px; border-radius: 12px; border: 1px solid #eee;">
            <button class="theme-chip midnight" data-theme="midnight" title="Midnight" style="width: 40px; height: 40px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; background: #0f172a; transition: all 0.2s;"></button>
            <button class="theme-chip blueprint" data-theme="blueprint" title="Blueprint" style="width: 40px; height: 40px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; background: #1e293b; transition: all 0.2s;"></button>
            <button class="theme-chip classic" data-theme="classic" title="Classic" style="width: 40px; height: 40px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; background: #f8fafc; transition: all 0.2s;"></button>
            <button class="theme-chip dark" data-theme="dark" title="Dark" style="width: 40px; height: 40px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; background: #050505; transition: all 0.2s;"></button>
        </div>
        <style>
            .theme-chip.active { border-color: #8B5CF6 !important; transform: scale(1.1); box-shadow: 0 0 10px rgba(139, 92, 246, 0.3); }
        </style>
    </div>
  `;

  // --- Sub-View for Nickname Change ---
  const nicknameChangeSubView = `
    <div id="nicknameChangeSubView" style="display: none; margin-top: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h4 style="margin: 0; color: #333; font-size: 16px;">닉네임 변경</h4>
            <button id="closeNicknameChangeSubBtn" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">&times;</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 12px;">
            <input type="text" id="changeDisplayNameInput" value="${user.displayName || ''}" placeholder="새 닉네임 입력" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; font-size: 14px;">
            <button id="submitNicknameBtn" style="width: 100%; padding: 12px; background: #8B5CF6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px;">닉네임 변경 적용</button>
        </div>
    </div>
  `;

  // --- Sub-View (Hidden by default) for Password Reset ---
  const passwordResetSubView = `
    <div id="passwordResetSubView" style="display: none; margin-top: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h4 style="margin: 0; color: #333; font-size: 16px;">비밀번호 변경</h4>
            <button id="closePasswordResetSubBtn" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">&times;</button>
        </div>
        <div id="pwdResetStep1">
            <input type="email" id="resetEmail" placeholder="가입한 이메일 입력" value="${user.email || ''}" ${user.email ? 'readonly' : ''} style="width: 100%; padding: 10px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; background: ${user.email ? '#f8f9fa' : '#fff'}; color: ${user.email ? '#6c757d' : '#000'};">
            <button id="sendResetCodeBtn" style="width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">인증번호 발송</button>
        </div>
        <div id="pwdResetStep2" style="display: none; margin-top: 12px; background: #f8f9fa; padding: 12px; border-radius: 8px; border: 1px solid #e9ecef;">
            <p style="font-size: 12px; color: #28a745; margin-top: 0; margin-bottom: 8px;">✔️ 인증번호가 이메일로 발송되었습니다. (10분 유효)</p>
            <input type="text" id="resetCode" placeholder="6자리 인증번호" style="width: 100%; padding: 10px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
            <input type="password" id="resetNewPassword" placeholder="새 비밀번호 입력 (4자 이상)" style="width: 100%; padding: 10px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
            <button id="verifyAndResetPwdBtn" style="width: 100%; padding: 10px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">비밀번호 변경 완료</button>
        </div>
    </div>
  `;

  const setupModalOverlay = `
    <div id="setupWarningModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 9000; justify-content: center; align-items: center;">
      <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 400px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto; position: relative;">
        <!-- 상단 우측 닫기 버튼 -->
        <button id="closeSetupWarningHeaderBtn" style="position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 24px; color: #adb5bd; cursor: pointer; padding: 4px 8px; line-height: 1; transition: color 0.2s, transform 0.2s; z-index: 10;" title="닫기">&times;</button>
        
        <div id="mainSettingsView">
            <h3 style="margin-top: 0; color: #333; margin-bottom: 16px; border-bottom: 1px solid #eee; padding-bottom: 12px; padding-right: 30px;">내 정보 / 설정</h3>
            ${warningsCards}
            ${socialIntegrationSection}
            ${securitySection}
            ${displaySection}
            <button id="modalFeedbackBtn" class="mobile-only-btn" style="width: 100%; padding: 10px; margin-top: 16px; background: #f8f9fa; color: #495057; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; text-align: left; font-weight: 500; font-size: 14px; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">📢</span> 고객의 소리함 (Q&A)
            </button>
            <button id="modalLogoutBtn" class="btn-logout-modal mobile-only-btn" style="width: 100%; padding: 12px; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; cursor: pointer; margin-top: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                로그아웃
            </button>
            <button id="closeSetupWarningBtn" style="width: 100%; padding: 10px; background: #f1f3f5; color: #495057; border: none; border-radius: 6px; cursor: pointer; margin-top: 8px; font-weight: 600; transition: background 0.2s;">닫기</button>
        </div>
        
        ${themeChangeSubView}
        ${nicknameChangeSubView}
        ${passwordResetSubView}

      </div>
    </div>
  `;

  return `
    <div class="bg-particles" id="particles2"></div>
    <div class="dashboard-container">
      <header class="dashboard-header">
        <div class="logo-section">
          ${getLogoSVG()}
          <h2>MindMap</h2>
        </div>
        <div class="user-section">
          <div class="user-profile-btn" id="userProfileBtn" title="내 정보 / 설정" style="order: 1; cursor: pointer; display: flex; align-items: center; gap: 10px; padding: 6px 16px 6px 8px; border-radius: 30px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); transition: all 0.2s; user-select: none;">
            <div class="avatar" style="width: 32px; height: 32px; background: linear-gradient(135deg, #8B5CF6, #06B6D4); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
              ${(user.displayName || user.login_id).charAt(0).toUpperCase()}
            </div>
            <span class="user-name mobile-hide" data-user-debug="${user.login_id}" style="font-size: 14px; font-weight: 500;"><strong>${user.displayName || user.login_id}</strong>님</span>
            <span class="badges-wrapper mobile-hide" style="display: flex; gap: 4px;">${connectedBadgesHtml}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6; margin-left: 4px;"><path d="M11.4 18.16l-7.2-7.2a2 2 0 0 1 0-2.83l7.2-7.2a2 2 0 0 1 2.83 2.83L8.66 9.4h11.18a2 2 0 0 1 2 2v1.2a2 2 0 0 1-2 2H8.66l5.57 5.57a2 2 0 0 1-2.83 2.83z" display="none"/><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
          <div class="nav-actions" style="order: 2;">
            <!-- PC 표준 순서 유지 -->
            <button class="btn-manual" id="manualBtn" style="order: 1;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
              <span class="btn-text">매뉴얼</span>
            </button>
            <button class="btn-collapse-all mobile-only-btn" id="collapseAllBtn" style="display:none; order: 2;" title="모든 위젯 접기/펴기">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
              <span class="btn-text">모두 접기</span>
            </button>
            <button class="btn-feedback mobile-hide" id="feedbackBtn" style="order: 3;">소리함</button>
            <button class="btn-reorder mobile-only-btn" id="mobileReorderBtn" style="order: 4;" title="위젯 이동 모드">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1.5"></circle><circle cx="9" cy="5" r="1.5"></circle><circle cx="9" cy="19" r="1.5"></circle><circle cx="15" cy="12" r="1.5"></circle><circle cx="15" cy="5" r="1.5"></circle><circle cx="15" cy="19" r="1.5"></circle></svg>
                <span class="btn-text">이동</span>
            </button>
            ${(user && user.login_id && user.login_id.toLowerCase() === 'admin') ? `<button class="btn-admin" id="adminBtn" style="order: 5;">관리자</button>` : ''}
            <button class="btn-logout mobile-hide" id="logoutBtn" style="order: 6;">로그아웃</button>
          </div>
        </div>
      </header>
      <div class="dashboard-content" id="dashboardContent">
        ${getMainDashboardContentHTML(user)}
      </div>

      <!-- 매뉴얼 팝업 -->
      <div class="manual-popup hidden" id="manualPopup">
        <div class="manual-header">
          <span style="flex:1;">📝 MindMap 사용 매뉴얼</span>
          <button class="close-popup" id="closeManual">×</button>
        </div>
        <div class="manual-content" id="manualContent" style="overflow-y:auto; max-height:60vh; padding:18px 8px 8px 8px; background:rgba(255,255,255,0.03); border-radius:12px;">
          로딩 중...
        </div>
      </div>

      <!-- 플로팅 메모 버튼 (FAB) -->
      <button class="memo-fab" id="memoFab" title="메모장 열기">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
      </button>

      <!-- 메모 팝업 -->
      <div class="memo-popup hidden" id="memoPopup">
        <div class="memo-header">
          <span style="flex:1;">빠른 메모 (수식 지원)</span>
          <button class="close-popup" id="closeMemo">×</button>
        </div>

        <!-- D-Day 위젯 -->
        <div class="dday-widget">
            <div class="dday-header-row">
                <span class="dday-title">오늘 날짜</span>
                <span class="dday-today" id="todayDate">-</span>
            </div>
            <div class="dday-header-row" style="cursor:pointer;" id="targetDateRow">
                <span class="dday-title">목표 날짜</span>
                <span class="dday-today" id="targetDateDisplay" style="color:var(--text-primary);">-</span>
                <input type="date" id="ddayInput" class="dday-input" style="position:absolute; opacity:0; pointer-events:none;">
            </div>
            <div class="dday-content">
                <div class="dday-item">
                    <span class="dday-label">D-Day</span>
                    <span class="dday-value" id="ddayCount">-</span>
                </div>
                <div class="dday-item">
                    <span class="dday-label">남은 토요일</span>
                    <span class="dday-value" id="saturdayCount">-</span>
                </div>
            </div>
        </div>

      <div id="spreadsheet-widget"></div>
      </div>
      ${setupModalOverlay}
    </div>
    </div>
  `;
}

/**
 * 로고 SVG 문자열을 반환합니다.
 */
function getLogoSVG() {
  return `
    <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="8" fill="url(#grad1)" />
        <circle cx="24" cy="8" r="4" fill="url(#grad2)" />
        <circle cx="38" cy="16" r="4" fill="url(#grad2)" />
        <circle cx="38" cy="32" r="4" fill="url(#grad2)" />
        <circle cx="24" cy="40" r="4" fill="url(#grad2)" />
        <circle cx="10" cy="32" r="4" fill="url(#grad2)" />
        <circle cx="10" cy="16" r="4" fill="url(#grad2)" />
        <defs>
          <linearGradient id="grad1" x1="16" y1="16" x2="32" y2="32">
            <stop stop-color="#8B5CF6"/>
            <stop offset="1" stop-color="#06B6D4"/>
          </linearGradient>
          <linearGradient id="grad2" x1="0" y1="0" x2="48" y2="48">
            <stop stop-color="#A78BFA"/>
            <stop offset="1" stop-color="#22D3EE"/>
          </linearGradient>
        </defs>
    </svg>`;
}

/**
 * 대시보드 메인 콘텐츠 영역(#dashboardContent)의 HTML만 반환합니다.
 */
export function getMainDashboardContentHTML(user) {
  return `
        <div class="dashboard-main-split">
          <!-- 상단: 환영 메시지 섹션 (Full Width) -->
          <div class="welcome-section wide-layout" id="welcomeSection">
            <div class="welcome-card-premium premium-glass">
              <button class="welcome-close-btn" id="closeWelcomeBtn" title="닫기">&times;</button>
              <div class="welcome-header-content">
                <div class="welcome-icon">🧠</div>
                <div class="welcome-text">
                  <h2>마인드맵에 오신 것을 환영합니다!</h2>
                  <p>나만의 복잡한 생각을 시각화하고 <strong>Private To-Do</strong>와 <strong>마일스톤</strong>으로 체계적으로 관리해보세요.</p>
                </div>
              </div>
              <div class="welcome-info-strip">
                <div class="info-links">
                  <span>현재 PC 버전에 최적화되어 있습니다.</span>
                  <span>업데이트 소식은 하단의 <strong>Version</strong>을 클릭해주세요.</span>
                </div>
                <!-- 다시 보지 않기 -->
                <label class="welcome-dont-show">
                  <input type="checkbox" id="dontShowAgainCheckbox"> 다시 보지 않기
                </label>
              </div>
            </div>
          </div>

          <!-- 상단: 중앙 로고 섹션 (환영 메시지 숨김 시 노출) -->
          <div class="central-logo-section hidden" id="centralLogoSection">
            <div class="central-logo-content">
              <div class="mega-logo">
                ${getLogoSVG()}
              </div>
              <h1>${user.displayName || user.login_id}'s MindMap</h1>
            </div>
          </div>

          <!-- 하단: 위젯 섹션 (Wide Whiteboard) -->
          <div class="widgets-section wide-layout">
            <div class="dashboard-grid-v2" id="widgetGrid">
              <!-- 동적 위젯이 여기에 렌더링됩니다 -->
            </div>
          </div>

        </div>
  `;
}
