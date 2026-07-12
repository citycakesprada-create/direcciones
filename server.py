import http.server
import socket
import sys

def get_ip_address():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

port = 8000
ip = get_ip_address()

print("=" * 60)
print("      SERVIDOR DE DESARROLLO BOGOZONAS")
print("=" * 60)
print(f" Servidor iniciado en el puerto: {port}")
print(f" Local:   http://localhost:{port}")
print(f" Red:     http://{ip}:{port}")
print("-" * 60)
print(" NOTA PARA CELULARES:")
print(" Para que la cámara funcione en tu celular desde el navegador,")
print(" se requiere una conexión segura (HTTPS) o habilitar banderas de desarrollo.")
print(" En Google Chrome (Android):")
print("   1. Abre chrome://flags/#unsafely-treat-insecure-origin-as-secure")
print(f"   2. Agrega 'http://{ip}:{port}' a la lista de orígenes permitidos.")
print("   3. Cambia la opción a 'Enabled' y reinicia Chrome.")
print(" En iOS Safari:")
print("   Se recomienda usar localhost (vía cable) o levantar un túnel HTTPS (ej. ngrok).")
print("=" * 60)

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Cache control for development and service worker testing
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        # CORS Headers
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

server_address = ('0.0.0.0', port)
httpd = http.server.HTTPServer(server_address, CustomHTTPRequestHandler)

try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServidor de desarrollo detenido de forma segura.")
    sys.exit(0)
