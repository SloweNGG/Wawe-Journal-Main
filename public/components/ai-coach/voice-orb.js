// ============================================================
// WAWE AI COACH - VOICE ORB (window.WwVoiceOrb)
// A glowing orb that reacts to the member's voice while they dictate to the coach (ai-coach.js loads this file on the
// first dictation). Plain WebGL port of the "Voice Powered Orb" React component (ogl): same shader, no dependency.
//
//   var orb = WwVoiceOrb.create(containerEl, { hue: 0, mic: true, glow: 1 })   -> null when WebGL is not available
//   orb.start()        draws continuously; with mic (default) also listens to the microphone (getUserMedia; levels
//                      only, nothing is recorded or sent)
//   orb.stop()         stops drawing (the last frame stays) and releases the microphone
//   orb.drawOnce()     one still frame (avatars that are not selected)
//   orb.setHue(deg)    colour shift in degrees (0 = violet / cyan)
//   glow               brightness (small avatars look better a bit brighter)
//   orb.destroy()      also frees the WebGL context (browsers allow only a few per page)
//   WwVoiceOrb.HUES    the hue of each AI coach's colour (kai, mira, rex, atlas, nova)
// The coach avatars (onboarding wizard, coach panel) are orbs with { mic: false } around the coach's face.
// prefers-reduced-motion: the orb stays still and only brightens with the voice.
// ============================================================
(function (global) {
  'use strict';
  if (global.WwVoiceOrb) return;

  var VERT = [
    'precision highp float;',
    'attribute vec2 position;',
    'attribute vec2 uv;',
    'varying vec2 vUv;',
    'void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform float iTime;',
    'uniform vec3 iResolution;',
    'uniform float hue;',
    'uniform float hover;',
    'uniform float rot;',
    'uniform float hoverIntensity;',
    'uniform float glow;',
    'varying vec2 vUv;',
    'vec3 rgb2yiq(vec3 c) { return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312))); }',
    'vec3 yiq2rgb(vec3 c) { return vec3(c.x + 0.956 * c.y + 0.621 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z); }',
    'vec3 adjustHue(vec3 color, float hueDeg) {',
    '  float h = hueDeg * 3.14159265 / 180.0; vec3 yiq = rgb2yiq(color); float cA = cos(h); float sA = sin(h);',
    '  float i = yiq.y * cA - yiq.z * sA; float q = yiq.y * sA + yiq.z * cA; yiq.y = i; yiq.z = q; return yiq2rgb(yiq);',
    '}',
    'vec3 hash33(vec3 p3) {',
    '  p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787)); p3 += dot(p3, p3.yxz + 19.19);',
    '  return -1.0 + 2.0 * fract(vec3(p3.x + p3.y, p3.x + p3.z, p3.y + p3.z) * p3.zyx);',
    '}',
    'float snoise3(vec3 p) {',
    '  const float K1 = 0.333333333; const float K2 = 0.166666667;',
    '  vec3 i = floor(p + (p.x + p.y + p.z) * K1); vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);',
    '  vec3 e = step(vec3(0.0), d0 - d0.yzx); vec3 i1 = e * (1.0 - e.zxy); vec3 i2 = 1.0 - e.zxy * (1.0 - e);',
    '  vec3 d1 = d0 - (i1 - K2); vec3 d2 = d0 - (i2 - K1); vec3 d3 = d0 - 0.5;',
    '  vec4 h = max(0.6 - vec4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0);',
    '  vec4 n = h * h * h * h * vec4(dot(d0, hash33(i)), dot(d1, hash33(i + i1)), dot(d2, hash33(i + i2)), dot(d3, hash33(i + 1.0)));',
    '  return dot(vec4(31.316), n);',
    '}',
    'vec4 extractAlpha(vec3 c) { float a = max(max(c.r, c.g), c.b); return vec4(c.rgb / (a + 1e-5), a); }',
    'const vec3 baseColor1 = vec3(0.611765, 0.262745, 0.996078);',
    'const vec3 baseColor2 = vec3(0.298039, 0.760784, 0.913725);',
    'const vec3 baseColor3 = vec3(0.062745, 0.078431, 0.600000);',
    'const float innerRadius = 0.6;',
    'const float noiseScale = 0.65;',
    'float light1(float intensity, float attenuation, float dist) { return intensity / (1.0 + dist * attenuation); }',
    'float light2(float intensity, float attenuation, float dist) { return intensity / (1.0 + dist * dist * attenuation); }',
    'vec4 draw(vec2 uv) {',
    '  vec3 color1 = adjustHue(baseColor1, hue); vec3 color2 = adjustHue(baseColor2, hue); vec3 color3 = adjustHue(baseColor3, hue);',
    '  float ang = atan(uv.y, uv.x); float len = length(uv); float invLen = len > 0.0 ? 1.0 / len : 0.0;',
    '  float n0 = snoise3(vec3(uv * noiseScale, iTime * 0.5)) * 0.5 + 0.5;',
    '  float r0 = mix(mix(innerRadius, 1.0, 0.4), mix(innerRadius, 1.0, 0.6), n0);',
    '  float d0 = distance(uv, (r0 * invLen) * uv);',
    '  float v0 = light1(1.0, 10.0, d0); v0 *= smoothstep(r0 * 1.05, r0, len);',
    '  float cl = cos(ang + iTime * 2.0) * 0.5 + 0.5;',
    '  float a = iTime * -1.0; vec2 pos = vec2(cos(a), sin(a)) * r0; float d = distance(uv, pos);',
    '  float v1 = light2(1.5, 5.0, d); v1 *= light1(1.0, 50.0, d0);',
    '  float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);',
    '  float v3 = smoothstep(innerRadius, mix(innerRadius, 1.0, 0.5), len);',
    '  vec3 col = mix(color1, color2, cl); col = mix(color3, col, v0); col = (col + v1) * v2 * v3;',
    '  col = clamp(col * glow, 0.0, 1.0);',
    '  return extractAlpha(col);',
    '}',
    'vec4 mainImage(vec2 fragCoord) {',
    '  vec2 center = iResolution.xy * 0.5; float size = min(iResolution.x, iResolution.y);',
    '  vec2 uv = (fragCoord - center) / size * 2.0;',
    '  float s = sin(rot); float c = cos(rot); uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);',
    '  uv.x += hover * hoverIntensity * 0.1 * sin(uv.y * 10.0 + iTime);',
    '  uv.y += hover * hoverIntensity * 0.1 * sin(uv.x * 10.0 + iTime);',
    '  return draw(uv);',
    '}',
    'void main() { vec4 col = mainImage(vUv * iResolution.xy); gl_FragColor = vec4(col.rgb * col.a, col.a); }'
  ].join('\n');

  // measured on screen against the coach colours (#7c6dfa, #e2559b, #e8902a, #3d8bfd, #1fb57f)
  var HUES = { kai: 0, mira: 240, rex: 180, atlas: 330, nova: 75 };
  var SENSITIVITY = 1.5, MAX_ROT = 1.2, MAX_HOVER = 0.8, BASE_ROT = 0.3;

  function reducedMotion() {
    try { return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
    return sh;
  }

  function create(container, opts) {
    opts = opts || {};
    var canvas = document.createElement('canvas');
    canvas.className = 'ww-voice-orb-canvas';
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    var gl = null;
    try { gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true }) || canvas.getContext('experimental-webgl'); } catch (e) { gl = null; }
    if (!gl) return null;
    var vs = compile(gl, gl.VERTEX_SHADER, VERT), fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    // one triangle covering the canvas (like ogl's Triangle)
    function attr(name, data) {
      var buf = gl.createBuffer(), loc = gl.getAttribLocation(prog, name);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    attr('position', [-1, -1, 3, -1, -1, 3]);
    attr('uv', [0, 0, 2, 0, 0, 2]);
    var U = {};
    ['iTime', 'iResolution', 'hue', 'hover', 'rot', 'hoverIntensity', 'glow'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    container.appendChild(canvas);

    var S = { hue: Number(opts.hue) || 0, mic: opts.mic !== false, glow: Number(opts.glow) || 1, running: false, raf: 0, last: 0, rot: 0, level: 0, still: reducedMotion(),
      stream: null, ctx: null, analyser: null, source: null, data: null, micToken: 0 };

    function resize() {
      var dpr = Math.min(global.devicePixelRatio || 1, 2), w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      var cw = Math.round(w * dpr), ch = Math.round(h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; gl.viewport(0, 0, cw, ch); }
      gl.uniform3f(U.iResolution, cw, ch, cw / ch);
    }

    function level() {
      if (!S.analyser || !S.data) return 0;
      S.analyser.getByteFrequencyData(S.data);
      var sum = 0;
      for (var i = 0; i < S.data.length; i++) { var v = S.data[i] / 255; sum += v * v; }
      return Math.min(Math.sqrt(sum / S.data.length) * SENSITIVITY * 3, 1);
    }

    function frame(t) {
      if (!S.running) return;
      S.raf = global.requestAnimationFrame(frame);
      draw(t);
    }
    function draw(t) {
      var dt = S.last ? Math.min((t - S.last) * 0.001, 0.1) : 0;
      S.last = t;
      resize();
      var lv = level();
      S.level += (lv - S.level) * 0.35;                       // a little smoothing so the orb does not flicker
      if (!S.still) {
        S.rot += dt * (BASE_ROT + S.level * MAX_ROT * 2);
        gl.uniform1f(U.iTime, t * 0.001);
        gl.uniform1f(U.hover, Math.min(S.level * 2, 1));
        gl.uniform1f(U.hoverIntensity, Math.min(S.level * MAX_HOVER * 0.8, MAX_HOVER));
      } else {
        gl.uniform1f(U.iTime, 0); gl.uniform1f(U.hover, 0); gl.uniform1f(U.hoverIntensity, 0);
      }
      gl.uniform1f(U.rot, S.rot);
      gl.uniform1f(U.hue, S.hue);
      gl.uniform1f(U.glow, S.glow + S.level * 0.4);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function startMic() {
      var md = global.navigator && global.navigator.mediaDevices;
      if (!md || !md.getUserMedia) return;
      var token = ++S.micToken;
      md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
        if (token !== S.micToken || !S.running) { stream.getTracks().forEach(function (tr) { tr.stop(); }); return; }
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) { stream.getTracks().forEach(function (tr) { tr.stop(); }); return; }
        S.stream = stream; S.ctx = new AC();
        if (S.ctx.state === 'suspended' && S.ctx.resume) S.ctx.resume().catch(function () {});
        S.analyser = S.ctx.createAnalyser();
        S.analyser.fftSize = 512; S.analyser.smoothingTimeConstant = 0.3; S.analyser.minDecibels = -90; S.analyser.maxDecibels = -10;
        S.source = S.ctx.createMediaStreamSource(stream); S.source.connect(S.analyser);
        S.data = new Uint8Array(S.analyser.frequencyBinCount);
      }, function () { /* no permission: the orb still turns slowly */ });
    }

    function stopMic() {
      S.micToken++;
      try { if (S.stream) S.stream.getTracks().forEach(function (tr) { tr.stop(); }); } catch (e) { /* ended */ }
      try { if (S.source) S.source.disconnect(); } catch (e) { /* ignore */ }
      try { if (S.ctx && S.ctx.state !== 'closed') S.ctx.close(); } catch (e) { /* ignore */ }
      S.stream = S.ctx = S.analyser = S.source = S.data = null; S.level = 0;
    }

    return {
      start: function () {
        if (S.running) return;
        if (S.still && !S.mic) { this.drawOnce(); return; }        // reduced motion: an avatar does not move
        S.running = true; S.last = 0;
        if (S.mic) startMic();
        S.raf = global.requestAnimationFrame(frame);
      },
      drawOnce: function () {
        var self = this;
        global.requestAnimationFrame(function () { if (!S.running && !S.dead) { S.last = 0; draw(2600); } });
        return self;
      },
      stop: function () {
        S.running = false;
        if (S.raf) global.cancelAnimationFrame(S.raf);
        S.raf = 0;
        stopMic();
      },
      setHue: function (deg) { S.hue = Number(deg) || 0; },
      destroy: function () {
        this.stop(); S.dead = true;
        try { var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) { /* ignore */ }
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  global.WwVoiceOrb = { create: create, HUES: HUES };
})(typeof window !== 'undefined' ? window : globalThis);
