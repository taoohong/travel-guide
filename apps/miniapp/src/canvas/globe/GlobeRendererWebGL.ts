import type { Canvas } from '@tarojs/taro';
import earth2048 from '../../assets/globe/earth-2048.png';
import earth1024 from '../../assets/globe/earth-1024.png';
import earth512 from '../../assets/globe/earth-512.png';
import clouds1024 from '../../assets/globe/clouds-1024.jpg';
import clouds512 from '../../assets/globe/clouds-512.jpg';
import mask2048 from '../../assets/globe/continent-mask-2048.png';
import mask1024 from '../../assets/globe/continent-mask-1024.png';
import mask512 from '../../assets/globe/continent-mask-512.png';
import countryIds from '../../assets/geo/country-ids.json';
import countryPoints from '../../assets/geo/country-points.json';
import { GLOBE_RADIUS_SCALE, type Rotation } from './globeProjection';
import type { QualityLevel } from './globeState';

const CONTINENT_MASK: Record<string, number> = { AS: 36, EU: 72, AF: 108, NA: 144, SA: 180, OC: 216 };
const TEXTURES: Record<number, { earth: string; clouds: string; mask: string }> = {
  2048: { earth: earth2048, clouds: clouds1024, mask: mask2048 },
  1024: { earth: earth1024, clouds: clouds1024, mask: mask1024 },
  512: { earth: earth512, clouds: clouds512, mask: mask512 },
};
const SEGMENTS: Record<QualityLevel, { latitude: number; longitude: number; pixelRatio: number }> = {
  high: { latitude: 64, longitude: 96, pixelRatio: 1.5 },
  medium: { latitude: 40, longitude: 64, pixelRatio: 1.25 },
  low: { latitude: 24, longitude: 40, pixelRatio: 1 },
};

const SPHERE_VERTEX = `
attribute vec3 a_position;
attribute vec2 a_uv;
uniform vec2 u_resolution;
uniform float u_radius;
uniform float u_yaw;
uniform float u_pitch;
varying vec2 v_uv;
varying vec3 v_normal;
void main() {
  float cy = cos(u_yaw); float sy = sin(u_yaw);
  float cp = cos(u_pitch); float sp = sin(u_pitch);
  float x = a_position.x * cy - a_position.z * sy;
  float z = a_position.x * sy + a_position.z * cy;
  float y = a_position.y * cp - z * sp;
  float depth = a_position.y * sp + z * cp;
  gl_Position = vec4(x * u_radius * 2.0 / u_resolution.x,
    y * u_radius * 2.0 / u_resolution.y, -depth * 0.999, 1.0);
  v_uv = a_uv;
  v_normal = vec3(x, y, depth);
}`;

