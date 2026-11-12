"""시험판 정적 서버(포트 8765) + 녹화 프레임 받기: POST /frame?n=N → out/frames/NNNNN.png, POST /done → out/frames/done.
실행: python prototypes/flood/tools/serve.py [포트]
"""
import http.server
import os
import sys
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'application/javascript', '.mjs': 'application/javascript', '.html': 'text/html; charset=utf-8'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass

    def do_POST(self):
        url = urlparse(self.path)
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        frames = os.path.join(ROOT, 'out', 'frames')
        os.makedirs(frames, exist_ok=True)
        if url.path == '/frame':
            n = int(parse_qs(url.query)['n'][0])
            with open(os.path.join(frames, f'{n:05d}.png'), 'wb') as f:
                f.write(body)
        elif url.path == '/done':
            open(os.path.join(frames, 'done'), 'w').close()
        else:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'serving {ROOT} on http://localhost:{port}/', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
