/**
 * @file manual-popup.js
 * @description 대시보드 매뉴얼 팝업 이벤트 바인딩을 담당합니다.
 */

// 매뉴얼 팝업 동작 스크립트 (대시보드 진입 시 실행)
export function setupManualPopup() {
  console.log('[매뉴얼] setupManualPopup 실행');
  const manualBtn = document.getElementById('manualBtn');
  const manualPopup = document.getElementById('manualPopup');
  const closeManual = document.getElementById('closeManual');
  const manualContent = document.getElementById('manualContent');
  if (!manualBtn || !manualPopup || !closeManual || !manualContent) return;

  if (!manualBtn._manualListenerAdded) {
    manualBtn.addEventListener('click', async () => {
      manualPopup.classList.remove('hidden');
      // 매뉴얼 파일 불러오기
      try {
        const res = await fetch('manual.md');
        const text = await res.text();
        manualContent.innerHTML = marked ? marked.parse(text) : `<pre>${text}</pre>`;
      } catch {
        manualContent.innerHTML = '<pre>매뉴얼을 불러올 수 없습니다.</pre>';
      }
    });
    manualBtn._manualListenerAdded = true;
  }

  if (!closeManual._manualListenerAdded) {
    closeManual.addEventListener('click', () => {
      manualPopup.classList.add('hidden');
    });
    closeManual._manualListenerAdded = true;
  }
}

