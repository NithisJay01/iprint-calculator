import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'iprint-plus-cost-calculator');
const port = Number(process.env.IPRINT_DEV_PORT || 4173);
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp']
]);

http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' || /^\/staff\/?$/i.test(pathname)
      ? 'index.html'
      : pathname.replace(/^\/+/, '');
    const filename = path.resolve(publicRoot, relative);

    if (filename !== publicRoot && !filename.startsWith(publicRoot + path.sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(filename);
    const target = info.isDirectory() ? path.join(filename, 'index.html') : filename;
    const body = await readFile(target);
    response.writeHead(200, {
      'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`iPrint preview: http://127.0.0.1:${port}/`);
  console.log(`iPrint staff preview: http://127.0.0.1:${port}/staff/`);
});
