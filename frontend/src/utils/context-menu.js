/**
 * @file context-menu.js
 * @description 대시보드 커스텀 우클릭 메뉴 유틸리티
 */

export class ContextMenu {
    constructor() {
        this.menu = null;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        // 기존 메뉴가 있으면 제거
        const existing = document.getElementById('customContextMenu');
        if (existing) existing.remove();

        this.menu = document.createElement('div');
        this.menu.id = 'customContextMenu';
        this.menu.className = 'custom-context-menu';
        this.menu.style.display = 'none';
        this.menu.style.position = 'fixed';
        this.menu.style.zIndex = '10000';
        document.body.appendChild(this.menu);

        // 클릭 시 메뉴 닫기
        document.addEventListener('click', () => this.hide());
        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('#widgetGrid')) {
                this.hide();
            }
        });
    }

    show(x, y, items) {
        this.menu.innerHTML = '';

        items.forEach(item => {
            if (item.type === 'separator') {
                const sep = document.createElement('div');
                sep.className = 'menu-separator';
                this.menu.appendChild(sep);
                return;
            }

            const menuItem = document.createElement('div');
            menuItem.className = 'menu-item';

            const iconHtml = item.icon ? `<span class="menu-icon">${item.icon}</span>` : '';
            menuItem.innerHTML = `
                ${iconHtml}
                <span class="menu-label">${item.label}</span>
            `;

            menuItem.addEventListener('click', (e) => {
                e.stopPropagation(); // 부모(document)로 클릭 이벤트 전파 방지
                item.action();
                this.hide();
            });
            this.menu.appendChild(menuItem);
        });

        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;
        this.menu.classList.remove('hide');
        this.menu.style.display = 'block';

        // 화면 밖으로 나가는 것 방지 (가로)
        const rect = this.menu.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) {
            this.menu.style.left = `${window.innerWidth - rect.width - 15}px`;
        }
        // 세로 위치 보정 및 화면 밖 나감 방지
        if (y + rect.height > window.innerHeight) {
            this.menu.style.top = `${Math.max(10, window.innerHeight - rect.height - 15)}px`;
        }
    }

    hide() {
        if (this.menu) {
            this.menu.style.display = 'none';
        }
    }
}

export const contextMenu = new ContextMenu();
