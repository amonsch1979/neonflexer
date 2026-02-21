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
    this._fullPixelRatio = Math.min(window.devicePixelRatio, 2);
    this._lowPixelRatio = Math.max(window.devicePixelRatio * 0.5, 0.5); // aggressive reduction during interaction
    this.renderer.setPixelRatio(this._fullPixelRatio);
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
    this.controls.zoomToCursor = true;
    this.controls.target.set(0, 0, 0);
    // Middle mouse = orbit, right = pan (left freed for drawing tools)
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.PAN,
    };

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

    // Ground logo (visible in top-down view)
    this._createGroundLogo();

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

    // Mathematical plane for reliable raycasting (no mesh edge cases)
    this._mathPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Backward compat
    this.groundPlane = this._drawPlane;

    // Visible plane helper (tinted quad + grid)
    this._planeHelper = null;
    this._planeGrid = null;
    this._createPlaneHelper();

    // Apply initial plane
    this._applyPlaneOrientation();

    // Interaction performance: reduce pixel ratio during orbit
    this._interacting = false;
    this._interactionTimer = null;
    this._needsRender = true;        // dirty flag for render-on-demand

    this.controls.addEventListener('start', () => {
      if (!this._interacting) {
        this._interacting = true;
        this.renderer.setPixelRatio(this._lowPixelRatio);
      }
      clearTimeout(this._interactionTimer);
      this._needsRender = true;
    });
    this.controls.addEventListener('end', () => {
      clearTimeout(this._interactionTimer);
      this._interactionTimer = setTimeout(() => {
        this._interacting = false;
        this.renderer.setPixelRatio(this._fullPixelRatio);
        this._needsRender = true;
      }, 200);
    });
    this.controls.addEventListener('change', () => {
      this._needsRender = true;
    });

    // Camera animation state
    this._cameraAnimating = false;
    this._cameraAnimStart = 0;
    this._cameraAnimDuration = 400;
    this._cameraAnimFromPos = new THREE.Vector3();
    this._cameraAnimToPos = new THREE.Vector3();
    this._cameraAnimFromTarget = new THREE.Vector3();
    this._cameraAnimToTarget = new THREE.Vector3();

    // Any pointer activity on the canvas requests a render
    // (covers drawing modes, tool previews, hover effects)
    canvas.addEventListener('pointermove', () => { this._needsRender = true; });
    canvas.addEventListener('pointerdown', () => { this._needsRender = true; });
    canvas.addEventListener('pointerup', () => { this._needsRender = true; });

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
    // Grid container group (so we can remove & rebuild)
    this._gridGroup = new THREE.Group();
    this._gridGroup.name = '__grid_group';
    this.scene.add(this._gridGroup);

    // Default: 2m grid
    this.gridSizeM = 2;
    this._buildGrid(this.gridSizeM);
  }

  _createGroundLogo() {
    const loader = new THREE.TextureLoader();
    loader.load('byfeignasse_logo_1.png', (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      const aspect = texture.image.width / texture.image.height;
      const logoSize = this.gridSizeM * 0.8;
      const geo = new THREE.PlaneGeometry(logoSize * aspect, logoSize);
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      this._groundLogo = new THREE.Mesh(geo, mat);
      this._groundLogo.rotation.x = -Math.PI / 2;
      this._groundLogo.position.y = 0.001;
      this._groundLogo.name = '__ground_logo';
      this._groundLogo.renderOrder = -1;
      this._groundLogoAspect = aspect;
      this.scene.add(this._groundLogo);
    }, undefined, () => {
      console.warn('Ground logo not found — skipping');
    });
  }

  _resizeGroundLogo(sizeM) {
    if (!this._groundLogo) return;
    const logoSize = sizeM * 0.8;
    const aspect = this._groundLogoAspect || 1;
    this._groundLogo.geometry.dispose();
    this._groundLogo.geometry = new THREE.PlaneGeometry(logoSize * aspect, logoSize);
  }

  _buildGrid(sizeM) {
    // Clear old grid objects
    this._gridGroup.traverse(child => {
      if (child.isMesh || child.isLine || child.isLineSegments) {
        child.geometry?.dispose();
        child.material?.dispose();
      }
      if (child.isSprite) {
        child.material?.map?.dispose();
        child.material?.dispose();
      }
    });
    this._gridGroup.clear();

    // Main grid: 1m divisions
    const mainDivisions = sizeM;
    const mainGrid = new THREE.GridHelper(sizeM, mainDivisions, 0x3a3a5e, 0x2a2a4e);
    mainGrid.name = '__grid_main';
    this._gridGroup.add(mainGrid);

    // Sub-grid: 100mm divisions
    const subDivisions = sizeM * 10;
    const subGrid = new THREE.GridHelper(sizeM, subDivisions, 0x1e1e3e, 0x1a1a3a);
    subGrid.name = '__grid_sub';
    subGrid.position.y = -0.0001;
    this._gridGroup.add(subGrid);

    // Axis arrows (full grid length, thick cylinder + cone tip)
    const axisLen = sizeM / 2;
    const axisRadius = sizeM * 0.003;    // shaft thickness scales with grid
    const arrowLen = sizeM * 0.03;       // arrow cone length
    const arrowRadius = sizeM * 0.008;   // arrow cone radius

    this._addAxisArrow(axisLen, arrowLen, axisRadius, arrowRadius, 0xff4444,
      new THREE.Vector3(1, 0, 0), new THREE.Euler(0, 0, -Math.PI / 2)); // X
    this._addAxisArrow(axisLen, arrowLen, axisRadius, arrowRadius, 0x44ff44,
      new THREE.Vector3(0, 1, 0), new THREE.Euler(0, 0, 0)); // Y
    this._addAxisArrow(axisLen, arrowLen, axisRadius, arrowRadius, 0x4444ff,
      new THREE.Vector3(0, 0, 1), new THREE.Euler(Math.PI / 2, 0, 0)); // Z

    // Axis labels at the end of each axis (bigger)
    const labelOffset = axisLen + sizeM * 0.04;
    this._addAxisLabel('X', labelOffset, 0.05, 0, 0xff4444, sizeM * 0.06);
    this._addAxisLabel('Y', 0.05, labelOffset, 0, 0x44ff44, sizeM * 0.06);
    this._addAxisLabel('Z', 0, 0.05, labelOffset, 0x4444ff, sizeM * 0.06);

    // Edge dimension labels (every meter along X, Y and Z)
    for (let i = 1; i <= Math.floor(sizeM / 2); i++) {
      this._addAxisLabel(`${i}m`, i, 0.01, -0.03, 0x556677);
      this._addAxisLabel(`${i}m`, -0.05, 0.01, i, 0x556677);
      this._addAxisLabel(`${i}m`, -0.05, i, 0, 0x556677);
    }
  }

  /**
   * Add a thick axis shaft (cylinder) + arrow cone at the tip.
   * @param {number} length - shaft length
   * @param {number} arrowLen - cone length
   * @param {number} shaftR - shaft radius
   * @param {number} arrowR - cone radius
   * @param {number} color - hex color
   * @param {THREE.Vector3} dir - axis direction (unit vector)
   * @param {THREE.Euler} rotation - rotation to point cylinder along axis
   */
  _addAxisArrow(length, arrowLen, shaftR, arrowR, color, dir, rotation) {
    const mat = new THREE.MeshBasicMaterial({ color });

    // Shaft (cylinder centered on Y, so we rotate it)
    const shaftGeo = new THREE.CylinderGeometry(shaftR, shaftR, length, 8);
    const shaft = new THREE.Mesh(shaftGeo, mat);
    // Position shaft center along axis direction
    shaft.position.copy(dir.clone().multiplyScalar(length / 2));
    shaft.rotation.copy(rotation);
    shaft.name = '__axis_shaft';
    this._gridGroup.add(shaft);

    // Arrow cone at the tip
    const coneGeo = new THREE.ConeGeometry(arrowR, arrowLen, 12);
    const cone = new THREE.Mesh(coneGeo, mat);
    cone.position.copy(dir.clone().multiplyScalar(length + arrowLen / 2));
    cone.rotation.copy(rotation);
    cone.name = '__axis_arrow';
    this._gridGroup.add(cone);
  }

  _addAxisLabel(text, x, y, z, color, spriteSize) {
    const canvas = document.createElement('canvas');
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(x, y, z);
    const s = spriteSize || 0.08;
    sprite.scale.set(s, s, 1);
    sprite.name = '__label';
    this._gridGroup.add(sprite);
  }

  /**
   * Set grid workspace size in meters. Rebuilds the grid.
   * @param {number} sizeM - total size (e.g., 2, 5, 10, 20)
   */
  setGridSize(sizeM) {
    // Preserve camera position and target across grid rebuild
    const savedPos = this.camera.position.clone();
    const savedTarget = this.controls.target.clone();

    this.gridSizeM = sizeM;
    this._buildGrid(sizeM);
    // Also resize the draw plane
    this._drawPlane.geometry.dispose();
    this._drawPlane.geometry = new THREE.PlaneGeometry(sizeM * 2, sizeM * 2);
    // Resize plane helper
    this._planeHelper.geometry.dispose();
    this._planeHelper.geometry = new THREE.PlaneGeometry(sizeM, sizeM);
    // Rebuild plane grid at new size
    this.scene.remove(this._planeGrid);
    this._planeGrid.geometry.dispose();
    this._planeGrid.material.dispose();
    this._planeGrid = new THREE.GridHelper(sizeM, sizeM * 10, 0x2a4a6e, 0x22384e);
    this._planeGrid.name = '__plane_grid';
    this._planeGrid.visible = false;
    this.scene.add(this._planeGrid);
    // Resize ground logo
    this._resizeGroundLogo(sizeM);
    this._applyPlaneOrientation();

    // Scale camera limits to match grid size
    this.controls.maxDistance = Math.max(50, sizeM * 2);
    this.camera.far = Math.max(100, sizeM * 4);
    this.camera.updateProjectionMatrix();

    // Restore exact camera position and target
    this.camera.position.copy(savedPos);
    this.controls.target.copy(savedTarget);
    this.controls.update();
    this._needsRender = true;
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

    // Update mathematical plane for raycasting
    const normal = new THREE.Vector3();
    switch (this.currentPlane) {
      case 'XZ': normal.set(0, 1, 0); break;
      case 'XY': normal.set(0, 0, 1); break;
      case 'YZ': normal.set(1, 0, 0); break;
    }
    this._mathPlane.setFromNormalAndCoplanarPoint(normal, a);

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
    this._needsRender = true;
  }

  _animate() {
    requestAnimationFrame(this._animate);

    // Camera animation
    if (this._cameraAnimating) {
      const elapsed = performance.now() - this._cameraAnimStart;
      let t = Math.min(elapsed / this._cameraAnimDuration, 1);
      // Ease-out cubic: 1 - (1-t)^3
      t = 1 - Math.pow(1 - t, 3);

      this.camera.position.lerpVectors(this._cameraAnimFromPos, this._cameraAnimToPos, t);
      this.controls.target.lerpVectors(this._cameraAnimFromTarget, this._cameraAnimToTarget, t);

      if (t >= 1) {
        this._cameraAnimating = false;
        this.controls.enabled = true;
      }
      this._needsRender = true;
    }

    // controls.update() handles damping and fires 'change' event
    // which sets _needsRender via the event listener
    this.controls.update();

    if (this._needsRender) {
      this.renderer.render(this.scene, this.camera);
      this._needsRender = false;
    }
  }

  /** Mark the scene as needing a re-render (call after any visual change). */
  requestRender() {
    this._needsRender = true;
  }

  /**
   * Smoothly animate camera to a new position and target.
   * @param {THREE.Vector3} position - target camera position
   * @param {THREE.Vector3} target - target orbit target
   * @param {number} duration - animation duration in ms (default 400)
   */
  animateCameraTo(position, target, duration = 400) {
    this._cameraAnimFromPos.copy(this.camera.position);
    this._cameraAnimToPos.copy(position);
    this._cameraAnimFromTarget.copy(this.controls.target);
    this._cameraAnimToTarget.copy(target);
    this._cameraAnimDuration = duration;
    this._cameraAnimStart = performance.now();
    this._cameraAnimating = true;
    this.controls.enabled = false;
  }

  /**
   * Set camera to a fixed orthographic-style view.
   * @param {'top'|'bottom'|'front'|'back'|'left'|'right'|'perspective'} viewName
   * @param {boolean} animate - whether to animate (default true)
   */
  setCameraView(viewName, animate = true) {
    const target = this.controls.target.clone();
    const dist = this.camera.position.distanceTo(target);
    let newPos;

    switch (viewName) {
      case 'top':
        newPos = new THREE.Vector3(target.x, target.y + dist, target.z + 0.001);
        break;
      case 'bottom':
        newPos = new THREE.Vector3(target.x, target.y - dist, target.z + 0.001);
        break;
      case 'front':
        newPos = new THREE.Vector3(target.x, target.y, target.z + dist);
        break;
      case 'back':
        newPos = new THREE.Vector3(target.x, target.y, target.z - dist);
        break;
      case 'right':
        newPos = new THREE.Vector3(target.x + dist, target.y, target.z);
        break;
      case 'left':
        newPos = new THREE.Vector3(target.x - dist, target.y, target.z);
        break;
      case 'perspective':
      default:
        newPos = new THREE.Vector3(1.5, 1.2, 1.5);
        target.set(0, 0, 0);
        break;
    }

    if (animate) {
      this.animateCameraTo(newPos, target);
    } else {
      this.camera.position.copy(newPos);
      this.controls.target.copy(target);
      this.camera.lookAt(target);
    }
  }

  /**
   * Focus camera on a 3D object so it fills ~70% of the viewport.
   * @param {THREE.Object3D} object3D
   */
  focusOnObject(object3D) {
    const box = new THREE.Box3().setFromObject(object3D);
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    // Calculate distance needed for ~70% viewport fill
    const fov = this.camera.fov * (Math.PI / 180);
    const fitDist = (maxDim / 2) / Math.tan(fov / 2) * 1.4;

    // Keep the current camera direction
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const newPos = center.clone().add(dir.multiplyScalar(Math.max(fitDist, 0.5)));

    this.animateCameraTo(newPos, center);
  }

  /**
   * Focus on an object with auto-detected best camera view.
   * Uses PCA on vertex positions to find the model's true flat plane,
   * so rotated/tilted models are shown correctly planar.
   * Falls back to AABB analysis for non-flat objects.
   * @param {THREE.Object3D} object3D
   * @returns {'top'|'front'|'right'|null} the view that was chosen
   */
  focusOnObjectWithAutoView(object3D) {
    const box = new THREE.Box3().setFromObject(object3D);
    if (box.isEmpty()) return null;

    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    // Calculate distance for ~70% viewport fill
    const fov = this.camera.fov * (Math.PI / 180);
    const fitDist = (maxDim / 2) / Math.tan(fov / 2) * 1.4;
    const dist = Math.max(fitDist, 0.5);

    // Try PCA to find the model's true flat direction (handles rotated models)
    const flatNormal = this._computeFlatNormal(object3D, center);

    let viewName;
    let newPos;

    if (flatNormal) {
      // PCA found the flat direction — determine closest standard view
      const ax = Math.abs(flatNormal.x);
      const ay = Math.abs(flatNormal.y);
      const az = Math.abs(flatNormal.z);

      if (ay >= ax && ay >= az) {
        viewName = 'top';
      } else if (az >= ax && az >= ay) {
        viewName = 'front';
      } else {
        viewName = 'right';
      }
    } else {
      // Fallback: AABB-based approach for non-flat objects
      if (size.y <= size.x && size.y <= size.z) {
        viewName = 'top';
      } else if (size.z <= size.x && size.z <= size.y) {
        viewName = 'front';
      } else {
        viewName = 'right';
      }
    }

    // Use clean axis-aligned camera positions for predictable views
    switch (viewName) {
      case 'top':
        newPos = new THREE.Vector3(center.x, center.y + dist, center.z + 0.001);
        break;
      case 'front':
        newPos = new THREE.Vector3(center.x, center.y, center.z + dist);
        break;
      case 'right':
        newPos = new THREE.Vector3(center.x + dist, center.y, center.z);
        break;
    }

    this.animateCameraTo(newPos, center);
    return viewName;
  }

  /**
   * Compute the normal of the model's flattest plane using PCA.
   * Samples world-space vertices, computes the covariance matrix,
   * and finds the eigenvector with the smallest eigenvalue (= thin axis).
   * Returns null if model isn't clearly flat or has too few vertices.
   * @param {THREE.Object3D} object3D
   * @param {THREE.Vector3} center - world-space center
   * @returns {THREE.Vector3|null}
   */
  _computeFlatNormal(object3D, center) {
    // Sample world-space vertex positions (centered on centroid)
    const sx = [], sy = [], sz = [];
    const _v = new THREE.Vector3();

    object3D.traverse(child => {
      if (!child.isMesh || !child.geometry) return;
      child.updateWorldMatrix(true, false);
      const pos = child.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 500));
      for (let i = 0; i < pos.count; i += step) {
        _v.fromBufferAttribute(pos, i);
        _v.applyMatrix4(child.matrixWorld);
        sx.push(_v.x - center.x);
        sy.push(_v.y - center.y);
        sz.push(_v.z - center.z);
      }
    });

    const n = sx.length;
    if (n < 10) return null;

    // Compute 3x3 covariance matrix (symmetric)
    let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
    for (let i = 0; i < n; i++) {
      cxx += sx[i] * sx[i]; cxy += sx[i] * sy[i]; cxz += sx[i] * sz[i];
      cyy += sy[i] * sy[i]; cyz += sy[i] * sz[i]; czz += sz[i] * sz[i];
    }
    cxx /= n; cxy /= n; cxz /= n; cyy /= n; cyz /= n; czz /= n;

    // Matrix-vector multiply helper for covariance matrix
    const mulCov = (vx, vy, vz) => [
      cxx * vx + cxy * vy + cxz * vz,
      cxy * vx + cyy * vy + cyz * vz,
      cxz * vx + cyz * vy + czz * vz
    ];

    // Power iteration: find largest eigenvector (e1)
    let e1x = 1, e1y = 0.1, e1z = 0.1; // slight offset avoids axis-lock
    for (let iter = 0; iter < 40; iter++) {
      const [rx, ry, rz] = mulCov(e1x, e1y, e1z);
      const len = Math.sqrt(rx * rx + ry * ry + rz * rz);
      if (len < 1e-12) break;
      e1x = rx / len; e1y = ry / len; e1z = rz / len;
    }
    const r1 = mulCov(e1x, e1y, e1z);
    const lambda1 = e1x * r1[0] + e1y * r1[1] + e1z * r1[2];

    if (lambda1 < 1e-10) return null;

    // Deflate: C' = C - lambda1 * e1 * e1^T
    const dxx = cxx - lambda1 * e1x * e1x;
    const dxy = cxy - lambda1 * e1x * e1y;
    const dxz = cxz - lambda1 * e1x * e1z;
    const dyy = cyy - lambda1 * e1y * e1y;
    const dyz = cyz - lambda1 * e1y * e1z;
    const dzz = czz - lambda1 * e1z * e1z;

    const mulDeflated = (vx, vy, vz) => [
      dxx * vx + dxy * vy + dxz * vz,
      dxy * vx + dyy * vy + dyz * vz,
      dxz * vx + dyz * vy + dzz * vz
    ];

    // Power iteration on deflated matrix for second eigenvector (e2)
    let e2x = 0, e2y = 1, e2z = 0.1;
    // Ensure not parallel to e1
    if (Math.abs(e1x * e2x + e1y * e2y + e1z * e2z) > 0.9) {
      e2x = 0; e2y = 0.1; e2z = 1;
    }
    for (let iter = 0; iter < 40; iter++) {
      const [rx, ry, rz] = mulDeflated(e2x, e2y, e2z);
      const len = Math.sqrt(rx * rx + ry * ry + rz * rz);
      if (len < 1e-12) break;
      e2x = rx / len; e2y = ry / len; e2z = rz / len;
    }

    // Smallest eigenvector = cross product of the two largest
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nLen < 1e-10) return null;
    nx /= nLen; ny /= nLen; nz /= nLen;

    // Compute smallest eigenvalue to verify model is actually flat
    const rn = mulCov(nx, ny, nz);
    const lambdaMin = nx * rn[0] + ny * rn[1] + nz * rn[2];

    // If smallest eigenvalue > 20% of largest, model isn't flat — use AABB fallback
    if (lambdaMin / lambda1 > 0.2) return null;

    // Choose sign: prefer direction where the dominant component is positive
    // This gives natural top/front/right camera orientations
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    if (ay >= ax && ay >= az) {
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    } else if (az >= ax && az >= ay) {
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    } else {
      if (nx < 0) { nx = -nx; ny = -ny; nz = -nz; }
    }

    return new THREE.Vector3(nx, ny, nz);
  }

  /**
   * Focus camera on all scene content (zoom extents).
   */
  focusAll() {
    const box = new THREE.Box3();
    this.scene.traverse(child => {
      if (!child.isMesh && !child.isLine) return;
      // Skip internal objects
      if (child.name && child.name.startsWith('__')) return;
      // Skip invisible
      let visible = true;
      let obj = child;
      while (obj) {
        if (!obj.visible) { visible = false; break; }
        obj = obj.parent;
      }
      if (!visible) return;
      box.expandByObject(child);
    });

    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    const fov = this.camera.fov * (Math.PI / 180);
    const fitDist = (maxDim / 2) / Math.tan(fov / 2) * 1.5;

    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const newPos = center.clone().add(dir.multiplyScalar(Math.max(fitDist, 0.5)));

    this.animateCameraTo(newPos, center);
  }

  /** Raycast mouse against the current drawing plane.
   *  Uses mathematical plane intersection (not mesh raycast) for reliability —
   *  no edge cases with camera angle, scene objects, or mesh bounds. */
  raycastDrawingPlane(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const target = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this._mathPlane, target) ? target : null;
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
   * Clamp a point so it stays within the grid boundaries.
   * Grid extends from -gridSizeM/2 to +gridSizeM/2 on each axis.
   */
  clampToGrid(point) {
    const half = this.gridSizeM / 2;
    point.x = Math.max(-half, Math.min(half, point.x));
    point.y = Math.max(-half, Math.min(half, point.y));
    point.z = Math.max(-half, Math.min(half, point.z));
    return point;
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
