/**
 * @file mindmap-engine.js
 * @description 자유 드로잉 데이터를 분석하여 정제된 도형(원, 사각형)으로 변환하는 엔진입니다.
 */

export class MindmapEngine {
    constructor() {
        this.points = [];
    }

    /**
     * 드로잉 포인트 추가
     */
    addPoint(x, y) {
        this.points.push({ x, y });
    }

    /**
     * 드로잉 데이터 초기화
     */
    clearPoints() {
        this.points = [];
    }

    /**
     * 현재 드로잉 데이터를 분석하여 도형 정보를 반환
     * @returns {Object|null} { type: 'circle'|'rect', x, y, width, height, radius }
     */
    recognizeShape() {
        if (this.points.length < 10) return null;

        const { minX, minY, maxX, maxY } = this.getBoundingBox();
        const width = maxX - minX;
        const height = maxY - minY;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        if (width < 20 || height < 20) return null;

        // 원형 판별: 각 포인트가 중심에서 반지름만큼 떨어져 있는지 확인
        const radius = (width + height) / 4;
        let circleError = 0;
        this.points.forEach(p => {
            const dist = Math.sqrt(Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2));
            circleError += Math.abs(dist - radius);
        });
        const avgCircleError = circleError / this.points.length;

        // 사각형 판별: 포인트들이 바운딩 박스의 경계에 밀집되어 있는지 확인
        let rectError = 0;
        this.points.forEach(p => {
            const dx = Math.min(Math.abs(p.x - minX), Math.abs(p.x - maxX));
            const dy = Math.min(Math.abs(p.y - minY), Math.abs(p.y - maxY));
            rectError += Math.min(dx, dy);
        });
        const avgRectError = rectError / this.points.length;

        console.log(`[MindmapEngine] Circle Error: ${avgCircleError.toFixed(2)}, Rect Error: ${avgRectError.toFixed(2)}`);

        // 에러값이 낮은 쪽으로 결정 (임계값 설정 필요)
        if (avgCircleError < avgRectError && avgCircleError < radius * 0.3) {
            return { type: 'circle', x: centerX, y: centerY, radius };
        } else if (avgRectError < avgCircleError && avgRectError < Math.min(width, height) * 0.3) {
            return { type: 'rect', x: minX, y: minY, width, height };
        }

        // 기본적으로 인식이 모호하면 사각형으로 간주하거나 null 반환
        return { type: 'rect', x: minX, y: minY, width, height };
    }

    getBoundingBox() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.points.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        });
        return { minX, minY, maxX, maxY };
    }
}

export const mindmapEngine = new MindmapEngine();
