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
        
        // 삼각형 판별: 하단(minX, maxY ~ maxX, maxY), 좌측(centerX, minY ~ minX, maxY), 우측(centerX, minY ~ maxX, maxY) 세 변과의 거리
        let triError = 0;
        const distToLine = (p, p1, p2) => {
            const num = Math.abs((p2.x - p1.x) * (p1.y - p.y) - (p1.x - p.x) * (p2.y - p1.y));
            const den = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            return num / den;
        };
        const pTop = { x: centerX, y: minY };
        const pLeft = { x: minX, y: maxY };
        const pRight = { x: maxX, y: maxY };
        
        this.points.forEach(p => {
            const d1 = distToLine(p, pLeft, pRight);
            const d2 = distToLine(p, pTop, pLeft);
            const d3 = distToLine(p, pTop, pRight);
            triError += Math.min(d1, d2, d3);
        });
        const avgTriError = triError / this.points.length;

        console.log(`[MindmapEngine] Circle Error: ${avgCircleError.toFixed(2)}, Rect Error: ${avgRectError.toFixed(2)}, Tri Error: ${avgTriError.toFixed(2)}`);

        // 에러값이 가장 낮은 도형으로 결정
        const threshold = Math.min(width, height) * 0.35;
        const errors = [
            { type: 'circle', error: avgCircleError, data: { type: 'circle', x: centerX, y: centerY, radius } },
            { type: 'rect', error: avgRectError, data: { type: 'rect', x: minX, y: minY, width, height } },
            { type: 'triangle', error: avgTriError, data: { type: 'triangle', x: centerX, y: centerY, width, height } }
        ];
        
        // 필터링 및 정렬
        const validShapes = errors.filter(s => s.error < threshold).sort((a, b) => a.error - b.error);
        
        if (validShapes.length > 0) {
            return validShapes[0].data;
        }

        // 도저히 인식이 안 되면 기본적으로 사각형 반환
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