const SPHERE_FRAGMENT = `
precision mediump float;
uniform sampler2D u_earth;
uniform sampler2D u_clouds;
uniform sampler2D u_continent_mask;
uniform sampler2D u_selected_mask;
uniform vec2 u_mask_texel;
uniform float u_active_continent;
uniform float u_selected_count;
varying vec2 v_uv;
varying vec3 v_normal;
float isActive(vec2 uv) {
  float value = texture2D(u_continent_mask, uv).r;
  return 1.0 - step(0.5 / 255.0, abs(value - u_active_continent));
}
float isSelected(vec2 uv) {
  float countryId = texture2D(u_continent_mask, uv).g;
  return texture2D(u_selected_mask, vec2(countryId, 0.5)).r;
}
void main() {
  vec3 textureColor = texture2D(u_earth, v_uv).rgb;
  float land = smoothstep(0.62, 0.91, dot(textureColor, vec3(0.299, 0.587, 0.114)));
  vec3 color = mix(vec3(0.58, 0.79, 0.96), textureColor, land);
  float cloudValue = texture2D(u_clouds, v_uv).r;
  float active = 0.0;
  float selected = 0.0;
  float edge = 0.0;
  float selectedEdge = 0.0;
  if (u_active_continent > 0.001 || u_selected_count > 0.0) {
    vec4 mask = texture2D(u_continent_mask, v_uv);
    if (u_active_continent > 0.001) {
      active = 1.0 - step(0.5 / 255.0, abs(mask.r - u_active_continent));
      float north = isActive(v_uv + vec2(0.0, u_mask_texel.y));
      float south = isActive(v_uv - vec2(0.0, u_mask_texel.y));
      float east = isActive(v_uv + vec2(u_mask_texel.x, 0.0));
      float west = isActive(v_uv - vec2(u_mask_texel.x, 0.0));
      edge = max(max(abs(active - north), abs(active - south)),
        max(abs(active - east), abs(active - west)));
    }
    if (u_selected_count > 0.0) {
      selected = isSelected(v_uv);
      float selectedNorth = isSelected(v_uv + vec2(0.0, u_mask_texel.y));
      float selectedSouth = isSelected(v_uv - vec2(0.0, u_mask_texel.y));
      float selectedEast = isSelected(v_uv + vec2(u_mask_texel.x, 0.0));
      float selectedWest = isSelected(v_uv - vec2(u_mask_texel.x, 0.0));
      selectedEdge = max(max(abs(selected - selectedNorth), abs(selected - selectedSouth)),
        max(abs(selected - selectedEast), abs(selected - selectedWest)));
    }
  }
  float light = max(dot(normalize(v_normal), normalize(vec3(-0.35, 0.42, 1.0))), 0.0);
  color *= 0.94 + smoothstep(0.0, 0.78, light) * 0.06;
  float cloudCover = smoothstep(0.57, 0.88, cloudValue) * 0.14;
  color = mix(color, vec3(0.97, 0.99, 1.0), cloudCover);
  float rim = pow(1.0 - max(v_normal.z, 0.0), 6.0);
  color = mix(color, vec3(0.24, 0.54, 1.0), rim * 0.42);
  color = mix(color, vec3(0.72, 0.96, 0.82), active * 0.24);
  color = mix(color, vec3(0.54, 0.58, 0.64), edge * step(0.001, u_active_continent) * 0.82);
  color = mix(color, vec3(0.62, 0.94, 0.72), selected * 0.38);
  color += selectedEdge * vec3(0.28, 0.72, 0.44) * 0.92;
  gl_FragColor = vec4(color, 1.0);
}`;

const MARKER_VERTEX = `
attribute vec3 a_position;
attribute vec4 a_style;
uniform vec2 u_resolution;
uniform float u_radius;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_pixel_ratio;
varying vec4 v_style;
void main() {
  float cy = cos(u_yaw); float sy = sin(u_yaw);
  float cp = cos(u_pitch); float sp = sin(u_pitch);
  float x = a_position.x * cy - a_position.z * sy;
  float z = a_position.x * sy + a_position.z * cy;
  float y = a_position.y * cp - z * sp;
  float depth = a_position.y * sp + z * cp;
  gl_Position = vec4(x * u_radius * 2.0 / u_resolution.x,
    y * u_radius * 2.0 / u_resolution.y, clamp(-depth * 0.999 - 0.0005, -0.9998, 1.0), 1.0);
  gl_PointSize = a_style.a * u_pixel_ratio;
  v_style = a_style;
}`;

const MARKER_FRAGMENT = `
precision mediump float;
varying vec4 v_style;
void main() {
  vec2 point = gl_PointCoord - vec2(0.5);
  float distanceSquared = dot(point, point);
  if (distanceSquared > 0.25) discard;
  float edge = 1.0 - smoothstep(0.16, 0.25, distanceSquared);
  gl_FragColor = vec4(v_style.rgb, edge);
}`;

interface ProgramInfo { program: WebGLProgram; position: number; uv?: number; style?: number;
  resolution: WebGLUniformLocation | null; radius: WebGLUniformLocation | null; yaw: WebGLUniformLocation | null;
  pitch: WebGLUniformLocation | null; earth?: WebGLUniformLocation | null; clouds?: WebGLUniformLocation | null;
  mask?: WebGLUniformLocation | null;
  maskTexel?: WebGLUniformLocation | null; activeContinent?: WebGLUniformLocation | null;
  selectedMask?: WebGLUniformLocation | null; selectedCount?: WebGLUniformLocation | null; pixelRatio?: WebGLUniformLocation | null }
interface CountryPoint { code: string; continentCode: string; latitude: number; longitude: number }

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('无法创建地球着色器');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || '地球着色器编译失败';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('无法创建地球绘制程序');
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || '地球绘制程序链接失败';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function loadImage(canvas: Canvas, source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage() as unknown as HTMLImageElement;
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`无法加载离线地球纹理: ${source}`));
    image.src = source;
  });
}

