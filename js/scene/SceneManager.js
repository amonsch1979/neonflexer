import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
    this.camera.position.set(1.5, 1.2, 1.5);
    this.camera.lookAt(0, 0, 0);

    // Controls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 50;
    this.controls.target.set(0, 0, 0);

    // Environment for PBR transmission
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment()).texture;
    this.scene.environment = envTexture;
    pmremGenerator.dispose();

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(3, 5, 2);
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xaaccff, 0.3);
    fillLight.position.set(-2, 3, -1);
    this.scene.add(fillLight);

    // Grid
    this._createGrid();

    // Single movable drawing plane for raycasting (invisible, 50m x 50m)
    this._drawPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    this._drawPlane.name = '__draw_plane';
    this.scene.add(this._drawPlane);

    // Current plane state
    this.currentPlane = 'XZ';   // 'XZ' | 'XY' | 'YZ'
    this._planeAnchor = new THREE.Vector3(0, 0, 0); // plane passes through here

    // Backward compat
    this.groundPlane = this._drawPlane;

    // Visible plane helper (tinted quad + grid)
    this._planeHelper = null;
    this._planeGrid = null;
    this._createPlaneHelper();

    // Apply initial plane
    this._applyPlaneOrientation();

    // Raycaster
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Resize
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._onResize();

    // Animation
    this._animate = this._animate.bind(this);
    this._animate();
  }

  _createGrid() {
    const mainGrid = new THREE.GridHelper(2, 20, 0x2a2a4e, 0x222244);
    mainGrid.name = '__grid_main';
    this.scene.add(mainGrid);

    const subGrid = new THREE.GridHelper(2, 200, 0x1a1a3e, 0x1a1a3e);
    subGrid.name = '__grid_sub';
    subGrid.position.y = -0.0001;
    this.scene.add(subGrid);

    // Axis indicators
    const axisLen = 0.3;
    const xAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.001, 0),
        new THREE.Vector3(axisLen, 0.001, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0xff4444 })
    );
    xAxis.name = '__axis_x';
    this.scene.add(xAxis);

    const yAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.001, 0),
        new THREE.Vector3(0, axisLen, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0x44ff44 })
    );
    yAxis.name = '__axis_y';
    this.scene.add(yAxis);

    const zAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.001, 0),
        new THREE.Vector3(0, 0.001, axisLen)
      ]),
      new THREE.LineBasicMaterial({ color: 0x4444ff })
    );
    zAxis.name = '__axis_z';
    this.scene.add(zAxis);
  }

  _createPlaneHelper() {
    // Tinted visible quad
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4488ff, transparent: true, opacity: 0.05,
      side: THREE.DoubleSide, depthWrite: false
    });
    this._planeHelper = new THREE.Mesh(geo, mat);
    this._planeHelper.name = '__plane_helper';
    this._planeHelper.visible = false; // hidden for XZ (ground grid already shows)
    this.scene.add(this._planeHelper);

    // Grid on the plane
    this._planeGrid = new THREE.GridHelper(2, 20, 0x2a4a6e, 0x22384e);
    this._planeGrid.name = '__plane_grid';
    this._planeGrid.visible = false;
    this.scene.add(this._planeGrid);
  }

  /**
   * Set the active drawing plane and anchor it at a point.
   * @param {'XZ'|'XY'|'YZ'} plane
   * @param {THREE.Vector3} [anchor] - point the plane passes through (default: origin or last anchor)
   */
  setDrawingPlane(plane, anchor) {
    this.currentPlane = plane;
    if (anchor) {
      this._planeAnchor.copy(anchor);
    }
    this._applyPlaneOrientation();
  }

  /**
   * Move the drawing plane to pass through a new anchor point.
   * Only moves the "fixed" axis. E.g. for XZ plane, moves Y position.
   */
  anchorPlaneAt(point) {
    if (!point) return;
    this._planeAnchor.copy(point);
    this._applyPlaneOrientation();
  }

  /** Reset plane anchor to origin */
  resetPlaneAnchor() {
    this._planeAnchor.set(0, 0, 0);
    this._applyPlaneOrientation();
  }

  _applyPlaneOrientation() {
    const a = this._planeAnchor;
    const dp = this._drawPlane;
    const helper = this._planeHelper;
    const grid = this._planeGrid;

    // Reset transforms
    dp.rotation.set(0, 0, 0);
    dp.position.copy(a);

    switch (this.currentPlane) {
      case 'XZ': // horizontal, normal = Y
        dp.rotation.x = -Math.PI / 2;
        dp.position.set(a.x, a.y, a.z);
        helper.rotation.set(-Math.PI / 2, 0, 0);
        helper.position.set(a.x, a.y, a.z);
        grid.rotation.set(0, 0, 0);
        grid.position.set(a.x, a.y, a.z);
        helper.material.color.setHex(0x44ff44);
        break;
      case 'XY': // vertical front, normal = Z
        dp.rotation.set(0, 0, 0);
        dp.position.set(a.x, a.y, a.z);
        helper.rotation.set(0, 0, 0);
        helper.position.set(a.x, a.y, a.z);
        grid.rotation.set(Math.PI / 2, 0, 0);
        grid.position.set(a.x, a.y, a.z);
        helper.material.color.setHex(0x4444ff);
        break;
      case 'YZ': // vertical side, normal = X
        dp.rotation.y = Math.PI / 2;
        dp.position.set(a.x, a.y, a.z);
        helper.rotation.set(0, Math.PI / 2, 0);
        helper.position.set(a.x, a.y, a.z);
        grid.rotation.set(0, 0, Math.PI / 2);
        grid.position.set(a.x, a.y, a.z);
        helper.material.color.setHex(0xff4444);
        break;
    }

    // Show helper for non-ground planes, or when anchor is off-origin
    const isDefault = this.currentPlane === 'XZ' && a.y === 0;
    helper.visible = !isDefault;
    grid.visible = !isDefault;
  }

  _onResize() {
    const container = this.canvas.parentElement;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    requestAnimationFrame(this._animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** Raycast mouse against the current drawing plane */
  raycastDrawingPlane(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObject(this._drawPlane);
    return hits.length > 0 ? hits[0].point.clone() : null;
  }

  /** Backward compat alias */
  raycastGround(clientX, clientY) {
    return this.raycastDrawingPlane(clientX, clientY);
  }

  /** Raycast against given objects */
  raycastObjects(clientX, clientY, objects) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  /** Snap point to grid (in meters) */
  snapToGrid(point, gridSize = 0.01) {
    return new THREE.Vector3(
      Math.round(point.x / gridSize) * gridSize,
      Math.round(point.y / gridSize) * gridSize,
      Math.round(point.z / gridSize) * gridSize
    );
  }

  /**
   * Lock the off-plane axis of a point to the plane anchor value.
   * This ensures points stay on the drawing plane surface.
   */
  constrainToPlane(point) {
    const a = this._planeAnchor;
    switch (this.currentPlane) {
      case 'XZ': point.y = a.y; break;
      case 'XY': point.z = a.z; break;
      case 'YZ': point.x = a.x; break;
    }
    return point;
  }

  /**
   * Format a point's coordinates for the status bar.
   * Shows all 3 axes, highlighting the active drawing plane.
   */
  formatCoords(point) {
    const x = (point.x * 1000).toFixed(0);
    const y = (point.y * 1000).toFixed(0);
    const z = (point.z * 1000).toFixed(0);
    return `X:${x}  Y:${y}  Z:${z}mm  [${this.currentPlane}]`;
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
