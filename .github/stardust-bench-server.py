from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Lock
from time import monotonic,sleep
import os
# Shared 10 Mbit/s downstream for binary assets. Throttling the HTTP server covers dedicated workers too.
lock=Lock()
next_chunk=0
class Server(SimpleHTTPRequestHandler):
    def copyfile(self,src,dest):
        global next_chunk
        if not self.path.endswith(('.task','.wasm','.bin')):
            return super().copyfile(src,dest)
        size=os.fstat(src.fileno()).st_size
        print('BINARY',self.path,size,flush=True)
        while chunk:=src.read(32768):
            with lock:
                next_chunk=max(next_chunk,monotonic())+len(chunk)/1250000
                send_at=next_chunk
            sleep(max(0,send_at-monotonic()))
            try:dest.write(chunk)
            except (ConnectionResetError,BrokenPipeError):break
ThreadingHTTPServer(('127.0.0.1',8101),Server).serve_forever()
