"""שרת פיתוח מקומי עם תמיכה ב-Range requests.

    python serve.py        ואז http://localhost:8080

למה לא `python -m http.server`: השרת המובנה של פייתון לא תומך ב-Range,
ודפדפנים מסרבים לנגן וידאו בלעדיו — הסרטון פשוט נתקע על מסך שחור.
אירוח אמיתי (Netlify / Vercel / GitHub Pages) תומך בזה מעצמו,
אז הקובץ הזה נחוץ רק לבדיקות מקומיות.
"""

import http.server
import os
import re
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = os.path.dirname(os.path.abspath(__file__))


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        header = self.headers.get('Range')
        if not header:
            return super().send_head()

        match = re.match(r'bytes=(\d*)-(\d*)$', header.strip())
        path = self.translate_path(self.path)
        if not match or not os.path.isfile(path):
            return super().send_head()

        size = os.path.getsize(path)
        start_raw, end_raw = match.group(1), match.group(2)

        if start_raw == '':
            # bytes=-500  ->  500 הבתים האחרונים
            length = min(int(end_raw or 0), size)
            start, end = size - length, size - 1
        else:
            start = int(start_raw)
            end = int(end_raw) if end_raw else size - 1

        if start >= size or start > end:
            self.send_response(416)
            self.send_header('Content-Range', 'bytes */%d' % size)
            self.end_headers()
            return None

        end = min(end, size - 1)
        handle = open(path, 'rb')
        handle.seek(start)

        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()

        # SimpleHTTPRequestHandler מעתיק עד EOF, אז חותכים לטווח המבוקש
        return _Bounded(handle, end - start + 1)


class _Bounded:
    """עוטף קובץ ומגביל את הקריאה למספר בתים נתון."""

    def __init__(self, handle, remaining):
        self.handle = handle
        self.remaining = remaining

    def read(self, amount=-1):
        if self.remaining <= 0:
            return b''
        if amount is None or amount < 0:
            amount = self.remaining
        chunk = self.handle.read(min(amount, self.remaining))
        self.remaining -= len(chunk)
        return chunk

    def close(self):
        self.handle.close()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with Server(('', PORT), RangeHandler) as httpd:
        print('serving %s on http://localhost:%d' % (ROOT, PORT))
        httpd.serve_forever()
