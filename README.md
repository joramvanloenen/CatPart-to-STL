# CATPart → STL

A responsive CAD-to-STL conversion workbench for GitHub Pages.

**Live website:** https://joramvanloenen.github.io/CatPart-to-STL/

## Supported formats

| File format | Conversion status | How |
| --- | --- | --- |
| STEP / STP | Browser conversion | OpenCascade WebAssembly + binary STL |
| IGES / IGS | Browser conversion | OpenCascade WebAssembly + binary STL |
| BREP / BRP | Browser conversion | OpenCascade WebAssembly + binary STL |
| OBJ | Browser conversion | Three.js + binary STL |
| STL | Browser re-export | Three.js |
| CATPart (CATIA V5) | Requires a licensed native translator | Configurable external HTTPS API |

**The CATPart browser conversion is not implemented.** CATIA V5's proprietary file format cannot be directly triangulated with the open-source STEP/IGES parser. Unlike many fake online converters, this site never offers an empty or invented STL for an unconverted CATPart. It inspects the file signature and version, explains the limitation, and can call a separately hosted, licensed geometry translator that returns real STL triangles.

The supplied example, DG01D.CATPart, was inspected: genuine CATIA V5 container signature V5_CFV2 and release V5R28SP0HF0. **It has not been successfully converted to STL yet**, as no licensed translator is connected. The sample was not committed to this public repository.

### Features

- Drop a supported CAD file on the upload zone, or browse.
- Orbit, zoom, pan, fit, and wireframe 3D geometry.
- Choose tessellation quality for STEP / IGES.
- Inspect estimated mesh dimensions and triangle count.
- Download a binary STL, preserving source coordinates.
- View CATPart file format and release information without sending it anywhere.
- Configure an optional native translator URL saved in localStorage on your own device.
- Fully responsive static application, no frontend build step.

### Privacy

Open CAD and mesh files are read locally in the browser; file contents do not leave your device. Three.js JavaScript modules and the OpenCascade JS/WASM runtime load from jsDelivr, but file contents are not sent to those CDNs. For CATPart, pressing Convert using translator explicitly uploads the file to the URL you entered. Do not use an untrusted translator for confidential CAD models.

### Local development

Serve the repository using any static HTTP server:

    python -m http.server 8000

Open http://localhost:8000.

The interface loads Three.js 0.174.0 through the pinned import map, and lazily loads occt-import-js 0.0.23 and its WebAssembly when a STEP, IGES or BREP file is opened. JavaScript and WebAssembly need network access at first load.

### Native CATPart conversion

A true CATPart parser needs CATIA-compatible geometry support, such as a licensed instance of Dassault CATIA V5, CAD Exchanger SDK, Spatial 3D InterOp or HOOPS Exchange. GitHub Pages only serves static files; it cannot run these native libraries, and none are included here.

The frontend uses a simple contract:

- HTTP POST to your configured HTTPS /convert URL.
- multipart/form-data with one field named file, containing the CATPart.
- A successful 200 response contains the actual STL bytes (binary preferred).
- Failed conversions return a non-2xx status, optionally with JSON detail.
- The browser checks the STL for triangles before enabling export.

The optional backend/app.py is a FastAPI adapter which can execute a **trusted, installed and licensed** converter CLI. It does not independently decode CATPart. Its converter command is defined by the server administrator via CATPART_CONVERT_COMMAND, never by the uploaded file or user interface.

Install (Python 3.10 or newer):

    cd backend
    python -m venv .venv
    # Activate the environment (Windows: .venv\Scripts\activate)
    pip install -r requirements.txt

Configure the following environment variables for your operating system:

    CATPART_CONVERT_COMMAND=/path/to/your/licensed-converter {input} {output}
    ALLOWED_ORIGINS=https://joramvanloenen.github.io
    MAX_FILE_BYTES=104857600
    CONVERTER_TIMEOUT_SECONDS=180

The converter command above is a **placeholder**, not a real executable. Use the actual command syntax from your licensed translator provider. Start the adapter:

    uvicorn app:app --host 127.0.0.1 --port 8001

For local testing use http://localhost:8001/convert in the app. For public Pages, host the adapter behind HTTPS and implement authentication, rate limits, logging hygiene, resource isolation and a privacy policy **before** public exposure. CORS restrictions alone are not security. API keys must never be embedded in this public frontend.

### CATIA V5 installed locally?

The repository also includes scripts/catia-export.vbs for exporting a CATPart to STL through a running licensed CATIA V5 installation on Windows.

    cscript //nologo scripts\catia-export.vbs input.CATPart output.stl

This offline script is optional and needs CATIA Windows automation support; it is not a browser converter.

### Pages deployment

The .github/workflows/pages.yml workflow runs on pushes to main and configures GitHub Pages with actions/configure-pages, upload-pages-artifact, and deploy-pages. If GitHub Pages is not initially enabled by the workflow, select Settings → Pages → Build and deployment → Source: GitHub Actions and re-run the workflow. A successful workflow exposes https://joramvanloenen.github.io/CatPart-to-STL/.

### Important notes

- STL has no units metadata. CAD importer outputs millimetres; original OBJ/STL numeric coordinates are displayed as millimetres by convention and are not rescaled.
- Exporting as STL discards B-rep, design history, semantic features, colors and metadata.
- STL output is not guaranteed manifold/watertight. Inspect in your slicer before manufacturing.
- Complex models can require significant memory in browsers.
- This repo does not bundle or redistribute proprietary geometry libraries.

### Dependencies and attribution

- Three.js (MIT), https://threejs.org
- occt-import-js (LGPL-2.1), https://github.com/kovacsv/occt-import-js
- OpenCascade Technology (LGPL-2.1 with additional exception), https://dev.opencascade.org
- Native CATIA alternatives: https://cadexchanger.com/catpart-to-stl/ and https://www.spatial.com/glossary/catpart-to-stl

This project's own code is MIT-licensed (see LICENSE). Third-party assets and dependencies retain their respective licenses.
