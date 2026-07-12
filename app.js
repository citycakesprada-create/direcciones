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
  
  // Tabs & Views
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
  
  // History & Network
  const historyList = document.getElementById('history-list');
  const historyEmptyMessage = document.getElementById('history-empty-message');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const networkStatus = document.getElementById('network-status');

  // --- App State ---
  let webcamStream = null;
  let useRearCamera = true;
  let isMapOnline = true;
  let leafletMap = null;
  let leafletMarker = null;
  let leafletPolygons = {};
  let currentScanResult = null;
  let tesseractWorker = null;

  // Initialize Lucide Icons
  lucide.createIcons();

  // --- 1. Service Worker & PWA ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('Service Worker registrado con éxito.'))
      .catch(err => console.error('Error al registrar Service Worker:', err));
  }

  // --- 2. Network Status Monitoring ---
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

  // --- 3. Camera Operations ---
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
      // Fallback to any camera if environment-specific fails
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
    
    // Configure canvas size matching video frame
    captureCanvas.width = webcamElement.videoWidth;
    captureCanvas.height = webcamElement.videoHeight;
    
    const ctx = captureCanvas.getContext('2d');
    // Draw current video frame to canvas
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

  // --- 4. Gallery Uploads ---
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
    
    // Reset file input value to allow triggering change on same image
    galleryInput.value = '';
  });

  // --- 5. OCR Engine (Tesseract.js) ---
  async function processImageOCR(imageSource) {
    ocrLoader.classList.remove('hidden');
    ocrStatusText.textContent = "Cargando motor de reconocimiento OCR...";
    ocrProgressBar.style.width = '10%';

    try {
      // Lazy initialization of Tesseract worker
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

  // --- 6. Bogota Address Parser & Normalizer ---
  function parseAndClassifyAddress(text) {
    if (!text || text.trim() === '') return;

    // Normalization logic
    let cleanText = text.toLowerCase()
      .replace(/[áäàâ]/g, 'a')
      .replace(/[éëèê]/g, 'e')
      .replace(/[íïìî]/g, 'i')
      .replace(/[óöòô]/g, 'o')
      .replace(/[úüùû]/g, 'u')
      .replace(/ñ/g, 'n')
      .replace(/\./g, ' '); // remove dots

    // Normalize address abbreviations
    cleanText = cleanText
      .replace(/\bcll?\b|\bcalle\b|\bcld\b/g, 'calle')
      .replace(/\bcra?\b|\bkr\b|\bkra\b|\bcarrera\b/g, 'carrera')
      .replace(/\bdg\b|\bdiag\b|\bdiagonal\b/g, 'diagonal')
      .replace(/\btv\b|\btrans\b|\btransversal\b/g, 'transversal')
      .replace(/\bav\b|\bavenida\b/g, 'avenida')
      .replace(/\bn[o°º]\b|\bnum\b|\bnumero\b/g, '#');

    console.log("Normalized Text for Parser:", cleanText);

    // Primary parser regex matching standard patterns like "calle 147 # 19 - 50"
    // Groups: 1=type, 2=mainNum, 3=mainSuffix, 4=crossingNum, 5=crossingSuffix, 6=plate
    const standardRegex = /(calle|carrera|diagonal|transversal|avenida)\s*(\d+)\s*([a-z]?)(?:\s*bis)?(?:\s*(?:norte|sur|este))?\s*(?:#|no|\s)\s*(\d+)\s*([a-z]?)(?:\s*bis)?\s*(?:-|\s)?\s*(\d+)/i;
    
    const match = cleanText.match(standardRegex);
    let addressInfo = null;

    if (match) {
      addressInfo = {
        type: match[1].toLowerCase(),
        mainNum: parseInt(match[2]),
        mainSuffix: match[3] || '',
        crossingNum: parseInt(match[4]),
        crossingSuffix: match[5] || '',
        plate: match[6] || '',
        raw: text.trim()
      };
    } else {
      // Fallback parser if standard layout fails (e.g. OCR grabs chaotic pieces)
      // We look for any "calle/diagonal X" and "carrera/transversal Y" in the text
      const calleMatch = cleanText.match(/\b(calle|diagonal)\s*(\d+)\s*([a-z]?)/i);
      const carreraMatch = cleanText.match(/\b(carrera|transversal)\s*(\d+)\s*([a-z]?)/i);
      const plateMatch = cleanText.match(/#\s*(\d+)/i) || cleanText.match(/-\s*(\d+)/i);

      if (calleMatch && carreraMatch) {
        // Find which one is the primary via based on which comes first in the text
        const isCalleFirst = cleanText.indexOf(calleMatch[0]) < cleanText.indexOf(carreraMatch[0]);
        
        addressInfo = {
          type: isCalleFirst ? calleMatch[1].toLowerCase() : carreraMatch[1].toLowerCase(),
          mainNum: isCalleFirst ? parseInt(calleMatch[2]) : parseInt(carreraMatch[2]),
          mainSuffix: isCalleFirst ? calleMatch[3] || '' : carreraMatch[3] || '',
          crossingNum: isCalleFirst ? parseInt(carreraMatch[2]) : parseInt(calleMatch[2]),
          crossingSuffix: isCalleFirst ? carreraMatch[3] || '' : calleMatch[3] || '',
          plate: plateMatch ? plateMatch[1] : '',
          raw: text.trim()
        };
      }
    }

    if (addressInfo) {
      applyAddressResult(addressInfo);
    } else {
      // If parsing fails completely, load raw text to editor for correction
      detailCalle.textContent = '-';
      detailCarrera.textContent = '-';
      detailRawText.textContent = text.length > 30 ? text.substring(0, 30) + '...' : text;
      
      updateZoneDisplay('unclassified');
      alert("No pudimos identificar la dirección automáticamente. Por favor digítala en el formulario.");
      
      // Auto fill as much as possible to the editor
      const words = cleanText.split(/\s+/);
      const numbers = words.map(w => parseInt(w.replace(/\D/g, ''))).filter(n => !isNaN(n));
      if (numbers.length > 0) inputMainNumber.value = numbers[0];
      if (numbers.length > 1) inputCrossingNumber.value = numbers[1];
      if (numbers.length > 2) inputPlate.value = numbers[2];
      
      // Focus the form
      document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
    }
  }

  // --- 7. Apply Parser Output to UI & Form ---
  function applyAddressResult(info) {
    currentScanResult = info;

    // Fill form inputs
    inputType.value = info.type;
    inputMainNumber.value = info.mainNum + info.mainSuffix;
    inputCrossingNumber.value = info.crossingNum + info.crossingSuffix;
    inputPlate.value = info.plate;

    // Calculate grid numbers for Calle and Carrera in Bogota
    // Calles are Calle/Diagonal
    // Carreras are Carrera/Transversal
    let normalizedCalle = 0;
    let normalizedCarrera = 0;

    if (info.type === 'calle' || info.type === 'diagonal') {
      normalizedCalle = info.mainNum;
      normalizedCarrera = info.crossingNum;
    } else if (info.type === 'carrera' || info.type === 'transversal') {
      normalizedCalle = info.crossingNum;
      normalizedCarrera = info.mainNum;
    } else if (info.type === 'avenida') {
      // Avenidas can be either, default fallback: assume Calle if it's the main
      // Usually, in Bogota north, streets are mostly Calles. If crossing is larger, we can invert
      if (info.mainNum < info.crossingNum) {
        normalizedCalle = info.mainNum;
        normalizedCarrera = info.crossingNum;
      } else {
        normalizedCalle = info.crossingNum;
        normalizedCarrera = info.mainNum;
      }
    }

    // Update details card
    detailCalle.textContent = `Calle ${normalizedCalle}${info.type === 'calle' ? info.mainSuffix : info.crossingSuffix}`;
    detailCarrera.textContent = `Carrera ${normalizedCarrera}${info.type === 'carrera' ? info.mainSuffix : info.crossingSuffix}`;
    detailRawText.textContent = info.raw || 'Digitado manual';

    // 8. Classify Zone
    const zone = classifyBogotaZone(normalizedCalle, normalizedCarrera);
    updateZoneDisplay(zone);

    // 9. Map Markers & Rendering
    const coords = approximateGridToCoordinates(normalizedCalle, normalizedCarrera);
    updateMapMarker(coords.lat, coords.lng, normalizedCalle, normalizedCarrera, zone);

    // 10. Save to History
    saveScanToHistory(info, normalizedCalle, normalizedCarrera, zone);

    // Scroll to results
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
  }

  // --- 8. Zone Classifier Algorithm ---
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

  // Update Result Badge Style and Labels
  function updateZoneDisplay(zone) {
    // Reset classes
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

  // --- 9. Coordinate Model (Grid to Lat/Lng) ---
  function approximateGridToCoordinates(calle, carrera) {
    // Model validated against north Bogota coordinates:
    // Lat increases as Calle increases
    // Lng decreases (more negative/west) as Carrera increases
    // Modest correction factors for slight road tilt
    const lat = 4.590 + (calle * 0.00095);
    const lng = -74.037 - (carrera * 0.00071) + ((calle - 100) * 0.00021);
    
    return { lat, lng };
  }

  // --- 10. Map Controller ---
  function toggleMapMode(online) {
    isMapOnline = online;
    if (online) {
      btnMapOnline.classList.add('active');
      btnMapOffline.classList.remove('active');
      mapElement.classList.remove('hidden');
      svgMapContainer.classList.add('hidden');
      initLeafletMap();
    } else {
      btnMapOnline.classList.remove('active');
      btnMapOffline.classList.add('active');
      mapElement.classList.add('hidden');
      svgMapContainer.classList.remove('hidden');
    }
  }

  btnMapOnline.addEventListener('click', () => toggleMapMode(true));
  btnMapOffline.addEventListener('click', () => toggleMapMode(false));

  function initLeafletMap() {
    if (leafletMap) {
      leafletMap.invalidateSize();
      return;
    }

    // Default center at Calle 120 / Carrera 30
    leafletMap = L.map('map', {
      zoomControl: true,
      attributionControl: false
    }).setView([4.704, -74.058], 12);

    // Dark Map Style Tiles (Voyager Dark or CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20
    }).addTo(leafletMap);

    // Draw Zone Polygons on Leaflet map
    drawLeafletZonePolygons();
  }

  function drawLeafletZonePolygons() {
    const zonesDef = [
      {
        name: 'Usaquén',
        color: varColor('--color-usaquen'),
        corners: [[105, 2], [193, 2], [193, 45], [105, 45]]
      },
      {
        name: 'Chapinero',
        color: varColor('--color-chapinero'),
        corners: [[30, 2], [100, 2], [100, 30], [30, 30]]
      },
      {
        name: 'Suba 1',
        color: varColor('--color-suba1'),
        corners: [[100, 45], [189, 45], [189, 72], [100, 72]]
      },
      {
        name: 'Suba 2',
        color: varColor('--color-suba2'),
        corners: [[90, 72], [189, 72], [189, 159], [90, 159]]
      }
    ];

    zonesDef.forEach(zone => {
      const latlngs = zone.corners.map(corner => {
        const coords = approximateGridToCoordinates(corner[0], corner[1]);
        return [coords.lat, coords.lng];
      });

      leafletPolygons[zone.name] = L.polygon(latlngs, {
        color: zone.color,
        fillColor: zone.color,
        fillOpacity: 0.12,
        weight: 1.5,
        dashArray: '3, 4'
      }).addTo(leafletMap)
        .bindPopup(`<b>Zona: ${zone.name}</b>`);
    });
  }

  // Utility to fetch CSS variable color value
  function varColor(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  function updateMapMarker(lat, lng, calle, carrera, zone) {
    // 1. Update Online Map (Leaflet)
    if (leafletMap) {
      if (leafletMarker) {
        leafletMarker.setLatLng([lat, lng]);
      } else {
        const customIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `<div style="background-color: var(--danger); width: 14px; height: 14px; border: 2.5px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });
        leafletMarker = L.marker([lat, lng], { icon: customIcon }).addTo(leafletMap);
      }

      leafletMarker.bindPopup(`
        <div style="font-family: Outfit, sans-serif; font-size: 0.85rem; line-height: 1.4;">
          <strong style="color: white; font-size: 0.95rem;">Dirección Ubicada</strong><br/>
          Calle: ${calle}<br/>
          Carrera: ${carrera}<br/>
          <strong style="color: ${getZoneHexColor(zone)}; text-transform: uppercase;">Zona: ${zone}</strong>
        </div>
      `).openPopup();

      leafletMap.setView([lat, lng], 14);
    }

    // 2. Update Offline Map (SVG)
    updateSvgOfflineMap(calle, carrera);
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

  // Offline SVG Map Positioning
  function updateSvgOfflineMap(calle, carrera) {
    const svgMarker = document.getElementById('svg-marker');
    
    // Map Calle to SVG Y [900, 250] (Calle 30 to 200)
    const minCalle = 30;
    const maxCalle = 200;
    const minSvgY = 900;
    const maxSvgY = 250;
    
    let svgY = minSvgY;
    if (calle >= minCalle) {
      const ratio = Math.min((calle - minCalle) / (maxCalle - minCalle), 1);
      svgY = minSvgY - ratio * (minSvgY - maxSvgY);
    } else {
      svgY = 950; // below Calle 30
    }

    // Map Carrera to SVG X
    let svgX = 760;
    if (carrera >= 2 && carrera <= 72) {
      // Uniform scale for Carrera 2 to 72: X goes from 750 down to 400
      svgX = 750 - (carrera - 2) * 5;
    } else if (carrera > 72 && carrera <= 159) {
      // Scale for Carrera 72 to 159: X goes from 400 down to 100
      svgX = 400 - (carrera - 72) * 3.448;
    } else if (carrera > 159) {
      svgX = 100 - (carrera - 159) * 2;
    }

    // Position marker and make visible
    svgMarker.setAttribute('transform', `translate(${svgX}, ${svgY})`);
    
    // Setup pulse ring origin
    const pulseRing = svgMarker.querySelector('.svg-marker-pulse');
    if (pulseRing) {
      pulseRing.setAttribute('cx', '0');
      pulseRing.setAttribute('cy', '0');
    }

    svgMarker.classList.remove('hidden');

    // Highlight corresponding SVG polygon
    document.querySelectorAll('.svg-zone').forEach(el => {
      el.setAttribute('stroke-width', '2');
      el.style.opacity = '1';
    });

    let activePolyId = null;
    const zone = classifyBogotaZone(calle, carrera);
    if (zone === 'usaquén') activePolyId = 'svg-zone-usaquen';
    else if (zone === 'chapinero') activePolyId = 'svg-zone-chapinero';
    else if (zone === 'suba 1') activePolyId = 'svg-zone-suba1';
    else if (zone === 'suba 2') activePolyId = 'svg-zone-suba2';

    if (activePolyId) {
      const activePoly = document.getElementById(activePolyId);
      if (activePoly) {
        activePoly.setAttribute('stroke-width', '4.5');
        // Give it a subtle pop effect
        activePoly.style.opacity = '0.9';
      }
    }
  }

  // --- 11. Form Handler ---
  addressForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const type = inputType.value;
    const mainNumStr = inputMainNumber.value.trim();
    const crossingNumStr = inputCrossingNumber.value.trim();
    const plate = inputPlate.value.trim();

    // Parse suffixes if present in user inputs (e.g. 147A -> num:147, suff:A)
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

  // --- 12. History Persistence & Rendering ---
  function saveScanToHistory(info, calle, carrera, zone) {
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem('bogozonas_history')) || [];
    } catch (e) {
      history = [];
    }

    const cleanAddress = `${info.type} ${info.mainNum}${info.mainSuffix} # ${info.crossingNum}${info.crossingSuffix} - ${info.plate}`;
    
    // Check if duplicate of last item to avoid repeat saves
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

    // Keep up to 20 entries
    history.unshift(historyItem);
    if (history.length > 20) {
      history.pop();
    }

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

      // Click event to reload this address back into the viewer
      li.addEventListener('click', () => {
        applyAddressResult(item.info);
      });

      historyList.appendChild(li);
    });
  }

  // Clear History Action
  btnClearHistory.addEventListener('click', () => {
    if (confirm("¿Estás seguro de que quieres borrar el historial de escaneos?")) {
      localStorage.removeItem('bogozonas_history');
      renderHistory();
    }
  });

  // Initial History Render
  renderHistory();
});