function makeSphere(latitudeSegments: number, longitudeSegments: number): { vertices: Float32Array; indices: Uint16Array } {
  const vertices = new Float32Array((latitudeSegments + 1) * (longitudeSegments + 1) * 5);
  let cursor = 0;
  for (let latitude = 0; latitude <= latitudeSegments; latitude++) {
    const v = latitude / latitudeSegments;
    const angle = (v - 0.5) * Math.PI;
    const cosLatitude = Math.cos(angle);
    const sinLatitude = Math.sin(angle);
    for (let longitude = 0; longitude <= longitudeSegments; longitude++) {
      const u = longitude / longitudeSegments;
      const around = (u - 0.5) * Math.PI * 2;
      vertices[cursor++] = cosLatitude * Math.sin(around);
      vertices[cursor++] = sinLatitude;
      vertices[cursor++] = cosLatitude * Math.cos(around);
      vertices[cursor++] = u;
      vertices[cursor++] = v;
    }
  }
  const indices = new Uint16Array(latitudeSegments * longitudeSegments * 6);
  cursor = 0;
  for (let latitude = 0; latitude < latitudeSegments; latitude++) {
    for (let longitude = 0; longitude < longitudeSegments; longitude++) {
      const first = latitude * (longitudeSegments + 1) + longitude;
      const nextRow = first + longitudeSegments + 1;
      indices[cursor++] = first;
      indices[cursor++] = nextRow;
      indices[cursor++] = first + 1;
      indices[cursor++] = nextRow;
      indices[cursor++] = nextRow + 1;
      indices[cursor++] = first + 1;
    }
  }
  return { vertices, indices };
}

function colorStyle(color: readonly [number, number, number], size: number, target: Float32Array, offset: number): void {
  target[offset] = color[0] / 255;
  target[offset + 1] = color[1] / 255;
  target[offset + 2] = color[2] / 255;
  target[offset + 3] = size;
}

export class GlobeRendererWebGL {
  readonly kind = 'webgl' as const;
  readonly pixelRatio: number;
  private readonly gl: WebGLRenderingContext;
  private readonly sphereProgram: ProgramInfo;
  private readonly markerProgram: ProgramInfo;
  private readonly sphereBuffer: WebGLBuffer;
  private readonly indexBuffer: WebGLBuffer;
  private readonly markerPositionBuffer: WebGLBuffer;
  private readonly markerStyleBuffer: WebGLBuffer;
  private readonly indexCount: number;
  private readonly markerPositions: Float32Array;
  private readonly markerStyles: Float32Array;
  private readonly sphereTexture: WebGLTexture;
  private readonly cloudsTexture: WebGLTexture;
  private readonly maskTexture: WebGLTexture;
  private readonly selectedMaskTexture: WebGLTexture;
  private readonly selectedLookup = new Uint8Array(256);
  private selectedCount = 0;
  private readonly maskResolution: number;
  private width = 1;
  private height = 1;
  private activeMaskId = 0;

