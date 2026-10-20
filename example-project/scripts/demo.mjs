import { captureUsage, renderUsage } from './usage-probe.mjs';

console.log('합성 검사 결과 전용 · 외부 서비스/자동 재실행/출시 승인 없음');
console.log(renderUsage(await captureUsage()));
