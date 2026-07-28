#!/usr/bin/env python3
"""Static server for local development.

`python3 -m http.server` sends no Cache-Control header, so browsers cache
js/*.js and css/style.css indefinitely and happily serve a stale build long
after the files on disk have changed — including after "clear browsing
data", since a conditional request is never made in the first place. Adding
a cache-buster to index.html's URL doesn't help: each subresource is cached
under its own unchanged URL.

This is the same server with no-store on every response.

    python3 serve.py [port]        # default 8123
"""

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    server = ThreadingHTTPServer(('', port), NoCacheHandler)
    print(f'MOST LIKELY — serving on http://localhost:{port} (no-store)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nstopped')


if __name__ == '__main__':
    main()
