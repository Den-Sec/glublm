#!/usr/bin/env python3
"""
Minimal no-cache dev server for the desk pet.
Serves the desk-pet/ directory with Cache-Control: no-store so browsers
reload modules on every request. Only for local development.
"""
import http.server
import socketserver
import os
import sys

PORT = int(os.environ.get('PORT', '8000'))
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

os.chdir(ROOT)
with socketserver.TCPServer(('127.0.0.1', PORT), NoCacheHandler) as httpd:
    print(f'Serving desk-pet/ at http://127.0.0.1:{PORT} (no-cache headers)')
    httpd.serve_forever()