  private constructor(private readonly canvas: Canvas, quality: QualityLevel,
    width: number, height: number, pixelRatio: number, gl: WebGLRenderingContext, textureSize: number) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.maskResolution = textureSize;
    const detail = SEGMENTS[quality];
    const mesh = makeSphere(detail.latitude, detail.longitude);
    this.indexCount = mesh.indices.length;
    this.sphereProgram = this.program(SPHERE_VERTEX, SPHERE_FRAGMENT, 'a_position', 'a_uv');
    this.markerProgram = this.program(MARKER_VERTEX, MARKER_FRAGMENT, 'a_position', undefined, 'a_style');
    const sphereBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    const markerPositionBuffer = gl.createBuffer();
    const markerStyleBuffer = gl.createBuffer();
    const sphereTexture = gl.createTexture();
    const cloudsTexture = gl.createTexture();
    const maskTexture = gl.createTexture();
    const selectedMaskTexture = gl.createTexture();
    if (!sphereBuffer || !indexBuffer || !markerPositionBuffer || !markerStyleBuffer || !sphereTexture || !maskTexture
      || !cloudsTexture || !selectedMaskTexture) {
      throw new Error('无法分配地球图形资源');
    }
    this.sphereBuffer = sphereBuffer;
    this.indexBuffer = indexBuffer;
    this.markerPositionBuffer = markerPositionBuffer;
    this.markerStyleBuffer = markerStyleBuffer;
    this.sphereTexture = sphereTexture;
    this.cloudsTexture = cloudsTexture;
    this.maskTexture = maskTexture;
    this.selectedMaskTexture = selectedMaskTexture;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    const points = countryPoints as CountryPoint[];
    this.markerPositions = new Float32Array(points.length * 3);
    this.markerStyles = new Float32Array(points.length * 4);
    for (let index = 0; index < points.length; index++) {
      const point = points[index]!;
      const latitude = point.latitude * Math.PI / 180;
      const longitude = point.longitude * Math.PI / 180;
      const offset = index * 3;
      this.markerPositions[offset] = Math.cos(latitude) * Math.sin(longitude);
      this.markerPositions[offset + 1] = Math.sin(latitude);
      this.markerPositions[offset + 2] = Math.cos(latitude) * Math.cos(longitude);
      colorStyle([137, 160, 178], 2.2, this.markerStyles, index * 4);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, markerPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.markerPositions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, markerStyleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.markerStyles, gl.DYNAMIC_DRAW);
    this.resize(width, height);
  }

  static async create(canvas: Canvas, width: number, height: number, quality: QualityLevel,
    devicePixelRatio: number): Promise<GlobeRendererWebGL> {
    const detail = SEGMENTS[quality];
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
    if (!gl) throw new Error('当前设备不可用 WebGL');
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const desiredSize = quality === 'high' ? 2048 : quality === 'medium' ? 1024 : 512;
    if (maxTextureSize < 512) throw new Error('当前设备的 WebGL 纹理尺寸不足');
    const textureSize = maxTextureSize >= desiredSize ? desiredSize : maxTextureSize >= 1024 ? 1024 : 512;
    const renderer = new GlobeRendererWebGL(canvas, quality, width, height,
      Math.min(devicePixelRatio || 1, detail.pixelRatio), gl, textureSize);
    try {
      await renderer.loadTextures(TEXTURES[textureSize]!);
      return renderer;
    } catch (error) {
      renderer.dispose();
      throw error;
    }
  }

  private program(vertexSource: string, fragmentSource: string, positionName: string, uvName?: string,
    styleName?: string): ProgramInfo {
    const gl = this.gl;
    const program = createProgram(gl, vertexSource, fragmentSource);
    return { program, position: gl.getAttribLocation(program, positionName),
      uv: uvName ? gl.getAttribLocation(program, uvName) : undefined,
      style: styleName ? gl.getAttribLocation(program, styleName) : undefined,
      resolution: gl.getUniformLocation(program, 'u_resolution'), radius: gl.getUniformLocation(program, 'u_radius'),
      yaw: gl.getUniformLocation(program, 'u_yaw'), pitch: gl.getUniformLocation(program, 'u_pitch'),
      earth: gl.getUniformLocation(program, 'u_earth'), clouds: gl.getUniformLocation(program, 'u_clouds'),
      mask: gl.getUniformLocation(program, 'u_continent_mask'),
      maskTexel: gl.getUniformLocation(program, 'u_mask_texel'),
      activeContinent: gl.getUniformLocation(program, 'u_active_continent'),
      selectedCount: gl.getUniformLocation(program, 'u_selected_count'),
      selectedMask: gl.getUniformLocation(program, 'u_selected_mask'),
      pixelRatio: gl.getUniformLocation(program, 'u_pixel_ratio') };
  }

  private async loadTextures(sources: { earth: string; clouds: string; mask: string }): Promise<void> {
    const [earthImage, cloudsImage, maskImage] = await Promise.all([
      loadImage(this.canvas, sources.earth), loadImage(this.canvas, sources.clouds), loadImage(this.canvas, sources.mask),
    ]);
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    this.uploadTexture(this.sphereTexture, earthImage, true);
    this.uploadTexture(this.cloudsTexture, cloudsImage, true);
    this.uploadTexture(this.maskTexture, maskImage, false);
  }

  private uploadTexture(texture: WebGLTexture, image: HTMLImageElement, mipmaps: boolean): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST);
    if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const gl = this.gl;
    this.canvas.width = Math.max(1, Math.round(width * this.pixelRatio));
    this.canvas.height = Math.max(1, Math.round(height * this.pixelRatio));
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setVisualState(activeContinent: string, selectedCodes: readonly string[], focusedCode?: string | null): void {
    const gl = this.gl;
    this.activeMaskId = CONTINENT_MASK[activeContinent] ?? 0;
    this.selectedLookup.fill(0);
    this.selectedCount = 0;
    for (let index = 0; index < selectedCodes.length; index++) {
      const id = countryIds[selectedCodes[index] as keyof typeof countryIds];
      if (id && !this.selectedLookup[id]) { this.selectedLookup[id] = 255; this.selectedCount++; }
    }
    gl.bindTexture(gl.TEXTURE_2D, this.selectedMaskTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.selectedLookup);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const points = countryPoints as CountryPoint[];
    for (let index = 0; index < points.length; index++) {
      const point = points[index]!;
      const selected = selectedCodes.includes(point.code);
      const focused = focusedCode === point.code;
      const color: readonly [number, number, number] = focused ? [72, 174, 112]
        : selected ? [112, 216, 145] : point.continentCode === activeContinent ? [132, 202, 157] : [137, 160, 178];
      colorStyle(color, focused ? 11 : selected ? 9 : point.continentCode === activeContinent ? 4.5 : 2.6,
        this.markerStyles, index * 4);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.markerStyleBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.markerStyles);
  }

  render(rotation: Rotation, zoom: number): void {
    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const radius = Math.min(width, height) * 0.46 * GLOBE_RADIUS_SCALE * zoom;
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.sphereProgram.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sphereBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.enableVertexAttribArray(this.sphereProgram.position);
    gl.vertexAttribPointer(this.sphereProgram.position, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(this.sphereProgram.uv!);
    gl.vertexAttribPointer(this.sphereProgram.uv!, 2, gl.FLOAT, false, 20, 12);
    gl.uniform2f(this.sphereProgram.resolution, width, height);
    gl.uniform1f(this.sphereProgram.radius, radius);
    gl.uniform1f(this.sphereProgram.yaw, rotation.longitude * Math.PI / 180);
    gl.uniform1f(this.sphereProgram.pitch, rotation.latitude * Math.PI / 180);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sphereTexture);
    gl.uniform1i(this.sphereProgram.earth!, 0);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.cloudsTexture);
    gl.uniform1i(this.sphereProgram.clouds!, 3);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.uniform1i(this.sphereProgram.mask!, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.selectedMaskTexture);
    gl.uniform1i(this.sphereProgram.selectedMask!, 2);
    gl.uniform2f(this.sphereProgram.maskTexel!,
      1 / this.maskResolution, 2 / this.maskResolution);
    gl.uniform1f(this.sphereProgram.activeContinent!, this.activeMaskId / 255);
    gl.uniform1f(this.sphereProgram.selectedCount!, this.selectedCount);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);

    gl.enable(gl.BLEND);
    gl.useProgram(this.markerProgram.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.markerPositionBuffer);
    gl.enableVertexAttribArray(this.markerProgram.position);
    gl.vertexAttribPointer(this.markerProgram.position, 3, gl.FLOAT, false, 12, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.markerStyleBuffer);
    gl.enableVertexAttribArray(this.markerProgram.style!);
    gl.vertexAttribPointer(this.markerProgram.style!, 4, gl.FLOAT, false, 16, 0);
    gl.uniform2f(this.markerProgram.resolution, width, height);
    gl.uniform1f(this.markerProgram.radius, radius);
    gl.uniform1f(this.markerProgram.yaw, rotation.longitude * Math.PI / 180);
    gl.uniform1f(this.markerProgram.pitch, rotation.latitude * Math.PI / 180);
    gl.uniform1f(this.markerProgram.pixelRatio!, this.pixelRatio);
    gl.drawArrays(gl.POINTS, 0, this.markerPositions.length / 3);
    gl.disable(gl.BLEND);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.sphereBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteBuffer(this.markerPositionBuffer);
    gl.deleteBuffer(this.markerStyleBuffer);
    gl.deleteTexture(this.sphereTexture);
    gl.deleteTexture(this.cloudsTexture);
    gl.deleteTexture(this.maskTexture);
    gl.deleteTexture(this.selectedMaskTexture);
    gl.deleteProgram(this.sphereProgram.program);
    gl.deleteProgram(this.markerProgram.program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
