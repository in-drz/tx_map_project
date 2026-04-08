mapboxgl.accessToken = 'pk.eyJ1IjoiaW4tZHJ6IiwiYSI6ImNtbnA0b3F5bDJkbHUycHB1Ym0wemZ0ZTgifQ.2WB5ctJkSXTRaBmLaUFFEw';

const cleanVTD = (vtd) => {
    if (!vtd) return 'N/A';
    // Convert to string and strip leading zeros
    return vtd.toString().replace(/^0+/, '');
};


const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v11',
    center: [-98.2, 27.5], // Centered roughly on South Texas CD-15
    zoom: 6.5,
    cooperativeGestures: true
});

// Add zoom and rotation controls to the map.
map.addControl(new mapboxgl.NavigationControl(), 'top-right');

map.on('load', () => {
    console.log("Map loaded, adding sources and layers...");

    // ==========================================
    // 1. ADD DATA SOURCES
    // ==========================================
    
    map.addSource('precincts-source', { 
        type: 'geojson', 
        data: 'data/precincts.geojson' 
    });

    map.addSource('district-outline-source', {
        type: 'geojson', 
        data: 'data/district_15_outline.geojson'
    });

    map.addSource('schools-source', { 
        type: 'geojson', 
        data: 'data/school_districts.geojson' 
    });

// ==========================================
    // 2. ADD LAYERS (RE-ORDERED FOR VISIBILITY)
    // ==========================================
    
    // 1. Bottom: Precinct Fills
    map.addLayer({
        id: 'precincts-fill',
        type: 'fill',
        source: 'precincts-source',
        paint: { 'fill-color': '#e63946', 'fill-opacity': 0.2 }
    });

    // 2. Precinct Outlines
    map.addLayer({
        id: 'precincts-outline',
        type: 'line',
        source: 'precincts-source',
        paint: { 'line-color': '#a30015', 'line-width': 0.5, 'line-opacity': 0.6 }
    });

    // 3. District Border
    map.addLayer({
        id: 'district-outline-layer',
        type: 'line',
        source: 'district-outline-source',
        paint: { 'line-color': '#2c3e50', 'line-width': 3 }
    });

    // 4. School Fill (Invisible but clickable)
    map.addLayer({
        id: 'schools-fill-interactive',
        type: 'fill',
        source: 'schools-source',
        paint: { 'fill-color': 'rgba(0,0,0,0)' } 
    });

    // 5. Precinct Labels
    map.addLayer({
        id: 'precincts-labels',
        type: 'symbol',
        source: 'precincts-source',
        minzoom: 8,
        layout: {
            'text-field': ['get', 'VTD'], 
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 11
        },
        paint: { 'text-color': '#a30015', 'text-halo-color': '#ffffff', 'text-halo-width': 1 }
    });

    // 6. SCHOOL BOUNDARIES (Moved to top of stack)
    map.addLayer({
        id: 'schools-layer',
        type: 'line',
        source: 'schools-source',
        paint: { 
            'line-color': '#457b9d', 
            'line-width': 3, 
            'line-opacity': 1.0 
        }
    });

    // 7. SCHOOL LABELS (Absolute top)
    map.addLayer({
        id: 'schools-labels',
        type: 'symbol',
        source: 'schools-source',
        layout: {
            'text-field': ['get', 'NAME'],
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'],
            'text-size': 12,
            'text-anchor': 'top'
        },
        paint: { 
            'text-color': '#457b9d', 
            'text-halo-color': '#ffffff', 
            'text-halo-width': 2 
        }
    });
    // ==========================================
    // 3. POPUP LOGIC (Slick & Mobile-Friendly)
    // ==========================================
    
    map.on('click', (e) => {
        // 1. Smoothly center the map on the click
        map.flyTo({
            center: e.lngLat,
            duration: 200,
            essential: true
        });

        // 2. Setup a 5px touch-friendly box for better accuracy on mobile
        const bbox = [
            [e.point.x - 5, e.point.y - 5],
            [e.point.x + 5, e.point.y + 5]
        ];

        const features = map.queryRenderedFeatures(bbox, {
            layers: ['precincts-fill', 'schools-fill-interactive']
        });

        if (features.length === 0) return;

        const precinct = features.find(f => f.layer.id === 'precincts-fill');
        const school = features.find(f => f.layer.id === 'schools-fill-interactive');

        // --- BUILD PRECINCT TAB HTML ---
        let precinctHTML = `<div style="padding: 15px; color: #666;"><em>No precinct data found at this location.</em></div>`;
        if (precinct) {
            const p = precinct.properties;
            const displayVTD = cleanVTD(p.VTD || p.CNTYVTD);
            const pop = p.TotalPop ? Number(p.TotalPop).toLocaleString() : '0';
            const vr = p.TotalVR ? Number(p.TotalVR).toLocaleString() : '0';

            precinctHTML = `
                <div style="padding: 5px;">
                    <h3 style="color: #e63946;">Precinct ${displayVTD}</h3>
                    <p style="margin: 5px 0;"><strong>Population:</strong> ${pop}</p>
                    <p style="margin: 5px 0;"><strong>Reg. Voters:</strong> ${vr}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin:10px 0;"/>
                    <p style="font-size: 0.85em; font-weight: bold; margin-bottom: 5px;">Overlapping Schools:</p>
                    <ul style="max-height: 120px; overflow-y: auto; padding-left: 15px; margin: 0;">`;

            const schoolOverlaps = JSON.parse(p.school_overlaps || '[]');
            if (schoolOverlaps.length > 0) {
                schoolOverlaps.forEach(s => { precinctHTML += `<li style="font-size: 0.85em; margin-bottom: 4px;">${s.name} <span style="color: #888;">(${s.area} sq mi)</span></li>`; });
            } else { precinctHTML += `<li style="font-size: 0.85em;">No major school overlaps</li>`; }
            precinctHTML += `</ul></div>`;
        }

        // --- BUILD SCHOOL TAB HTML ---
        let schoolHTML = `<div style="padding: 15px; color: #666;"><em>No school district data found.</em></div>`;
        if (school) {
            const s = school.properties;
            const overlaps = JSON.parse(s.precinct_overlaps || '[]');

            schoolHTML = `
                <div style="padding: 5px;">
                    <h3 style="color: #457b9d;">${s.NAME}</h3>
                    <p style="font-size: 0.85em; font-weight: bold; margin-bottom: 8px;">Precincts in District:</p>
                    <ul style="max-height: 180px; overflow-y: auto; padding-left: 15px; margin: 0;">`;

            if (overlaps.length > 0) {
                overlaps.forEach(o => {
                    const vtd = cleanVTD(o.vtd);
                    schoolHTML += `<li style="margin-bottom: 10px; border-bottom: 1px solid #f9f9f9; padding-bottom: 5px;">
                                <strong style="color: #457b9d;">Pct ${vtd}</strong>: ${o.area} sq mi<br/>
                                <small style="color: #666;">Voters: ${Number(o.voters).toLocaleString()} | Pop: ${Number(o.pop).toLocaleString()}</small>
                             </li>`;
                });
            } else { schoolHTML += `<li>No precinct data available</li>`; }
            schoolHTML += `</ul></div>`;
        }

        // --- SMART TAB SELECTION ---
        // If there's no precinct data, automatically show the school tab
        const precinctVisible = precinct ? 'block' : 'none';
        const schoolVisible = (!precinct && school) ? 'block' : 'none';
        const precinctBtnStyle = precinct ? 'border-bottom: 2px solid #e63946; color: #e63946; font-weight: bold;' : 'color: #666;';
        const schoolBtnStyle = (!precinct && school) ? 'border-bottom: 2px solid #457b9d; color: #457b9d; font-weight: bold;' : 'color: #666;';

        const combinedHTML = `
            <div class="popup-tabs-container" style="min-width: 270px; font-family: 'Inter', sans-serif;">
                <div style="display: flex; background: #f1f1f1; border-radius: 8px 8px 0 0; overflow: hidden; border-bottom: 1px solid #ddd;">
                    <button id="btn-p" onclick="document.getElementById('tab-p').style.display='block'; document.getElementById('tab-s').style.display='none'; this.style.borderBottom='2px solid #e63946'; this.style.color='#e63946'; this.style.fontWeight='bold'; document.getElementById('btn-s').style.borderBottom='none'; document.getElementById('btn-s').style.color='#666'; document.getElementById('btn-s').style.fontWeight='normal';" 
                            style="flex: 1; padding: 10px 5px; cursor: pointer; background: none; border: none; font-size: 10px; letter-spacing: 0.5px; transition: 0.2s; ${precinctBtnStyle}">PRECINCT</button>
                    <button id="btn-s" onclick="document.getElementById('tab-s').style.display='block'; document.getElementById('tab-p').style.display='none'; this.style.borderBottom='2px solid #457b9d'; this.style.color='#457b9d'; this.style.fontWeight='bold'; document.getElementById('btn-p').style.borderBottom='none'; document.getElementById('btn-p').style.color='#666'; document.getElementById('btn-p').style.fontWeight='normal';" 
                            style="flex: 1; padding: 10px 5px; cursor: pointer; background: none; border: none; font-size: 10px; letter-spacing: 0.5px; transition: 0.2s; ${schoolBtnStyle}">SCHOOL DISTRICT</button>
                </div>
                <div style="padding: 10px;">
                    <div id="tab-p" style="display: ${precinctVisible};">${precinctHTML}</div>
                    <div id="tab-s" style="display: ${schoolVisible};">${schoolHTML}</div>
                </div>
            </div>`;

        new mapboxgl.Popup({ maxWidth: '320px', focusAfterOpen: false })
            .setLngLat(e.lngLat)
            .setHTML(combinedHTML)
            .addTo(map);
    });

    // ==========================================
    // 4. UI ENHANCEMENTS & TOGGLES
    // ==========================================
    
    const interactiveLayers = ['precincts-fill', 'schools-fill-interactive'];
    interactiveLayers.forEach(layer => {
        map.on('mouseenter', layer, () => map.getCanvas().style.cursor = 'pointer');
        map.on('mouseleave', layer, () => map.getCanvas().style.cursor = '');
    });

    setupToggles();

    function setupToggles() {

        const sidebar = document.getElementById('control-panel');
        const toggleBtn = document.getElementById('toggle-sidebar');

        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            
            // Change the icon from X to ☰ when collapsed
            if (sidebar.classList.contains('collapsed')) {
                toggleBtn.innerHTML = '☰'; 
            } else {
                toggleBtn.innerHTML = '×';
            }
        });
        const toggles = [
            { id: 'overall-outline-toggle', layers: ['district-outline-layer'] },
            { id: 'precincts-toggle', layers: ['precincts-fill', 'precincts-labels'] },
            { id: 'boundaries-toggle', layers: ['precincts-outline'] },
            { id: 'schools-toggle', layers: ['schools-layer', 'schools-labels', 'schools-fill-interactive'] }
        ];

        toggles.forEach(t => {
            const el = document.getElementById(t.id);
            if (el) {
                el.addEventListener('change', (e) => {
                    const vis = e.target.checked ? 'visible' : 'none';
                    t.layers.forEach(lyr => map.setLayoutProperty(lyr, 'visibility', vis));
                });
            }
        });
    }
}); // <-- THIS WAS MISSING

const sidebar = document.getElementById('control-panel');
const toggleBtn = document.getElementById('toggle-sidebar');

if (sidebar && toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault(); // Prevents "ghost clicks" on mobile
        sidebar.classList.toggle('collapsed');
        
        const isCollapsed = sidebar.classList.contains('collapsed');
        
        // Use a simple icon change; the CSS handles the rotation
        if (isCollapsed) {
            toggleBtn.innerHTML = '▶'; 
        } else {
            toggleBtn.innerHTML = '◀';
        }
    });
}