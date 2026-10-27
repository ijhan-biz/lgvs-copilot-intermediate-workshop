import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readScopedFile } from './scoped-files.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const reportScript = fileURLToPath(new URL('./web-report.mjs', import.meta.url));
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};

// A fresh process per request reads the current src/ instead of the copy loaded at startup.
export function computeReport(root = projectRoot) {
  return new Promise(done => {
    const child = spawn(process.execPath, [reportScript, '--root', root], { cwd: root, timeout: 30000 });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => {
      if (code === 0) {
        try { return done({ ok: true, report: JSON.parse(stdout) }); } catch { /* reported below */ }
      }
      const detail = stderr.split('\n').map(line => line.trim()).filter(Boolean)
        .find(line => /^(?:[A-Za-z]*Error|TypeError|SyntaxError)\b/.test(line)) ?? stderr.trim().split('\n').at(-1) ?? '';
      done({ ok: false, code, detail: detail.replaceAll(root, '.').slice(0, 400), stderr });
    });
  });
}

function respond(request, response, status, contentType, body, extraHeaders = {}) {
  response.writeHead(status, {
    ...headers,
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

export function createDashboardServer(root = projectRoot) {
  return createServer(async (request, response) => {
    const json = (status, body, extraHeaders) => respond(
      request, response, status, 'application/json; charset=utf-8', JSON.stringify(body), extraHeaders,
    );
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        json(405, { error: '읽기 전용입니다. GET 또는 HEAD만 사용할 수 있습니다.' }, { Allow: 'GET, HEAD' });
        return;
      }
      const { pathname } = new URL(request.url, 'http://127.0.0.1');
      if (pathname === '/' || pathname === '/index.html') {
        const html = await readScopedFile(root, 'web/index.html');
        respond(request, response, 200, 'text/html; charset=utf-8', html);
      } else if (pathname === '/api/report') {
        const result = await computeReport(root);
        if (result.ok) json(200, result.report);
        else {
          console.error('웹 결과 뷰어 계산 실패:', result.stderr.trim());
          json(500, { error: '지금 코드로 결과를 계산하지 못했습니다. 아래 오류를 보고 파일을 고친 뒤 새로고침하세요.', detail: result.detail });
        }
      } else if (pathname === '/favicon.ico') {
        response.writeHead(204, headers);
        response.end();
      } else {
        json(404, { error: '찾을 수 없는 주소입니다.' });
      }
    } catch (error) {
      console.error('웹 결과 뷰어 요청 실패:', error);
      json(500, { error: '결과를 불러오지 못했습니다. 터미널의 오류를 확인한 뒤 다시 시도하세요.' });
    }
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const value = process.env.PORT ?? '4173';
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT는 1~65535 사이의 정수여야 합니다.');
    process.exitCode = 1;
  } else {
    const server = createDashboardServer();
    server.on('error', error => {
      const hint = error.code === 'EADDRINUSE' ? ` 다른 번호로 열려면: PORT=${port + 1} npm run web` : '';
      console.error(`웹 결과 뷰어 시작 실패 (${error.code ?? 'ERROR'}): ${error.message}.${hint}`);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`웹 결과 뷰어: http://127.0.0.1:${port}`);
      console.log('합성 데이터 읽기 전용 · 검사 재실행/하네스 실행/승인/외부 전송 없음');
      console.log('src를 고친 뒤 화면의 ↻ 새로고침을 누르면 지금 코드로 다시 계산합니다. 종료: Ctrl+C');
    });
  }
}
