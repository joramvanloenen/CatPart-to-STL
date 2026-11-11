import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const $ = (id) => document.getElementById(id);
const el = {
  drop: $('dropzone'), input: $('file-input'), fileCard: $('file-card'),
  fileName: $('file-name'), fileDetails: $('file-details'), badge: $('file-badge'),
  clear: $('clear-file'), status: $('file-status'), format: $('format-status'),
  release: $('release-status'), quality: $('quality'), qualityValue: $('quality-value'),
  convert: $('convert'), convertLabel: $('convert-label'), message: $('message'),
  viewport: $('viewport'), placeholder: $('placeholder'), fit: $('fit-view'),
  wireframe: $('wireframe'), viewState: $('view-state'), triCount: $('triangle-count'),
  width: $('size-x'), height: $('size-y'), depth: $('size-z'),
  endpoint: $('endpoint'), saveEndpoint: $('save-endpoint')
};
const FORMATS = {
  catpart: 'CATIA V5 PART', step: 'STEP / ISO 10303', stp: 'STEP / ISO 10303',
  iges: 'IGES', igs: 'IGES', brep: 'OPEN CASCADE BREP', brp: 'OPEN CASCADE BREP',
  obj: 'WAVEFRONT OBJ', stl: 'STL MESH'
};
const DEFLECTIONS = [0.75, 0.30, 0.10, 0.035];
let file = null, format = null, busy = false, nativeBlob = null, triangleCount = 0;
let occtPromise = null, wireframe = false, source = new THREE.Group();
try { el.endpoint.value = localStorage.getItem('catpart-stl-endpoint') || ''; } catch (_) {}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
el.viewport.insertBefore(renderer.domElement, el.placeholder);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.0001, 1000000);
camera.position.set(90, 70, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 0.0001;
controls.maxDistance = 1000000;
scene.add(new THREE.HemisphereLight(0xf8f9ee, 0x34454f, 2.3));
const mainLight = new THREE.DirectionalLight(0xfff4e7, 2.35);
mainLight.position.set(40, 100, 60);
scene.add(mainLight);
const secondaryLight = new THREE.DirectionalLight(0xa0c5ca, 1.15);
secondaryLight.position.set(-65, 0, -40);
scene.add(secondaryLight);
const grid = new THREE.GridHelper(10, 20, 0x526861, 0x2e4541);
grid.material.transparent = true;
grid.material.opacity = 0.4;
scene.add(grid);
const previewRoot = new THREE.Group();
scene.add(previewRoot);

function msg(value, type = '') {
  el.message.textContent = value;
  el.message.className = 'message' + (type ? ' ' + type : '');
}
function filesize(bytes) {
  return bytes < 1024 ? bytes + ' B' :
    bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' :
    (bytes / 1048576).toFixed(2) + ' MB';
}
function showQuality() {
  const n = Number(el.quality.value);
  el.qualityValue.textContent = ['Draft', 'Standard', 'Fine', 'Ultra'][n] +
    ' · ' + DEFLECTIONS[n].toFixed(n === 3 ? 3 : 2) + ' mm';
}
function updateButton() {
  el.convert.disabled = !file || busy;
  el.convertLabel.textContent = !file ? 'CHOOSE A MODEL' :
    busy ? 'PROCESSING MODEL…' :
    format === 'catpart' ? 'CONVERT USING TRANSLATOR' :
    triangleCount > 0 ? 'DOWNLOAD STL' : 'PROCESS MODEL';
}
function setBusy(value) { busy = value; updateButton(); }
function disposeGroup(group) {
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry?.dispose();
    if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
    else obj.material?.dispose();
  });
}
function resetGeometry() {
  previewRoot.remove(source);
  disposeGroup(source);
  source = new THREE.Group();
  nativeBlob = null;
  triangleCount = 0;
  el.placeholder.classList.remove('hidden');
  el.viewState.textContent = 'NO GEOMETRY LOADED';
  el.triCount.textContent = '— TRIANGLES';
  [el.width, el.height, el.depth].forEach((node) => node.textContent = '—');
  el.fit.disabled = true;
  el.wireframe.disabled = true;
  previewRoot.position.set(0, 0, 0);
}
function fit() {
  if (!triangleCount) return;
  const bounds = new THREE.Box3().setFromObject(previewRoot);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const maxSide = Math.max(size.x, size.y, size.z, 0.001);
  const distance = 1.65 * maxSide / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
  camera.near = Math.max(distance / 10000, 0.000001);
  camera.far = Math.max(distance * 10000, 10);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(1, .85, 1.2).normalize().multiplyScalar(distance));
  controls.update();
  grid.scale.setScalar(Math.max(maxSide / 10, 0.001));
  grid.position.y = -size.y / 2 - maxSide * 0.015;
}
function material() {
  return new THREE.MeshStandardMaterial({
    color: 0xc8d6c9, metalness: 0.28, roughness: 0.43,
    side: THREE.DoubleSide, wireframe
  });
}
function addGeometry(group, geometry, color) {
  const positions = geometry.attributes.position;
  if (!positions || positions.count < 3) return;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const m = material();
  if (color && color.length >= 3) m.color.setRGB(color[0], color[1], color[2]);
  group.add(new THREE.Mesh(geometry, m));
}
function preview(group, label = 'GEOMETRY READY') {
  const bounds = new THREE.Box3().setFromObject(group);
  if (bounds.isEmpty()) throw new Error('The model has no drawable geometry.');
  let count = 0;
  group.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
    if (!obj.material) obj.material = material();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.forEach((m) => { m.wireframe = wireframe; m.side = THREE.DoubleSide; });
    count += obj.geometry.index ? Math.floor(obj.geometry.index.count / 3) :
      Math.floor(obj.geometry.attributes.position.count / 3);
  });
  if (!count) throw new Error('The model produced no triangles. Refusing an empty STL.');
  resetGeometry();
  source = group;
  const center = bounds.getCenter(new THREE.Vector3());
  previewRoot.position.copy(center).multiplyScalar(-1);
  previewRoot.add(source);
  triangleCount = count;
  const size = bounds.getSize(new THREE.Vector3());
  el.width.textContent = size.x.toFixed(2) + ' mm';
  el.height.textContent = size.y.toFixed(2) + ' mm';
  el.depth.textContent = size.z.toFixed(2) + ' mm';
  el.triCount.textContent = count.toLocaleString() + ' TRIANGLES';
  el.viewState.textContent = label;
  el.placeholder.classList.add('hidden');
  el.fit.disabled = false;
  el.wireframe.disabled = false;
  fit();
}
function flattenNumbers(value) {
  if (!value) return [];
  const arr = Array.from(value);
  return (Array.isArray(arr[0]) || ArrayBuffer.isView(arr[0])) ?
    arr.flatMap((part) => Array.from(part)) : arr;
}
function cadToGroup(result) {
  if (!result?.success || !Array.isArray(result.meshes)) {
    throw new Error('The OpenCascade CAD reader could not interpret this file.');
  }
  const group = new THREE.Group();
  for (const mesh of result.meshes) {
    const coordinates = flattenNumbers(mesh.attributes?.position?.array);
    const indices = flattenNumbers(mesh.index?.array);
    if (coordinates.length < 9 || coordinates.length % 3 !== 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3));
    if (indices.length) geometry.setIndex(indices);
    const normals = flattenNumbers(mesh.attributes?.normal?.array);
    if (normals.length === coordinates.length) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }
    addGeometry(group, geometry, mesh.color);
  }
  return group;
}
async function openCascade() {
  if (!occtPromise) {
    occtPromise = new Promise((resolve, reject) => {
      if (typeof window.occtimportjs === 'function') {
        resolve(window.occtimportjs());
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js';
      script.onload = () => {
        if (typeof window.occtimportjs === 'function') resolve(window.occtimportjs());
        else reject(new Error('OpenCascade runtime did not initialize.'));
      };
      script.onerror = () => reject(new Error('Could not load the OpenCascade CAD kernel. Check the internet connection.'));
      document.head.appendChild(script);
    }).catch((error) => { occtPromise = null; throw error; });
  }
  return occtPromise;
}
function inspectCATIA(buffer) {
  if (buffer.byteLength < 64) throw new Error('Too small to be a valid CATIA V5 file.');
  const header = new TextDecoder('latin1').decode(buffer.slice(0, 8));
  if (header !== 'V5_CFV2\u0000') {
    throw new Error('The file is missing the CATIA V5 container signature.');
  }
  const dv = new DataView(buffer);
  const directoryOffset = dv.getUint32(8, false);
  const directoryLength = dv.getUint32(12, false);
  if (directoryOffset < 64 || directoryOffset + directoryLength > buffer.byteLength) {
    throw new Error('The CATIA container directory is incomplete or damaged.');
  }
  const text = new TextDecoder('latin1').decode(buffer.slice(0, Math.min(220000, buffer.byteLength)));
  const version = text.match(/V5R(\d+)SP(\d+)HF(\d+)/i);
  return version ?
    'V5 R' + version[1] + ' SP' + version[2] + ' HF' + version[3] :
    'CATIA V5 · UNKNOWN RELEASE';
}
async function choose(next) {
  if (!next) return;
  if (next.size > 250 * 1024 * 1024) {
    msg('The maximum file size is 250 MB.', 'error');
    return;
  }
  const ext = next.name.split('.').pop().toLowerCase();
  if (!FORMATS[ext]) {
    msg('Unsupported format. Choose CATPart, STEP, IGES, BREP, OBJ or STL.', 'error');
    return;
  }
  file = next;
  format = ext;
  resetGeometry();
  el.fileCard.classList.remove('hidden');
  el.fileName.textContent = file.name;
  el.fileDetails.textContent = filesize(file.size) + ' · Selected';
  el.badge.textContent = format.toUpperCase().slice(0, 4);
  el.status.textContent = 'FILE SELECTED';
  el.format.textContent = FORMATS[format];
  el.release.textContent = '—';
  updateButton();
  if (format === 'catpart') {
    try {
      const version = inspectCATIA(await file.arrayBuffer());
      el.release.textContent = version;
      el.status.textContent = 'NATIVE TRANSLATOR REQUIRED';
      el.viewState.textContent = 'CATIA GEOMETRY NOT DECODED';
      msg('CATIA file inspected (' + version +
        '). A native translator is needed for its geometry. Connect one below, then press Convert using translator.');
    } catch (error) {
      el.status.textContent = 'INVALID CATPART';
      msg(error.message, 'error');
    }
    return;
  }
  await processLocal();
}
async function processLocal() {
  if (!file) return;
  const activeFile = file;
  setBusy(true);
  el.status.textContent = 'READING LOCAL GEOMETRY';
  msg('Processing geometry locally in your browser. No model bytes are uploaded.');
  try {
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const bytes = await activeFile.arrayBuffer();
    let group;
    if (format === 'stl') {
      group = new THREE.Group();
      addGeometry(group, new STLLoader().parse(bytes));
    } else if (format === 'obj') {
      group = new OBJLoader().parse(new TextDecoder('utf-8').decode(bytes));
    } else {
      const cad = await openCascade();
      const params = {
        linearUnit: 'millimeter',
        linearDeflectionType: 'absolute_value',
        linearDeflection: DEFLECTIONS[Number(el.quality.value)],
        angularDeflection: 0.24
      };
      const data = new Uint8Array(bytes);
      const result = ['step', 'stp'].includes(format) ? cad.ReadStepFile(data, params) :
        ['iges', 'igs'].includes(format) ? cad.ReadIgesFile(data, params) :
        cad.ReadBrepFile(data, params);
      group = cadToGroup(result);
    }
    if (file !== activeFile) return;
    preview(group, 'LOCAL MESH · READY FOR EXPORT');
    el.status.textContent = 'READY TO EXPORT';
    el.fileDetails.textContent = filesize(file.size) + ' · ' + triangleCount.toLocaleString() + ' triangles';
    msg('Valid geometry ready. Click Download STL to export its original coordinates.', 'good');
  } catch (error) {
    if (file !== activeFile) return;
    resetGeometry();
    el.status.textContent = 'PROCESSING FAILED';
    msg(error.message || 'Could not read the geometry.', 'error');
  } finally { setBusy(false); }
}
async function convertNative() {
  const endpoint = el.endpoint.value.trim();
  if (!endpoint) {
    msg('CATPart conversion requires a licensed converter API. Enter its URL in the field below.', 'error');
    el.endpoint.focus();
    return;
  }
  if (!/^https:\/\//i.test(endpoint) &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(endpoint)) {
    msg('Use HTTPS or local HTTP on localhost for development.', 'error');
    return;
  }
  try { inspectCATIA(await file.arrayBuffer()); }
  catch (error) { msg(error.message, 'error'); return; }
  setBusy(true);
  el.status.textContent = 'UPLOADING TO TRANSLATOR';
  msg('Sending your CATPart to the configured converter. Check its privacy and security policy before using it.');
  try {
    const form = new FormData();
    form.append('file', file, file.name);
    const response = await fetch(endpoint, { method: 'POST', body: form, credentials: 'omit' });
    if (!response.ok) {
      let detail = '';
      try {
        const data = await response.json();
        detail = data.detail || data.error || '';
      } catch (_) {}
      throw new Error('Translator returned HTTP ' + response.status + (detail ? ': ' + detail : ''));
    }
    const blob = await response.blob();
    if (blob.size < 84) throw new Error('Translator returned an empty or invalid STL.');
    const geometry = new STLLoader().parse(await blob.arrayBuffer());
    const group = new THREE.Group();
    addGeometry(group, geometry);
    preview(group, 'TRANSLATED CATIA MODEL');
    nativeBlob = blob;
    el.status.textContent = 'STL VALIDATED';
    msg('Converted STL validated: ' + triangleCount.toLocaleString() + ' triangles.', 'good');
    const button = document.createElement('button');
    button.textContent = 'DOWNLOAD VALIDATED STL ↓';
    button.style.cssText = 'display:block;margin-top:10px;padding:10px 13px;background:#294b3c;border:1px solid #a1c8a9;color:#ddf5e3;font-size:11px;font-weight:bold';
    button.addEventListener('click', downloadSTL);
    el.message.append(button);
  } catch (error) {
    el.status.textContent = 'TRANSLATOR FAILED';
    msg(error.message || 'Native CATIA translation failed.', 'error');
  } finally { setBusy(false); }
}
function downloadSTL() {
  try {
    if (!file || !triangleCount) throw new Error('No validated geometry available for STL export.');
    source.updateMatrixWorld(true);
    const blob = nativeBlob || new Blob(
      [new STLExporter().parse(source, { binary: true })],
      { type: 'model/stl' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name.replace(/\.[^.]+$/, '') + '.stl';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    msg('STL downloaded: ' + filesize(blob.size) + ', ' + triangleCount.toLocaleString() + ' triangles.', 'good');
  } catch (error) { msg(error.message, 'error'); }
}
function clearFile() {
  file = null; format = null; el.input.value = '';
  el.fileCard.classList.add('hidden');
  el.status.textContent = 'AWAITING INPUT';
  el.format.textContent = '—';
  el.release.textContent = '—';
  resetGeometry();
  updateButton();
  msg('Files stay on your device unless you deliberately use a remote translator.');
}
el.drop.addEventListener('click', () => el.input.click());
el.drop.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault(); el.input.click();
  }
});
el.input.addEventListener('change', () => choose(el.input.files?.[0]));
['dragenter', 'dragover'].forEach((name) => el.drop.addEventListener(name, (event) => {
  event.preventDefault(); el.drop.classList.add('dragover');
}));
['dragleave', 'drop'].forEach((name) => el.drop.addEventListener(name, (event) => {
  event.preventDefault(); el.drop.classList.remove('dragover');
}));
el.drop.addEventListener('drop', (event) => choose(event.dataTransfer?.files?.[0]));
el.clear.addEventListener('click', clearFile);
el.quality.addEventListener('input', showQuality);
el.quality.addEventListener('change', () => {
  if (file && ['step', 'stp', 'iges', 'igs', 'brep', 'brp'].includes(format)) processLocal();
});
el.convert.addEventListener('click', () => {
  if (!file || busy) return;
  if (format === 'catpart') convertNative();
  else if (triangleCount) downloadSTL();
  else processLocal();
});
el.fit.addEventListener('click', fit);
el.wireframe.addEventListener('click', () => {
  wireframe = !wireframe;
  el.wireframe.classList.toggle('active', wireframe);
  source.traverse((obj) => {
    if (!obj.isMesh) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.forEach((m) => { if (m) m.wireframe = wireframe; });
  });
});
el.saveEndpoint.addEventListener('click', () => {
  const url = el.endpoint.value.trim();
  if (url && !/^https:\/\//i.test(url) &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)) {
    msg('Use an HTTPS URL or localhost for development.', 'error'); return;
  }
  try {
    localStorage.setItem('catpart-stl-endpoint', url);
    msg(url ? 'Translator URL saved in this browser. Your file will only be uploaded when you press Convert using translator.' : 'Translator URL cleared.', 'good');
  } catch (_) { msg('The URL is set for this tab, but browser storage is blocked.'); }
});
const resize = new ResizeObserver(() => {
  const width = el.viewport.clientWidth, height = el.viewport.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
});
resize.observe(el.viewport);
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
showQuality();
updateButton();
animate();
