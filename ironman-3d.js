// ironman-3d.js - WebGL Procedural Iron Man Mark Suit Model Renderer
class IronMan3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!this.gl) {
      console.error('WebGL not supported');
      return;
    }
    
    this.rotationX = 0.3;
    this.rotationY = 0.6;
    this.zoom = 1.0;
    this.arcPulse = 0.0;
    this.combatMode = 0.0;
    this.isDragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.autoRotate = true;
    
    this.currentView = 'full';
    this.targetRotX = 0.3;
    this.targetRotY = 0.6;

    this.init();
  }

  init() {
    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);

    const vsSource = `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec3 aColor;
      attribute float aEmissive;

      uniform mat4 uProjection;
      uniform mat4 uModelView;
      uniform mat3 uNormalMatrix;

      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vColor;
      varying float vEmissive;

      void main() {
        vec4 viewPos = uModelView * vec4(aPosition, 1.0);
        vPosition = viewPos.xyz;
        vNormal = normalize(uNormalMatrix * aNormal);
        vColor = aColor;
        vEmissive = aEmissive;
        gl_Position = uProjection * viewPos;
      }
    `;

    const fsSource = `
      precision mediump float;

      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vColor;
      varying float vEmissive;

      uniform vec3 uKeyLightDir;
      uniform vec3 uFillLightDir;
      uniform float uArcPulse;
      uniform float uCombatMode;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(-vPosition);

        if (vEmissive > 0.5) {
          vec3 glowColor = vColor;
          if (vEmissive > 1.5) {
            glowColor = mix(glowColor, vec3(1.0, 0.2, 0.1), abs(sin(uArcPulse * 5.0)));
          } else {
            glowColor *= (1.2 + uArcPulse * 0.9);
          }
          gl_FragColor = vec4(glowColor, 1.0);
          return;
        }

        vec3 L1 = normalize(uKeyLightDir);
        float diff1 = max(dot(N, L1), 0.0);
        vec3 H1 = normalize(L1 + V);
        float spec1 = pow(max(dot(N, H1), 0.0), 32.0);

        vec3 L2 = normalize(uFillLightDir);
        float diff2 = max(dot(N, L2), 0.0);
        vec3 H2 = normalize(L2 + V);
        float spec2 = pow(max(dot(N, H2), 0.0), 16.0);

        vec3 ambient = vec3(0.18, 0.18, 0.22) * vColor;
        vec3 diffuse = (diff1 * 0.85 + diff2 * 0.35) * vColor;

        bool isGold = (vColor.g > 0.6 && vColor.r > 0.8);
        vec3 specColor = isGold ? vec3(1.0, 0.88, 0.5) : vec3(0.9, 0.9, 0.95);
        vec3 specular = (spec1 * 0.75 + spec2 * 0.3) * specColor;

        float chestGlow = max(0.0, 1.0 - length(vPosition - vec3(0.0, 0.8, -3.0)) * 0.4);
        vec3 unibeamCast = vec3(0.1, 0.8, 1.0) * chestGlow * (0.3 + uArcPulse * 0.7);

        vec3 combatTint = vec3(uCombatMode * 0.15, 0.0, 0.0);

        vec3 finalColor = ambient + diffuse + specular + unibeamCast + combatTint;
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    const vs = this.createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.useProgram(this.program);

    this.attribs = {
      position: gl.getAttribLocation(this.program, 'aPosition'),
      normal: gl.getAttribLocation(this.program, 'aNormal'),
      color: gl.getAttribLocation(this.program, 'aColor'),
      emissive: gl.getAttribLocation(this.program, 'aEmissive')
    };

    this.uniforms = {
      projection: gl.getUniformLocation(this.program, 'uProjection'),
      modelView: gl.getUniformLocation(this.program, 'uModelView'),
      normalMatrix: gl.getUniformLocation(this.program, 'uNormalMatrix'),
      keyLightDir: gl.getUniformLocation(this.program, 'uKeyLightDir'),
      fillLightDir: gl.getUniformLocation(this.program, 'uFillLightDir'),
      arcPulse: gl.getUniformLocation(this.program, 'uArcPulse'),
      combatMode: gl.getUniformLocation(this.program, 'uCombatMode')
    };

    this.buildSuitGeometry();
    this.setupBuffers();
    this.initEvents();
    this.resize();
    this.animate();
  }

  createShader(gl, type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  buildSuitGeometry() {
    const positions = [];
    const normals = [];
    const colors = [];
    const emissives = [];
    const indices = [];
    let vertexOffset = 0;

    const red = [0.85, 0.08, 0.12];
    const gold = [0.92, 0.74, 0.11];
    const darkMetal = [0.25, 0.28, 0.35];
    const arcBlue = [0.1, 0.9, 1.0];
    const eyeWhite = [0.95, 0.98, 1.0];
    const laserRed = [1.0, 0.1, 0.1];

    const addQuad = (p1, p2, p3, p4, norm, col, emissive = 0) => {
      const idx = vertexOffset;
      positions.push(...p1, ...p2, ...p3, ...p4);
      for (let i = 0; i < 4; i++) {
        normals.push(...norm);
        colors.push(...col);
        emissives.push(emissive);
      }
      indices.push(idx, idx + 1, idx + 2, idx, idx + 2, idx + 3);
      vertexOffset += 4;
    };

    const addBox = (cx, cy, cz, wx, wy, wz, col, emissive = 0) => {
      const hx = wx * 0.5, hy = wy * 0.5, hz = wz * 0.5;
      // Front
      addQuad([cx-hx, cy-hy, cz+hz], [cx+hx, cy-hy, cz+hz], [cx+hx, cy+hy, cz+hz], [cx-hx, cy+hy, cz+hz], [0,0,1], col, emissive);
      // Back
      addQuad([cx+hx, cy-hy, cz-hz], [cx-hx, cy-hy, cz-hz], [cx-hx, cy+hy, cz-hz], [cx+hx, cy+hy, cz-hz], [0,0,-1], col, emissive);
      // Top
      addQuad([cx-hx, cy+hy, cz+hz], [cx+hx, cy+hy, cz+hz], [cx+hx, cy+hy, cz-hz], [cx-hx, cy+hy, cz-hz], [0,1,0], col, emissive);
      // Bottom
      addQuad([cx-hx, cy-hy, cz-hz], [cx+hx, cy-hy, cz-hz], [cx+hx, cy-hy, cz+hz], [cx-hx, cy-hy, cz+hz], [0,-1,0], col, emissive);
      // Right
      addQuad([cx+hx, cy-hy, cz+hz], [cx+hx, cy-hy, cz-hz], [cx+hx, cy+hy, cz-hz], [cx+hx, cy+hy, cz+hz], [1,0,0], col, emissive);
      // Left
      addQuad([cx-hx, cy-hy, cz-hz], [cx-hx, cy-hy, cz+hz], [cx-hx, cy+hy, cz+hz], [cx-hx, cy+hy, cz-hz], [-1,0,0], col, emissive);
    };

    // --- HELMET ---
    addBox(0, 1.8, 0, 0.7, 0.8, 0.75, red);
    addBox(0, 1.75, 0.38, 0.5, 0.5, 0.1, gold);
    // Eyes
    addBox(-0.16, 1.9, 0.44, 0.16, 0.07, 0.05, eyeWhite, 1.0);
    addBox(0.16, 1.9, 0.44, 0.16, 0.07, 0.05, eyeWhite, 1.0);

    // --- NECK & COLLAR ---
    addBox(0, 1.35, 0, 0.4, 0.25, 0.4, darkMetal);
    addBox(0, 1.3, 0.3, 0.6, 0.2, 0.25, gold);

    // --- CHEST & TORSO ---
    addBox(0, 0.8, 0, 1.1, 0.8, 0.6, red);
    addBox(0, 0.85, 0.28, 0.7, 0.6, 0.15, gold);
    // Arc Reactor
    addBox(0, 0.85, 0.37, 0.22, 0.22, 0.08, arcBlue, 1.0);

    // --- ABS & WAIST ---
    addBox(0, 0.25, 0, 0.9, 0.5, 0.5, red);
    addBox(0, 0.22, 0.26, 0.6, 0.4, 0.1, gold);
    addBox(0, -0.2, 0, 0.85, 0.35, 0.48, darkMetal);

    // --- SHOULDERS & ARMS ---
    // Left Arm
    addBox(-0.75, 1.1, 0, 0.38, 0.42, 0.38, gold); // Shoulder
    addBox(-0.75, 0.7, 0, 0.32, 0.45, 0.32, red);  // Bicep
    addBox(-0.75, 0.25, 0, 0.3, 0.4, 0.3, gold);   // Forearm
    addBox(-0.75, -0.2, 0, 0.28, 0.32, 0.28, darkMetal); // Hand

    // Right Arm
    addBox(0.75, 1.1, 0, 0.38, 0.42, 0.38, gold);
    addBox(0.75, 0.7, 0, 0.32, 0.45, 0.32, red);
    addBox(0.75, 0.25, 0, 0.3, 0.4, 0.3, gold);
    addBox(0.75, -0.2, 0, 0.28, 0.32, 0.28, darkMetal);

    // Repulsors / Weapon glow on hands
    addBox(-0.75, -0.38, 0, 0.18, 0.06, 0.18, arcBlue, 2.0);
    addBox(0.75, -0.38, 0, 0.18, 0.06, 0.18, arcBlue, 2.0);

    // --- LEGS ---
    // Left Leg
    addBox(-0.32, -0.7, 0, 0.38, 0.65, 0.4, red);
    addBox(-0.32, -0.7, 0.22, 0.28, 0.55, 0.1, gold);
    addBox(-0.32, -1.4, 0, 0.34, 0.65, 0.36, gold);
    addBox(-0.32, -2.0, 0, 0.32, 0.45, 0.34, darkMetal);

    // Right Leg
    addBox(0.32, -0.7, 0, 0.38, 0.65, 0.4, red);
    addBox(0.32, -0.7, 0.22, 0.28, 0.55, 0.1, gold);
    addBox(0.32, -1.4, 0, 0.34, 0.65, 0.36, gold);
    addBox(0.32, -2.0, 0, 0.32, 0.45, 0.34, darkMetal);

    this.vertexCount = indices.length;
    this.geometryData = {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      colors: new Float32Array(colors),
      emissives: new Float32Array(emissives),
      indices: new Uint16Array(indices)
    };
  }

  setupBuffers() {
    const gl = this.gl;
    const data = this.geometryData;

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);

    this.normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.normals, gl.STATIC_DRAW);

    this.colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.colors, gl.STATIC_DRAW);

    this.emissiveBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.emissiveBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.emissives, gl.STATIC_DRAW);

    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
  }

  initEvents() {
    const canvas = this.canvas;

    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.autoRotate = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.targetRotY += dx * 0.01;
      this.targetRotX += dy * 0.01;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.lastX = e.touches[0].clientX;
        this.lastY = e.touches[0].clientY;
        this.autoRotate = false;
      }
    }, {passive: true});

    window.addEventListener('touchmove', (e) => {
      if (!this.isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - this.lastX;
      const dy = e.touches[0].clientY - this.lastY;
      this.targetRotY += dx * 0.01;
      this.targetRotX += dy * 0.01;
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;
    }, {passive: true});

    window.addEventListener('touchend', () => {
      this.isDragging = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.5, Math.min(2.5, this.zoom + e.deltaY * 0.002));
    }, {passive: false});

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const displayWidth = this.canvas.clientWidth;
    const displayHeight = this.canvas.clientHeight;

    if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;
      this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
    }
  }

  setView(preset) {
    this.currentView = preset;
    this.autoRotate = false;
    switch(preset) {
      case 'front':
        this.targetRotX = 0.1;
        this.targetRotY = 0.0;
        this.zoom = 1.0;
        break;
      case 'action':
        this.targetRotX = 0.4;
        this.targetRotY = 0.8;
        this.zoom = 1.1;
        break;
      case 'weapons':
        this.targetRotX = 0.0;
        this.targetRotY = 1.57;
        this.zoom = 1.2;
        break;
      case 'flight':
        this.targetRotX = 1.2;
        this.targetRotY = 0.3;
        this.zoom = 0.9;
        break;
    }
  }

  toggleOrbit() {
    this.autoRotate = !this.autoRotate;
  }

  pulseUnibeam() {
    this.arcPulse = 3.0;
  }

  setCombatMode(active) {
    this.combatMode = active ? 1.0 : 0.0;
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.autoRotate) {
      this.targetRotY += 0.01;
    }

    // Smooth lerp rotation
    this.rotationX += (this.targetRotX - this.rotationX) * 0.1;
    this.rotationY += (this.targetRotY - this.rotationY) * 0.1;

    if (this.arcPulse > 0) {
      this.arcPulse -= 0.05;
    }

    const gl = this.gl;
    gl.clearColor(0.05, 0.07, 0.12, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projectionMatrix = mat4CreatePerspective(45 * Math.PI / 180, aspect, 0.1, 100.0);

    let modelViewMatrix = mat4CreateIdentity();
    mat4Translate(modelViewMatrix, [0, 0, -6.5 * this.zoom]);
    mat4RotateX(modelViewMatrix, this.rotationX);
    mat4RotateY(modelViewMatrix, this.rotationY);

    const normalMatrix = mat3CreateNormal(modelViewMatrix);

    gl.uniformMatrix4fv(this.uniforms.projection, false, projectionMatrix);
    gl.uniformMatrix4fv(this.uniforms.modelView, false, modelViewMatrix);
    gl.uniformMatrix3fv(this.uniforms.normalMatrix, false, normalMatrix);

    gl.uniform3f(this.uniforms.keyLightDir, 2.0, 4.0, 3.0);
    gl.uniform3f(this.uniforms.fillLightDir, -3.0, -1.0, -2.0);
    gl.uniform1f(this.uniforms.arcPulse, this.arcPulse);
    gl.uniform1f(this.uniforms.combatMode, this.combatMode);

    // Bind attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.attribs.position);
    gl.vertexAttribPointer(this.attribs.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.enableVertexAttribArray(this.attribs.normal);
    gl.vertexAttribPointer(this.attribs.normal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.enableVertexAttribArray(this.attribs.color);
    gl.vertexAttribPointer(this.attribs.color, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.emissiveBuffer);
    gl.enableVertexAttribArray(this.attribs.emissive);
    gl.vertexAttribPointer(this.attribs.emissive, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.vertexCount, gl.UNSIGNED_SHORT, 0);
  }
}

// Minimal Matrix Math Helpers for WebGL
function mat4CreateIdentity() {
  return new Float32Array([
    1,0,0,0,
    0,1,0,0,
    0,0,1,0,
    0,0,0,1
  ]);
}

function mat4CreatePerspective(fov, aspect, near, far) {
  const f = 1.0 / Math.tan(fov / 2);
  const rangeInv = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInv, -1,
    0, 0, near * far * rangeInv * 2, 0
  ]);
}

function mat4Translate(m, v) {
  m[12] = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
  m[13] = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
  m[14] = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
  m[15] = m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15];
}

function mat4RotateX(m, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const mv1 = m[1], mv5 = m[5], mv9 = m[9];
  const mv2 = m[2], mv6 = m[6], mv10 = m[10];

  m[1] = m[1]*c + m[2]*s;
  m[5] = m[5]*c + m[6]*s;
  m[9] = m[9]*c + m[10]*s;

  m[2] = m[2]*c - mv1*s;
  m[6] = m[6]*c - mv5*s;
  m[10] = m[10]*c - mv9*s;
}

function mat4RotateY(m, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const mv0 = m[0], mv4 = m[4], mv8 = m[8];
  const mv2 = m[2], mv6 = m[6], mv10 = m[10];

  m[0] = m[0]*c - m[2]*s;
  m[4] = m[4]*c - m[6]*s;
  m[8] = m[8]*c - m[10]*s;

  m[2] = m[2]*c + mv0*s;
  m[6] = m[6]*c + mv4*s;
  m[10] = m[10]*c + mv8*s;
}

function mat3CreateNormal(m) {
  return new Float32Array([
    m[0], m[1], m[2],
    m[4], m[5], m[6],
    m[8], m[9], m[10]
  ]);
}
