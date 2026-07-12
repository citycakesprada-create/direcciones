# BogoZonas - Clasificador y Planificador de Rutas de Bogotá

Aplicación web progresiva (PWA) móvil, rápida y autónoma (funciona 100% offline tras la primera carga) diseñada para mensajería empresarial. Permite escanear o digitar direcciones, clasificarlas instantáneamente en zonas específicas de Bogotá, planificar rutas óptimas de reparto ordenadas geográficamente y navegar directo a través de **Waze** o **Google Maps**.

---

## 📌 Reglas de Negocio de las Zonas (Bogotá Norte)

La clasificación se basa en rangos matemáticos específicos de la cuadrícula de Bogotá (Calles y Carreras):

| Zona | Límite de Calle (Norte-Sur) | Límite de Carrera (Oriente-Occidente) | Color de Acento |
| :--- | :--- | :--- | :---: |
| **Usaquén** | Calle 105 hasta Calle 193 | Carrera 2 hasta Carrera 45 (Autopista Norte) | Turquesa / Cian |
| **Chapinero** | Calle 30 hasta Calle 100 | Carrera 2 hasta Carrera 30 (Avenida NQS) | Morado / Violeta |
| **Suba 1** | Calle 100 hasta Calle 189 | Carrera 45 (Autopista Norte) hasta Carrera 72 (Av. Boyacá) | Naranja / Amarillo |
| **Suba 2** | Calle 90 hasta Calle 189 | Carrera 72 (Av. Boyacá) hasta Carrera 159 | Rosa / Magenta |
| **Fuera de Zona** | Cualquiera fuera de los rangos anteriores (incluye Engativá, etc.) | - | Rojo |

---

## 🚗 Lógica del Planificador de Ruta y Navegación

* **Punto de Inicio (Base)**: La ruta se optimiza partiendo de la sede de la empresa ubicada en la **Calle 162 # 20 - 31**.
* **Algoritmo de Optimización**: Utiliza el método del *Vecino Más Cercano (TSP)* para ordenar las paradas secuencialmente, minimizando la distancia euclidiana basada en la cuadrícula de la ciudad.
* **Integración con Navegadores**:
  * **Waze**: Genera enlaces móviles nativos (`https://waze.com/ul?ll={lat},{lng}&navigate=yes`) que disparan directamente la navegación giro a giro en la App del celular.
  * **Google Maps**: Funciona como fallback si no se detecta Waze.
* **Privacidad e Independencia**: La aplicación se ejecuta por completo en el lado del cliente (teléfono). Los datos de ruta y del historial se almacenan en el `localStorage` de cada navegador de forma privada. El uso de la app por un mensajero (ej. Pablo) no interfiere ni comparte datos con el celular de otro (ej. María).

---

## 📐 Modelo de Georreferenciación (Offline)

Para ubicar direcciones sin internet, se implementó un modelo lineal de interpolación basado en la regularidad geométrica de las avenidas y calles de Bogotá:
* $\text{Latitud} = 4.590 + (\text{Calle} \times 0.00095)$
* $\text{Longitud} = -74.037 - (\text{Carrera} \times 0.00071) + ((\text{Calle} - 100) \times 0.00021)$

---

## 🛠️ Estructura del Proyecto

* **[index.html](file:///c:/direcciones/index.html)**: Interfaz de usuario (pestañas de escáner y planificador de ruta, video y lona de mapa).
* **[styles.css](file:///c:/direcciones/styles.css)**: Estilos en modo oscuro premium con glassmorphism y elementos interactivos responsivos.
* **[app.js](file:///c:/direcciones/app.js)**: Lógica principal de captura, OCR (Tesseract.js), parsing por expresiones regulares, cálculo de zonas, optimización de rutas y exportación a WhatsApp.
* **[manifest.json](file:///c:/direcciones/manifest.json)**: Manifiesto PWA para permitir instalar la aplicación en el menú principal del móvil.
* **[sw.js](file:///c:/direcciones/sw.js)**: Service Worker para almacenar recursos en caché local y asegurar soporte offline.
* **[server.py](file:///c:/direcciones/server.py)**: Servidor HTTP/HTTPS ligero en Python para desarrollo y pruebas en red de área local (WiFi).

---

## 🚀 Despliegue Público (GitHub Pages)

El proyecto está configurado para ejecutarse en la nube de GitHub de forma gratuita en:
👉 **[citycakesprada-create.github.io/direcciones](https://citycakesprada-create.github.io/direcciones/)**
