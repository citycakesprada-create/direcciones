/* ==========================================================================
   BogoZonas - Core Logic & Address Processing
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // --- UI Elements ---
  const webcamElement = document.getElementById('webcam');
  const captureCanvas = document.getElementById('capture-canvas');
  const imagePreviewContainer = document.getElementById('image-preview-container');
  const imagePreview = document.getElementById('image-preview');
  
  // Buttons
  const btnStartCamera = document.getElementById('btn-start-camera');
  const btnSwitchCamera = document.getElementById('btn-switch-camera');
  const btnStopCamera = document.getElementById('btn-stop-camera');
  const btnCapture = document.getElementById('btn-capture');
  const btnClearImage = document.getElementById('btn-clear-image');
  const galleryInput = document.getElementById('gallery-input');
  const btnAddToRoute = document.getElementById('btn-add-to-route');
  
  // Tabs Navigation
  const tabScannerBtn = document.getElementById('tab-scanner-btn');
  const tabRouteBtn = document.getElementById('tab-route-btn');
  const scannerTabContent = document.getElementById('scanner-tab-content');
  const routeTabContent = document.getElementById('route-tab-content');
  
  // Maps & Visualizers
  const btnMapOnline = document.getElementById('btn-map-online');
  const btnMapOffline = document.getElementById('btn-map-offline');
  const mapElement = document.getElementById('map');
  const svgMapContainer = document.getElementById('svg-map-container');
  
  // Loader & Results
  const ocrLoader = document.getElementById('ocr-loader');
  const ocrStatusText = document.getElementById('ocr-status-text');
  const ocrProgressBar = document.getElementById('ocr-progress-bar');
  
  const resultZoneBadge = document.getElementById('result-zone-badge');
  const resultZoneName = document.getElementById('result-zone-name');
  const zoneIcon = document.getElementById('zone-icon');
  
  const detailCalle = document.getElementById('detail-calle');
  const detailCarrera = document.getElementById('detail-carrera');
  const detailRawText = document.getElementById('detail-raw-text');
  
  // Form Editor
  const addressForm = document.getElementById('address-form');
  const inputType = document.getElementById('input-type');
  const inputMainNumber = document.getElementById('input-main-number');
  const inputCrossingNumber = document.getElementById('input-crossing-number');
  const inputPlate = document.getElementById('input-plate');
  
  // Route Elements
  const bulkAddressesInput = document.getElementById('bulk-addresses-input');
  const btnAddBulk = document.getElementById('btn-add-bulk');
  const routeList = document.getElementById('route-list');
  const routeEmptyMessage = document.getElementById('route-empty-message');
  const routeProgressLabel = document.getElementById('route-progress-label');
  const routeProgressBar = document.getElementById('route-progress-bar');
  const btnOptimizeRoute = document.getElementById('btn-optimize-route');
  const btnShareWhatsapp = document.getElementById('btn-share-whatsapp');
  const btnClearRoute = document.getElementById('btn-clear-route');

  // History & Network
  const historyList = document.getElementById('history-list');
  const historyEmptyMessage = document.getElementById('history-empty-message');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const networkStatus = document.getElementById('network-status');

  // --- App State ---
  let webcamStream = null;
  let useRearCamera = true;
  let isMapOnline = true;
  let activeTab = 'scanner'; // 'scanner' or 'route'
  
  // Leaflet Map Handles
  let leafletMap = null;
  let leafletMarker = null; // Scanner marker
  let leafletPolygons = {};
  let leafletRouteMarkers = [];
  let leafletRoutePolyline = null;
  
  // Scanner state
  let currentScanResult = null;
  let tesseractWorker = null;

  // Route Planning State
  let deliveryRoute = [];
  
  // Base Station Coordinates (Calle 162 # 20 - 31)
  const BASE_CALLE = 162;
  const BASE_CARRERA = 20;
  const BASE_COORDS = approximateGridToCoordinates(BASE_CALLE, BASE_CARRERA);

  // Initialize Lucide Icons
  lucide.createIcons();

  // Load Route state from storage
  try {
    deliveryRoute = JSON.parse(localStorage.getItem('bogozonas_delivery_route')) || [];
  } catch (e) {
    deliveryRoute = [];
  }

  // --- 1. Service Worker & PWA ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('Service Worker registrado con éxito.'))
      .catch(err => console.error('Error al registrar Service Worker:', err));
  }

  // --- 2. Tabs Switcher ---
  function switchTab(tabId) {
    activeTab = tabId;
    if (tabId === 'scanner') {
      tabScannerBtn.classList.add('active');
      tabRouteBtn.classList.remove('active');
      scannerTabContent.classList.remove('hidden');
      routeTabContent.classList.add('hidden');
      // Redraw map for single scanner address
      triggerMapRedraw();
    } else {
      tabScannerBtn.classList.remove('active');
      tabRouteBtn.classList.add('active');
      scannerTabContent.classList.add('hidden');
      routeTabContent.classList.remove('hidden');
      // Redraw map for route planning
      triggerMapRedraw();
    }
    stopWebcam();
  }

  tabScannerBtn.addEventListener('click', () => switchTab('scanner'));
  tabRouteBtn.addEventListener('click', () => switchTab('route'));

  // --- 3. Network Status Monitoring ---
  function updateNetworkStatus() {
    if (navigator.onLine) {
      networkStatus.classList.remove('offline');
      networkStatus.innerHTML = '<i data-lucide="wifi"></i><span>Online</span>';
      toggleMapMode(true);
    } else {
      networkStatus.classList.add('offline');
      networkStatus.innerHTML = '<i data-lucide="wifi-off"></i><span>Offline</span>';
      toggleMapMode(false);
    }
    lucide.createIcons();
  }
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus(); // Initial status check

  // --- 4. Camera Operations ---
  async function startWebcam() {
    stopWebcam();
    imagePreviewContainer.classList.add('hidden');
    webcamElement.classList.remove('hidden');

    const constraints = {
      video: {
        facingMode: useRearCamera ? { exact: "environment" } : "user",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    try {
      webcamStream = await navigator.mediaDevices.getUserMedia(constraints);
      webcamElement.srcObject = webcamStream;
      
      btnStartCamera.classList.add('hidden');
      btnSwitchCamera.classList.remove('hidden');
      btnStopCamera.classList.remove('hidden');
      btnCapture.classList.remove('hidden');
    } catch (err) {
      console.warn("No se pudo iniciar cámara trasera específica, reintentando con cámara general:", err);
      try {
        const fallbackConstraints = { video: { facingMode: "user" }, audio: false };
        webcamStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        webcamElement.srcObject = webcamStream;
        
        btnStartCamera.classList.add('hidden');
        btnSwitchCamera.classList.remove('hidden');
        btnStopCamera.classList.remove('hidden');
        btnCapture.classList.remove('hidden');
      } catch (fallbackErr) {
        console.error("Error al acceder a la cámara:", fallbackErr);
        alert("No se pudo acceder a la cámara. Por favor usa la opción de Galería o ingresa la dirección manualmente.");
      }
    }
  }

  function stopWebcam() {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      webcamStream = null;
    }
    webcamElement.srcObject = null;
    btnStartCamera.classList.remove('hidden');
    btnSwitchCamera.classList.add('hidden');
    btnStopCamera.classList.add('hidden');
    btnCapture.classList.add('hidden');
  }

  function toggleCamera() {
    useRearCamera = !useRearCamera;
    startWebcam();
  }

  function captureFrame() {
    if (!webcamStream) return;
    
    captureCanvas.width = webcamElement.videoWidth;
    captureCanvas.height = webcamElement.videoHeight;
    
    const ctx = captureCanvas.getContext('2d');
    ctx.drawImage(webcamElement, 0, 0, captureCanvas.width, captureCanvas.height);
    
    const dataURL = captureCanvas.toDataURL('image/jpeg');
    imagePreview.src = dataURL;
    imagePreviewContainer.classList.remove('hidden');
    
    stopWebcam();
    processImageOCR(dataURL);
  }

  // Bind Camera Events
  btnStartCamera.addEventListener('click', startWebcam);
  btnSwitchCamera.addEventListener('click', toggleCamera);
  btnStopCamera.addEventListener('click', stopWebcam);
  btnCapture.addEventListener('click', captureFrame);
  btnClearImage.addEventListener('click', () => {
    imagePreviewContainer.classList.add('hidden');
    imagePreview.src = '';
  });

  // --- 5. Gallery Uploads ---
  galleryInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    stopWebcam();
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataURL = event.target.result;
      imagePreview.src = dataURL;
      imagePreviewContainer.classList.remove('hidden');
      processImageOCR(dataURL);
    };
    reader.readAsDataURL(file);
    galleryInput.value = '';
  });

  // --- 6. OCR Engine (Tesseract.js) ---
  async function processImageOCR(imageSource) {
    ocrLoader.classList.remove('hidden');
    ocrStatusText.textContent = "Cargando motor de reconocimiento OCR...";
    ocrProgressBar.style.width = '10%';

    try {
      if (!tesseractWorker) {
        tesseractWorker = await Tesseract.createWorker('spa', 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              ocrStatusText.textContent = `Analizando imagen: ${Math.round(m.progress * 100)}%`;
              ocrProgressBar.style.width = `${10 + m.progress * 90}%`;
            } else {
              ocrStatusText.textContent = "Preparando escáner...";
            }
          }
        });
      }

      const result = await tesseractWorker.recognize(imageSource);
      const rawText = result.data.text;
      console.log("OCR Raw Output:", rawText);
      
      ocrStatusText.textContent = "Completado!";
      ocrProgressBar.style.width = '100%';
      
      setTimeout(() => {
        ocrLoader.classList.add('hidden');
        parseAndClassifyAddress(rawText);
      }, 500);

    } catch (err) {
      console.error("Error en procesamiento OCR:", err);
      ocrLoader.classList.add('hidden');
      alert("Hubo un problema al leer la imagen. Por favor ingresa la dirección de forma manual.");
    }
  }

  // --- 7. Address Parser ---
  function parseSingleAddressString(text) {
    if (!text || text.trim() === '') return null;

    let cleanText = text.toLowerCase()
      .replace(/[áäàâ]/g, 'a')
      .replace(/[éëèê]/g, 'e')
      .replace(/[íïìî]/g, 'i')
      .replace(/[óöòô]/g, 'o')
      .replace(/[úüùû]/g, 'u')
      .replace(/ñ/g, 'n')
      .replace(/\./g, ' ');

    cleanText = cleanText
      .replace(/\bcll?\b|\bcalle\b|\bcld\b/g, 'calle')
      .replace(/\bcra?\b|\bkr\b|\bkra\b|\bcarrera\b/g, 'carrera')
      .replace(/\bdg\b|\bdiag\b|\bdiagonal\b/g, 'diagonal')
      .replace(/\btv\b|\btrans\b|\btransversal\b/g, 'transversal')
      .replace(/\bav\b|\bavenida\b/g, 'avenida')
      .replace(/\bn[o°º]\b|\bnum\b|\bnumero\b/g, '#');

    const standardRegex = /(calle|carrera|diagonal|transversal|avenida)\s*(\d+)\s*([a-z]?)(?:\s*bis)?(?:\s*(?:norte|sur|este))?\s*(?:#|no|\s)\s*(\d+)\s*([a-z]?)(?:\s*bis)?\s*(?:-|\s)?\s*(\d+)/i;
    const match = cleanText.match(standardRegex);

    if (match) {
      return {
        type: match[1].toLowerCase(),
        mainNum: parseInt(match[2]),
        mainSuffix: match[3] || '',
        crossingNum: parseInt(match[4]),
        crossingSuffix: match[5] || '',
        plate: match[6] || '',
        raw: text.trim()
      };
    }

    // Fallback
    const calleMatch = cleanText.match(/\b(calle|diagonal)\s*(\d+)\s*([a-z]?)/i);
    const carreraMatch = cleanText.match(/\b(carrera|transversal)\s*(\d+)\s*([a-z]?)/i);
    const plateMatch = cleanText.match(/#\s*(\d+)/i) || cleanText.match(/-\s*(\d+)/i);

    if (calleMatch && carreraMatch) {
      const isCalleFirst = cleanText.indexOf(calleMatch[0]) < cleanText.indexOf(carreraMatch[0]);
      return {
        type: isCalleFirst ? calleMatch[1].toLowerCase() : carreraMatch[1].toLowerCase(),
        mainNum: isCalleFirst ? parseInt(calleMatch[2]) : parseInt(carreraMatch[2]),
        mainSuffix: isCalleFirst ? calleMatch[3] || '' : carreraMatch[3] || '',
        crossingNum: isCalleFirst ? parseInt(carreraMatch[2]) : parseInt(calleMatch[2]),
        crossingSuffix: isCalleFirst ? carreraMatch[3] || '' : calleMatch[3] || '',
        plate: plateMatch ? plateMatch[1] : '',
        raw: text.trim()
      };
    }

    return null;
  }

  function parseAndClassifyAddress(text) {
    const addressInfo = parseSingleAddressString(text);

    if (addressInfo) {
      applyAddressResult(addressInfo);
    } else {
      detailCalle.textContent = '-';
      detailCarrera.textContent = '-';
      detailRawText.textContent = text.length > 30 ? text.substring(0, 30) + '...' : text;
      
      updateZoneDisplay('unclassified');
      alert("No pudimos identificar la dirección automáticamente. Por favor digítala en el formulario.");
      
      // Auto-fill coordinates inputs as much as we can extract
      const cleanText = text.toLowerCase().replace(/\D/g, ' ');
      const numbers = cleanText.split(/\s+/).map(n => parseInt(n)).filter(n => !isNaN(n));
      if (numbers.length > 0) inputMainNumber.value = numbers[0];
      if (numbers.length > 1) inputCrossingNumber.value = numbers[1];
      if (numbers.length > 2) inputPlate.value = numbers[2];
      
      document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
    }
  }

  // --- 8. Apply Scanner Parser Output ---
  function applyAddressResult(info) {
    currentScanResult = info;

    inputType.value = info.type;
    inputMainNumber.value = info.mainNum + info.mainSuffix;
    inputCrossingNumber.value = info.crossingNum + info.crossingSuffix;
    inputPlate.value = info.plate;

    const parsedData = getNormalizedCalleCarrera(info);
    detailCalle.textContent = `${info.type.toUpperCase()} ${parsedData.calle}${parsedData.calleSuffix}`;
    detailCarrera.textContent = `Carrera ${parsedData.carrera}${parsedData.carreraSuffix}`;
    detailRawText.textContent = info.raw || 'Digitado manual';

    const zone = classifyBogotaZone(parsedData.calle, parsedData.carrera);
    updateZoneDisplay(zone);

    triggerMapRedraw();
    saveScanToHistory(info, parsedData.calle, parsedData.carrera, zone);

    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
  }

  function getNormalizedCalleCarrera(info) {
    let calle = 0;
    let carrera = 0;
    let calleSuffix = '';
    let carreraSuffix = '';

    if (info.type === 'calle' || info.type === 'diagonal') {
      calle = info.mainNum;
      calleSuffix = info.mainSuffix;
      carrera = info.crossingNum;
      carreraSuffix = info.crossingSuffix;
    } else {
      calle = info.crossingNum;
      calleSuffix = info.crossingSuffix;
      carrera = info.mainNum;
      carreraSuffix = info.mainSuffix;
    }
    return { calle, carrera, calleSuffix, carreraSuffix };
  }

  // --- 9. Zone Classifier Logic ---
  function classifyBogotaZone(calle, carrera) {
    // Usaquén: Calle 105 to 193, Carrera 2 to 45 (Autopista Norte)
    if (calle >= 105 && calle <= 193 && carrera >= 2 && carrera <= 45) {
      return 'usaquén';
    }
    // Chapinero: Calle 30 to 100, Carrera 2 to 30 (NQS)
    if (calle >= 30 && calle <= 100 && carrera >= 2 && carrera <= 30) {
      return 'chapinero';
    }
    // Suba 1: Calle 100 to 189, Carrera 45 (Autopista) to 72 (Boyacá)
    if (calle >= 100 && calle <= 189 && carrera >= 45 && carrera <= 72) {
      return 'suba 1';
    }
    // Suba 2: Calle 90 to 189, Carrera 72 (Boyacá) to 159
    if (calle >= 90 && calle <= 189 && carrera >= 72 && carrera <= 159) {
      return 'suba 2';
    }
    return 'fuera de zona';
  }

  function updateZoneDisplay(zone) {
    resultZoneBadge.className = 'zone-badge';
    let label = 'Sin Clasificar';
    let iconName = 'help-circle';
    
    switch (zone.toLowerCase()) {
      case 'usaquén':
        resultZoneBadge.classList.add('zone-usaquen');
        label = 'Usaquén';
        iconName = 'compass';
        break;
      case 'chapinero':
        resultZoneBadge.classList.add('zone-chapinero');
        label = 'Chapinero';
        iconName = 'landmark';
        break;
      case 'suba 1':
        resultZoneBadge.classList.add('zone-suba1');
        label = 'Suba 1';
        iconName = 'trees';
        break;
      case 'suba 2':
        resultZoneBadge.classList.add('zone-suba2');
        label = 'Suba 2';
        iconName = 'wind';
        break;
      case 'fuera de zona':
        resultZoneBadge.classList.add('zone-fuera');
        label = 'Fuera de Zona';
        iconName = 'slash';
        break;
      default:
        resultZoneBadge.classList.add('zone-unclassified');
        label = 'Sin Escanear';
        iconName = 'help-circle';
        break;
    }
    
    resultZoneName.textContent = label;
    zoneIcon.setAttribute('data-lucide', iconName);
    lucide.createIcons();
  }

  // --- 10. Coordinate Translation ---
  function approximateGridToCoordinates(calle, carrera) {
    const lat = 4.590 + (calle * 0.00095);
    const lng = -74.037 - (carrera * 0.00071) + ((calle - 100) * 0.00021);
    return { lat, lng };
  }

  // --- 11. Map Rendering Orchestrator ---
  function toggleMapMode(online) {
    isMapOnline = online;
    if (online) {
      btnMapOnline.classList.add('active');
      btnMapOffline.classList.remove('active');
      mapElement.classList.remove('hidden');
      svgMapContainer.classList.add('hidden');
      initLeafletMap();
      triggerMapRedraw();
    } else {
      btnMapOnline.classList.remove('active');
      btnMapOffline.classList.add('active');
      mapElement.classList.add('hidden');
      svgMapContainer.classList.remove('hidden');
      triggerMapRedraw();
    }
  }

  btnMapOnline.addEventListener('click', () => toggleMapMode(true));
  btnMapOffline.addEventListener('click', () => toggleMapMode(false));

  function initLeafletMap() {
    if (leafletMap) {
      leafletMap.invalidateSize();
      return;
    }

    leafletMap = L.map('map', {
      zoomControl: true,
      attributionControl: false
    }).setView([4.704, -74.058], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20
    }).addTo(leafletMap);

    drawLeafletZonePolygons();
  }

  function drawLeafletZonePolygons() {
    const zonesDef = [
      { name: 'Usaquén', color: varColor('--color-usaquen'), corners: [[105, 2], [193, 2], [193, 45], [105, 45]] },
      { name: 'Chapinero', color: varColor('--color-chapinero'), corners: [[30, 2], [100, 2], [100, 30], [30, 30]] },
      { name: 'Suba 1', color: varColor('--color-suba1'), corners: [[100, 45], [189, 45], [189, 72], [100, 72]] },
      { name: 'Suba 2', color: varColor('--color-suba2'), corners: [[90, 72], [189, 72], [189, 159], [90, 159]] }
    ];

    zonesDef.forEach(zone => {
      const latlngs = zone.corners.map(corner => {
        const coords = approximateGridToCoordinates(corner[0], corner[1]);
        return [coords.lat, coords.lng];
      });

      leafletPolygons[zone.name] = L.polygon(latlngs, {
        color: zone.color,
        fillColor: zone.color,
        fillOpacity: 0.1,
        weight: 1.5,
        dashArray: '3, 4'
      }).addTo(leafletMap).bindPopup(`<b>Zona: ${zone.name}</b>`);
    });
  }

  function varColor(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  function triggerMapRedraw() {
    if (activeTab === 'scanner') {
      redrawScannerMap();
    } else {
      redrawRouteMap();
    }
  }

  // Draw details for the single address scanner view
  function redrawScannerMap() {
    // Hide route helpers
    clearRouteMapGraphics();

    if (!currentScanResult) {
      if (leafletMarker) leafletMarker.remove();
      document.getElementById('svg-marker').classList.add('hidden');
      return;
    }

    const parsedData = getNormalizedCalleCarrera(currentScanResult);
    const coords = approximateGridToCoordinates(parsedData.calle, parsedData.carrera);
    const zone = classifyBogotaZone(parsedData.calle, parsedData.carrera);

    // Update Leaflet Marker
    if (isMapOnline && leafletMap) {
      if (leafletMarker) {
        leafletMarker.setLatLng([coords.lat, coords.lng]);
      } else {
        const customIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `<div style="background-color: var(--danger); width: 14px; height: 14px; border: 2.5px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });
        leafletMarker = L.marker([coords.lat, coords.lng], { icon: customIcon }).addTo(leafletMap);
      }

      leafletMarker.bindPopup(`
        <div style="font-family: Outfit, sans-serif; font-size: 0.85rem; line-height: 1.4;">
          <strong style="color: white; font-size: 0.95rem;">Dirección Escaneada</strong><br/>
          Calle: ${parsedData.calle}<br/>
          Carrera: ${parsedData.carrera}<br/>
          <strong style="color: ${getZoneHexColor(zone)}; text-transform: uppercase;">Zona: ${zone}</strong>
        </div>
      `).openPopup();
      leafletMap.setView([coords.lat, coords.lng], 14);
    }

    // Update SVG Map Pin
    updateSvgPinPosition(parsedData.calle, parsedData.carrera, zone);
  }

  // Draw details for the active planning route
  function redrawRouteMap() {
    clearScannerMapGraphics();
    clearRouteMapGraphics();

    // 1. Online Leaflet Route Mapping
    if (isMapOnline && leafletMap) {
      // Draw Base station
      const baseIcon = L.divIcon({
        className: 'custom-base-pin',
        html: `<div style="background-color: #6366f1; width: 16px; height: 16px; border: 2.5px solid white; border-radius: 4px; box-shadow: 0 0 10px rgba(99,102,241,0.6);"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      const baseMarker = L.marker([BASE_COORDS.lat, BASE_COORDS.lng], { icon: baseIcon })
        .addTo(leafletMap)
        .bindPopup("<b>Base: Calle 162 # 20 - 31</b>");
      leafletRouteMarkers.push(baseMarker);

      // Find first uncompleted to open popup
      let openedPopup = false;
      const polylinePoints = [[BASE_COORDS.lat, BASE_COORDS.lng]];

      deliveryRoute.forEach((item, index) => {
        const itemIcon = L.divIcon({
          className: 'custom-route-pin',
          html: `<div style="background-color: ${item.completed ? '#64748b' : getZoneHexColor(item.zone)}; width: 14px; height: 14px; border: 2.5px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 8px; font-weight: 800; box-shadow: 0 0 10px rgba(0,0,0,0.5);">${index + 1}</div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });

        const m = L.marker([item.lat, item.lng], { icon: itemIcon }).addTo(leafletMap);
        m.bindPopup(`
          <div style="font-family: Outfit, sans-serif; font-size: 0.85rem;">
            <b>Parada #${index + 1}: ${item.address}</b><br/>
            Zona: <strong style="color:${getZoneHexColor(item.zone)}; text-transform:uppercase;">${item.zone}</strong><br/>
            Estado: <b>${item.completed ? 'Entregado' : 'Pendiente'}</b>
          </div>
        `);
        
        leafletRouteMarkers.push(m);
        polylinePoints.push([item.lat, item.lng]);

        // Auto open popup for the next delivery
        if (!item.completed && !openedPopup) {
          m.openPopup();
          openedPopup = true;
        }
      });

      // Draw polyline connecting route path
      if (polylinePoints.length > 1) {
        leafletRoutePolyline = L.polyline(polylinePoints, {
          color: '#6366f1',
          weight: 3.5,
          opacity: 0.65,
          dashArray: '5, 6'
        }).addTo(leafletMap);

        // Zoom to fit bounds
        const group = new L.featureGroup(leafletRouteMarkers);
        leafletMap.fitBounds(group.getBounds().pad(0.1));
      } else {
        leafletMap.setView([BASE_COORDS.lat, BASE_COORDS.lng], 13);
      }
    }

    // 2. Offline SVG Route Mapping
    const routePath = document.getElementById('svg-route-path');
    
    // Clean dynamic SVG dots
    document.querySelectorAll('.svg-route-dot').forEach(el => el.remove());

    if (deliveryRoute.length === 0) {
      routePath.setAttribute('d', '');
      return;
    }

    const baseX = getSvgX(BASE_CARRERA);
    const baseY = getSvgY(BASE_CALLE);
    
    let pathD = `M ${baseX} ${baseY}`;

    deliveryRoute.forEach((item, index) => {
      // Calculate parsed grid
      const parsed = getNormalizedCalleCarrera(item.info);
      const cx = getSvgX(parsed.carrera);
      const cy = getSvgY(parsed.calle);

      pathD += ` L ${cx} ${cy}`;

      // Draw a circle for each delivery stop on the SVG
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', cx);
      dot.setAttribute('cy', cy);
      dot.setAttribute('r', '8');
      dot.setAttribute('class', 'svg-route-dot');
      dot.setAttribute('fill', item.completed ? '#64748b' : getZoneHexColor(item.zone));
      dot.setAttribute('stroke', '#ffffff');
      dot.setAttribute('stroke-width', '1.5');
      dot.style.cursor = 'pointer';

      // Tooltip-like title
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `Parada #${index + 1}: ${item.address} (${item.zone})`;
      dot.appendChild(title);

      document.getElementById('svg-map').appendChild(dot);
    });

    routePath.setAttribute('d', pathD);
  }

  function clearScannerMapGraphics() {
    if (leafletMarker) {
      leafletMarker.remove();
      leafletMarker = null;
    }
    document.getElementById('svg-marker').classList.add('hidden');
  }

  function clearRouteMapGraphics() {
    leafletRouteMarkers.forEach(m => m.remove());
    leafletRouteMarkers = [];
    if (leafletRoutePolyline) {
      leafletRoutePolyline.remove();
      leafletRoutePolyline = null;
    }
    document.querySelectorAll('.svg-route-dot').forEach(el => el.remove());
    document.getElementById('svg-route-path').setAttribute('d', '');
  }

  function getZoneHexColor(zone) {
    switch (zone.toLowerCase()) {
      case 'usaquén': return 'var(--color-usaquen)';
      case 'chapinero': return '#c77dff';
      case 'suba 1': return 'var(--color-suba1)';
      case 'suba 2': return '#ff4797';
      default: return '#ff5d73';
    }
  }

  function getSvgY(calle) {
    const minCalle = 30;
    const maxCalle = 200;
    const minSvgY = 900;
    const maxSvgY = 250;
    if (calle < minCalle) return 950;
    if (calle > maxCalle) return 200;
    return minSvgY - ((calle - minCalle) / (maxCalle - minCalle)) * (minSvgY - maxSvgY);
  }

  function getSvgX(carrera) {
    if (carrera < 2) return 760;
    if (carrera <= 72) {
      return 750 - (carrera - 2) * 5;
    } else if (carrera <= 159) {
      return 400 - (carrera - 72) * 3.448;
    } else {
      return 100 - (carrera - 159) * 2;
    }
  }

  function updateSvgPinPosition(calle, carrera, zone) {
    const svgMarker = document.getElementById('svg-marker');
    const svgY = getSvgY(calle);
    const svgX = getSvgX(carrera);

    svgMarker.setAttribute('transform', `translate(${svgX}, ${svgY})`);
    
    const pulseRing = svgMarker.querySelector('.svg-marker-pulse');
    if (pulseRing) {
      pulseRing.setAttribute('cx', '0');
      pulseRing.setAttribute('cy', '0');
    }
    svgMarker.classList.remove('hidden');

    // Highlight map polygon
    document.querySelectorAll('.svg-zone').forEach(el => {
      el.setAttribute('stroke-width', '2');
      el.style.opacity = '1';
    });

    let activePolyId = null;
    if (zone === 'usaquén') activePolyId = 'svg-zone-usaquen';
    else if (zone === 'chapinero') activePolyId = 'svg-zone-chapinero';
    else if (zone === 'suba 1') activePolyId = 'svg-zone-suba1';
    else if (zone === 'suba 2') activePolyId = 'svg-zone-suba2';

    if (activePolyId) {
      const activePoly = document.getElementById(activePolyId);
      if (activePoly) {
        activePoly.setAttribute('stroke-width', '4.5');
        activePoly.style.opacity = '0.9';
      }
    }
  }

  // --- 12. Scanner Form Handler ---
  addressForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const type = inputType.value;
    const mainNumStr = inputMainNumber.value.trim();
    const crossingNumStr = inputCrossingNumber.value.trim();
    const plate = inputPlate.value.trim();

    const mainNumParsed = parseInt(mainNumStr);
    const mainSuffix = mainNumStr.replace(mainNumParsed, '') || '';
    
    const crossingNumParsed = parseInt(crossingNumStr);
    const crossingSuffix = crossingNumStr.replace(crossingNumParsed, '') || '';

    if (isNaN(mainNumParsed) || isNaN(crossingNumParsed)) {
      alert("Por favor ingresa números válidos.");
      return;
    }

    const info = {
      type,
      mainNum: mainNumParsed,
      mainSuffix,
      crossingNum: crossingNumParsed,
      crossingSuffix,
      plate,
      raw: `${type.toUpperCase()} ${mainNumStr} # ${crossingNumStr} - ${plate}`
    };

    applyAddressResult(info);
  });

  // --- 13. Route Planner Operations ---
  
  // Add currently scanned address to the active route planner list
  btnAddToRoute.addEventListener('click', () => {
    if (!currentScanResult) {
      alert("Primero escanea o digita una dirección para poder agregarla a la ruta.");
      return;
    }
    
    addAddressToRouteList(currentScanResult);
    switchTab('route'); // switch view
    document.getElementById('route-list').scrollIntoView({ behavior: 'smooth' });
  });

  function addAddressToRouteList(info) {
    const parsedData = getNormalizedCalleCarrera(info);
    const zone = classifyBogotaZone(parsedData.calle, parsedData.carrera);
    const coords = approximateGridToCoordinates(parsedData.calle, parsedData.carrera);
    
    const addressStr = `${info.type} ${info.mainNum}${info.mainSuffix} # ${info.crossingNum}${info.crossingSuffix} - ${info.plate}`.toUpperCase();

    // Check duplicate
    const isDuplicate = deliveryRoute.some(item => item.address === addressStr);
    if (isDuplicate) {
      alert("Esta dirección ya se encuentra en tu ruta.");
      return;
    }

    const newItem = {
      id: 'route-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      address: addressStr,
      info: info,
      zone: zone,
      lat: coords.lat,
      lng: coords.lng,
      completed: false
    };

    deliveryRoute.push(newItem);
    saveRouteState();
    renderRouteList();
    triggerMapRedraw();
  }

  // Parse bulk text block input
  btnAddBulk.addEventListener('click', () => {
    const text = bulkAddressesInput.value.trim();
    if (text === '') {
      alert("Pega algunas direcciones en el cuadro de texto primero.");
      return;
    }

    const lines = text.split('\n');
    let addedCount = 0;

    lines.forEach(line => {
      const cleanLine = line.trim();
      if (cleanLine === '') return;

      const parsedInfo = parseSingleAddressString(cleanLine);
      if (parsedInfo) {
        // Add to array directly
        const parsedData = getNormalizedCalleCarrera(parsedInfo);
        const zone = classifyBogotaZone(parsedData.calle, parsedData.carrera);
        const coords = approximateGridToCoordinates(parsedData.calle, parsedData.carrera);
        const addressStr = `${parsedInfo.type} ${parsedInfo.mainNum}${parsedInfo.mainSuffix} # ${parsedInfo.crossingNum}${parsedInfo.crossingSuffix} - ${parsedInfo.plate}`.toUpperCase();

        const isDuplicate = deliveryRoute.some(item => item.address === addressStr);
        if (!isDuplicate) {
          deliveryRoute.push({
            id: 'route-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
            address: addressStr,
            info: parsedInfo,
            zone: zone,
            lat: coords.lat,
            lng: coords.lng,
            completed: false
          });
          addedCount++;
        }
      }
    });

    if (addedCount > 0) {
      bulkAddressesInput.value = ''; // clear textarea
      saveRouteState();
      renderRouteList();
      triggerMapRedraw();
      alert(`Se cargaron y clasificaron exitosamente ${addedCount} direcciones.`);
    } else {
      alert("No pudimos reconocer ninguna dirección nueva. Verifica el formato.");
    }
  });

  // Optimize route using Nearest-Neighbor TSP algorithm starting from Calle 162 # 20-31
  btnOptimizeRoute.addEventListener('click', () => {
    if (deliveryRoute.length <= 1) {
      alert("Necesitas al menos 2 direcciones cargadas para poder optimizar la ruta.");
      return;
    }

    // Separate completed and uncompleted
    const completedItems = deliveryRoute.filter(item => item.completed);
    let uncompletedItems = deliveryRoute.filter(item => !item.completed);

    if (uncompletedItems.length === 0) {
      alert("Todas las entregas ya están completadas.");
      return;
    }

    const optimizedUncompleted = [];
    let currentLat = BASE_COORDS.lat;
    let currentLng = BASE_COORDS.lng;

    // Greedy Nearest-Neighbor calculation
    while (uncompletedItems.length > 0) {
      let nearestIdx = -1;
      let minDistance = Infinity;

      for (let i = 0; i < uncompletedItems.length; i++) {
        const item = uncompletedItems[i];
        // Calculate Euclidean distance (sufficient for grid layout)
        const distance = Math.sqrt(Math.pow(item.lat - currentLat, 2) + Math.pow(item.lng - currentLng, 2));
        
        if (distance < minDistance) {
          minDistance = distance;
          nearestIdx = i;
        }
      }

      const nextTarget = uncompletedItems[nearestIdx];
      optimizedUncompleted.push(nextTarget);
      
      // Update starting reference for next loop
      currentLat = nextTarget.lat;
      currentLng = nextTarget.lng;

      // Remove from pool
      uncompletedItems.splice(nearestIdx, 1);
    }

    // Recombine: optimized pending deliveries first, then completed ones at the end
    deliveryRoute = [...optimizedUncompleted, ...completedItems];
    
    saveRouteState();
    renderRouteList();
    triggerMapRedraw();
    
    alert("¡Ruta optimizada geográficamente desde la Calle 162 # 20-31 con éxito!");
  });

  // Toggle single item status
  function toggleRouteItemCompleted(itemId) {
    const item = deliveryRoute.find(item => item.id === itemId);
    if (item) {
      item.completed = !item.completed;
      saveRouteState();
      renderRouteList();
      triggerMapRedraw();
    }
  }

  // Delete item from route list
  function deleteRouteItem(itemId) {
    deliveryRoute = deliveryRoute.filter(item => item.id !== itemId);
    saveRouteState();
    renderRouteList();
    triggerMapRedraw();
  }

  function saveRouteState() {
    localStorage.setItem('bogozonas_delivery_route', JSON.stringify(deliveryRoute));
  }

  function renderRouteList() {
    if (deliveryRoute.length === 0) {
      routeList.innerHTML = '';
      routeEmptyMessage.classList.remove('hidden');
      routeProgressLabel.textContent = '0 / 0 Entregas';
      routeProgressBar.style.width = '0%';
      return;
    }

    routeEmptyMessage.classList.add('hidden');
    routeList.innerHTML = '';

    const completedCount = deliveryRoute.filter(item => item.completed).length;
    const totalCount = deliveryRoute.length;
    
    routeProgressLabel.textContent = `${completedCount} / ${totalCount} Entregas`;
    routeProgressBar.style.width = `${(completedCount / totalCount) * 100}%`;

    // Detect first uncompleted item (this is the active next delivery target)
    let foundFirstPending = false;

    deliveryRoute.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'route-item';
      
      const isActiveTarget = !item.completed && !foundFirstPending;
      if (isActiveTarget) {
        li.classList.add('active-now');
        foundFirstPending = true;
      }
      if (item.completed) {
        li.classList.add('completed');
      }

      li.innerHTML = `
        <div class="route-item-left">
          <div class="route-number-badge">${index + 1}</div>
          <div class="route-address-details">
            <span class="route-address">${item.address}</span>
            <span class="route-zone-subtext ${item.zone.toLowerCase()}">${item.zone}</span>
          </div>
        </div>
        <div class="route-item-actions">
          <button class="btn-check-route" title="${item.completed ? 'Marcar pendiente' : 'Marcar completado'}">
            <i data-lucide="check"></i>
          </button>
          <button class="btn-waze-route" title="Guiar con Waze">
            <i data-lucide="navigation-2"></i>
          </button>
          <button class="btn-delete-route" title="Eliminar parada">
            <i data-lucide="trash"></i>
          </button>
        </div>
      `;

      // Event actions binding
      li.querySelector('.btn-check-route').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleRouteItemCompleted(item.id);
      });

      li.querySelector('.btn-waze-route').addEventListener('click', (e) => {
        e.stopPropagation();
        openNavigationApp(item.lat, item.lng, item.address);
      });

      li.querySelector('.btn-delete-route').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteRouteItem(item.id);
      });

      // Clicking on card highlights it on the map view
      li.addEventListener('click', () => {
        if (isMapOnline && leafletMap) {
          leafletMap.setView([item.lat, item.lng], 15);
          // Highlight that specific marker
          leafletRouteMarkers.forEach(m => {
            if (m.getLatLng().lat === item.lat && m.getLatLng().lng === item.lng) {
              m.openPopup();
            }
          });
        } else {
          updateSvgOfflineMapHighlight(item.info.mainNum || item.info.crossingNum, item.info.crossingNum || item.info.mainNum);
        }
      });

      routeList.appendChild(li);
    });

    lucide.createIcons();
  }

  function updateSvgOfflineMapHighlight(calle, carrera) {
    if (calle && carrera) {
      updateSvgPinPosition(calle, carrera, classifyBogotaZone(calle, carrera));
    }
  }

  // Opens Waze mobile deep link (or falls back to google maps on failure)
  function openNavigationApp(lat, lng, address) {
    // Official Waze deep link schema for iOS and Android
    const wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    
    // We launch Waze in a new tab/window which mobile browsers catch and redirect to native Waze
    const opened = window.open(wazeUrl, '_blank');
    
    // Fallback logic
    if (!opened) {
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      window.open(mapsUrl, '_blank');
    }
  }

  // WhatsApp share exporter
  btnShareWhatsapp.addEventListener('click', () => {
    if (deliveryRoute.length === 0) {
      alert("No hay direcciones en la ruta para compartir.");
      return;
    }

    let text = `📍 *RUTA DE ENTREGAS - BOGOZONAS* 📍\n`;
    text += `Punto de Partida: Calle 162 # 20 - 31\n`;
    text += `------------------------------------\n\n`;

    deliveryRoute.forEach((item, index) => {
      const statusIcon = item.completed ? '✅' : '📦';
      const statusText = item.completed ? '(Entregado)' : '(Pendiente)';
      text += `${index + 1}. ${statusIcon} [${item.zone.toUpperCase()}] ${item.address} ${statusText}\n`;
    });

    text += `\n------------------------------------\n`;
    text += `Generado por BogoZonas App 🚗💨`;

    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  });

  // Empty active route
  btnClearRoute.addEventListener('click', () => {
    if (confirm("¿Estás seguro de que deseas vaciar toda la ruta activa?")) {
      deliveryRoute = [];
      saveRouteState();
      renderRouteList();
      triggerMapRedraw();
    }
  });

  // --- 14. History Storage ---
  function saveScanToHistory(info, calle, carrera, zone) {
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem('bogozonas_history')) || [];
    } catch (e) {
      history = [];
    }

    const cleanAddress = `${info.type} ${info.mainNum}${info.mainSuffix} # ${info.crossingNum}${info.crossingSuffix} - ${info.plate}`;
    
    if (history.length > 0 && history[0].address.toLowerCase() === cleanAddress.toLowerCase()) {
      return;
    }

    const historyItem = {
      address: cleanAddress.toUpperCase(),
      zone: zone,
      calle: calle,
      carrera: carrera,
      info: info,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    history.unshift(historyItem);
    if (history.length > 20) history.pop();

    localStorage.setItem('bogozonas_history', JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem('bogozonas_history')) || [];
    } catch (e) {
      history = [];
    }

    if (history.length === 0) {
      historyList.classList.add('hidden');
      historyEmptyMessage.classList.remove('hidden');
      return;
    }

    historyEmptyMessage.classList.add('hidden');
    historyList.classList.remove('hidden');
    historyList.innerHTML = '';

    history.forEach(item => {
      const li = document.createElement('li');
      li.className = 'history-item';
      
      li.innerHTML = `
        <div class="history-item-left">
          <span class="history-address">${item.address}</span>
          <span class="history-time">Ubicado a las ${item.timestamp}</span>
        </div>
        <span class="history-badge ${item.zone.toLowerCase()}">${item.zone}</span>
      `;

      li.addEventListener('click', () => {
        applyAddressResult(item.info);
      });

      historyList.appendChild(li);
    });
  }

  btnClearHistory.addEventListener('click', () => {
    if (confirm("¿Estás seguro de que quieres borrar el historial de escaneos?")) {
      localStorage.removeItem('bogozonas_history');
      renderHistory();
    }
  });

  // --- 15. Initial State Load ---
  renderHistory();
  renderRouteList();
  
  // Default starts on Leaflet
  initLeafletMap();
  triggerMapRedraw();
});
