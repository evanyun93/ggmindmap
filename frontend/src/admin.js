// admin.js
// 관리자 전용 페이지 모듈

import { fetchAdminUsers } from './services/api.js';
import { safeLocalStorage } from './utils/storage.js';

/**
 * 관리자 페이지 오버레이 생성 및 표시
 */
function createAdminOverlay() {
  if (document.getElementById('adminOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'adminOverlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(15, 23, 42, 0.98); z-index: 9999;
    display: flex; flex-direction: column; padding: 40px;
    overflow-y: auto; color: #f8fafc; font-family: 'Inter', sans-serif;
  `;

  overlay.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto; width: 100%;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
        <h2 style="margin: 0; font-size: 2rem; background: linear-gradient(to right, #8B5CF6, #06B6D4); -webkit-background-clip: text; color: transparent;">관리자 대시보드</h2>
        <button id="closeAdmin" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; padding: 10px 20px; border-radius: 8px; cursor: pointer; transition: 0.3s;">닫기</button>
      </div>
      <div id="adminUserList" style="background: rgba(255,255,255,0.03); border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); padding: 20px; min-height: 400px;">
        <div class="loader-admin">로딩 중...</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('closeAdmin').onclick = () => {
    overlay.remove();
  };
}

let adminUsersData = [];
let sortState = { key: 'created_at', desc: true };

window.sortAdminUsers = (key) => {
  if (sortState.key === key) {
    sortState.desc = !sortState.desc;
  } else {
    sortState.key = key;
    sortState.desc = true;
  }
  renderAdminTable();
};

const formatSize = (bytes) => {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

function renderAdminTable() {
  const container = document.getElementById('adminUserList');
  if (!container) return;

  const users = [...adminUsersData];
  users.sort((a, b) => {
    let valA = a[sortState.key];
    let valB = b[sortState.key];
    
    // 타임스탬프 변환
    if (sortState.key === 'created_at' || sortState.key === 'last_login_at') {
      valA = valA ? new Date(valA).getTime() : 0;
      valB = valB ? new Date(valB).getTime() : 0;
    } else {
      valA = valA || 0;
      valB = valB || 0;
    }
    
    if (valA < valB) return sortState.desc ? 1 : -1;
    if (valA > valB) return sortState.desc ? -1 : 1;
    return 0;
  });

  const getSortIcon = (key) => {
    if (sortState.key !== key) return '<span style="color:transparent; font-size: 0.8em; margin-left: 4px;">▼</span>';
    return sortState.desc 
        ? '<span style="color:#a78bfa; font-size: 0.8em; margin-left: 4px;">▼</span>' 
        : '<span style="color:#a78bfa; font-size: 0.8em; margin-left: 4px;">▲</span>';
  };

  container.innerHTML = `
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.95rem;">
      <thead>
        <tr style="text-align: left; border-bottom: 2px solid rgba(255,255,255,0.1); color: #94a3b8; user-select: none;">
          <th style="padding: 12px;">ID</th>
          <th style="padding: 12px;">아이디/닉네임</th>
          <th style="padding: 12px; cursor: pointer; transition: color 0.2s;" onclick="window.sortAdminUsers('created_at')" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#94a3b8'">
            가입일 ${getSortIcon('created_at')}
          </th>
          <th style="padding: 12px; cursor: pointer; transition: color 0.2s;" onclick="window.sortAdminUsers('last_login_at')" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#94a3b8'">
            최근 활동 ${getSortIcon('last_login_at')}
          </th>
          <th style="padding: 12px;">월 사용시간</th>
          <th style="padding: 12px; cursor: pointer; transition: color 0.2s;" onclick="window.sortAdminUsers('data_size_bytes')" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#94a3b8'">
            용량 ${getSortIcon('data_size_bytes')}
          </th>
        </tr>
      </thead>
      <tbody>
        ${users.map(u => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
            <td style="padding: 15px; color: #64748b;">${u.id}</td>
            <td style="padding: 15px;">
              <div style="font-weight: 600;">${u.display_name || u.login_id}</div>
              <div style="font-size: 0.8rem; color: #64748b;">@${u.login_id} (${u.provider || 'local'})</div>
            </td>
            <td style="padding: 15px; color: #94a3b8;">${formatDate(u.created_at)}</td>
            <td style="padding: 15px; color: #a78bfa; font-weight: 500;">${formatDate(u.last_login_at)}</td>
            <td style="padding: 15px; color: #06b6d4;">${u.monthly_usage_minutes || 0} 분</td>
            <td style="padding: 15px;">
              <span style="background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 6px; font-family: monospace;">${formatSize(u.data_size_bytes || 0)}</span>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function loadUserList() {
  const container = document.getElementById('adminUserList');
  if (!container) return;

  const token = safeLocalStorage.getItem('adminToken') || 'dummy-admin-token';

  try {
    const res = await fetchAdminUsers(token);

    if (!res || !res.success) {
      container.innerHTML = `<div style="color: #ef4444; text-align: center; padding: 40px;">데이터를 불러오는 데 실패했습니다: ${res?.message || '알 수 없는 서버 오류'}</div>`;
      return;
    }

    if (!res.users || res.users.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 40px;">가입된 사용자가 없습니다.</div>`;
      return;
    }

    adminUsersData = res.users;
    renderAdminTable();
  } catch (err) {
    console.error('관리자 페이지 로드 에러:', err);
    container.innerHTML = `<div style="color: #ef4444; text-align: center; padding: 40px;">클라이언트 오류 발생: ${err.message}</div>`;
  }
}

/**
 * 관리자 로그인 화면 (오버레이 내부에 표시)
 */
function renderAdminLogin() {
  if (document.getElementById('adminOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'adminOverlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(15, 23, 42, 0.95); z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    color: #f8fafc; font-family: 'Inter', sans-serif;
  `;

  overlay.innerHTML = `
    <div style="background: #1e293b; padding: 40px; border-radius: 20px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); width: 400px; border: 1px solid rgba(255,255,255,0.1);">
      <h2 style="margin-top: 0; text-align: center;">관리자 보안 인증</h2>
      <p style="text-align: center; color: #94a3b8; margin-bottom: 25px;">보안을 위해 비밀번호를 입력하세요.</p>
      <input type="password" id="adminPw" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: white; margin-bottom: 15px;" placeholder="비밀번호">
      <button id="adminLoginBtn" style="width: 100%; padding: 12px; border-radius: 8px; border: none; background: linear-gradient(to right, #8B5CF6, #06B6D4); color: white; font-weight: 600; cursor: pointer; transition: 0.3s;">인증하기</button>
      <div id="adminLoginMsg" style="color: #ef4444; margin-top: 15px; text-align: center; font-size: 0.9rem;"></div>
      <button id="cancelAdmin" style="width: 100%; margin-top: 10px; background: transparent; border: none; color: #64748b; cursor: pointer;">취소</button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('adminLoginBtn').onclick = () => {
    const pw = document.getElementById('adminPw').value;
    if (pw === '1234') {
      safeLocalStorage.setItem('adminToken', 'dummy-admin-token');
      overlay.remove();
      createAdminOverlay();
      loadUserList();
    } else {
      document.getElementById('adminLoginMsg').innerText = '비밀번호가 올바르지 않습니다.';
    }
  };

  document.getElementById('cancelAdmin').onclick = () => overlay.remove();
  document.getElementById('adminPw').onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('adminLoginBtn').click(); };
}

export function initAdmin() {
  if (safeLocalStorage.getItem('adminToken') === 'dummy-admin-token') {
    createAdminOverlay();
    loadUserList();
  } else {
    renderAdminLogin();
  }
}
