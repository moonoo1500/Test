/**
 * Minimal WebGL2 stub.
 *
 * It lets three.js build a renderer inside jsdom so that the complete game
 * boot path (scene, composer, chunk streaming, physics loop) can be tested
 * without a GPU.
 */

let enumCounter = 0x8000;
const enums = new Map<string, number>();

/** real GL enum values for the constants three.js asks for */
const GL_CONSTANTS: Record<string, number> = {
  VERSION: 0x1f02,
  SHADING_LANGUAGE_VERSION: 0x8b8c,
  VENDOR: 0x1f00,
  RENDERER: 0x1f01,
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8b4d,
  MAX_TEXTURE_IMAGE_UNITS: 0x8872,
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8b4c,
  MAX_TEXTURE_SIZE: 0x0d33,
  MAX_CUBE_MAP_TEXTURE_SIZE: 0x851c,
  MAX_3D_TEXTURE_SIZE: 0x8073,
  MAX_ARRAY_TEXTURE_LAYERS: 0x88ff,
  MAX_RENDERBUFFER_SIZE: 0x84e8,
  MAX_VIEWPORT_DIMS: 0x0d3a,
  MAX_VERTEX_ATTRIBS: 0x8869,
  MAX_VERTEX_UNIFORM_VECTORS: 0x8dfb,
  MAX_FRAGMENT_UNIFORM_VECTORS: 0x8dfd,
  MAX_VARYING_VECTORS: 0x8dfc,
  MAX_SAMPLES: 0x8d57,
  MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff,
  SCISSOR_BOX: 0x0c10,
  VIEWPORT: 0x0ba2,
  ALIASED_LINE_WIDTH_RANGE: 0x846e,
  MAX_ELEMENTS_VERTICES: 0x80e8,
  MAX_ELEMENTS_INDICES: 0x80e9,
  MAX_DRAW_BUFFERS: 0x8824,
  MAX_COLOR_ATTACHMENTS: 0x8cdf,
  IMPLEMENTATION_COLOR_READ_TYPE: 0x8b9a,
  IMPLEMENTATION_COLOR_READ_FORMAT: 0x8b9b,
  UNSIGNED_BYTE: 0x1401,
  FLOAT: 0x1406,
  HALF_FLOAT: 0x140b,
  RGBA: 0x1908,
  RGB: 0x1907,
  TEXTURE_2D: 0x0de1,
  TEXTURE_CUBE_MAP: 0x8513,
  TEXTURE_3D: 0x806f,
  TEXTURE_2D_ARRAY: 0x8c1a,
};

function makeStubContext(): unknown {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === 'getExtension') return () => null;
      if (prop === 'getSupportedExtensions') return () => [];
      if (prop === 'getParameter') {
        return (p: number) => {
          switch (p) {
            case 0x1f02:
              return 'WebGL 2.0 (stub)';
            case 0x8b8c:
              return 'WebGL GLSL ES 3.00 (stub)';
            case 0x0d33:
              return 4096;
            case 0x8869:
              return 16;
            case 0x8b4d:
              return 32;
            case 0x8b4c:
              return 32;
            case 0x8872:
              return 32;
            case 0x8dfb:
              return 1024;
            case 0x8dfd:
              return 1024;
            case 0x8dfc:
              return 30;
            case 0x8d57:
              return 4;
            case 0x851c:
              return 4096;
            case 0x8073:
              return 256;
            case 0x88ff:
              return 256;
            case 0x84e8:
              return 4096;
            case 0x0d3a:
              return new Int32Array([4096, 4096]);
            case 0x84ff:
              return 16;
            case 0x846e:
              return new Float32Array([1, 1]);
            case 0x0c10:
              return new Int32Array([0, 0, 0, 0]);
            case 0x0ba2:
              return new Int32Array([0, 0, 0, 0]);
            default:
              return 0;
          }
        };
      }
      if (prop === 'getShaderPrecisionFormat') {
        return () => ({ rangeMin: 127, rangeMax: 127, precision: 23 });
      }
      if (prop === 'getProgramParameter' || prop === 'getShaderParameter') return () => true;
      if (prop === 'getProgramInfoLog' || prop === 'getShaderInfoLog') return () => '';
      if (prop === 'getUniformLocation') return () => ({});
      if (prop === 'getAttribLocation') return () => 0;
      if (prop === 'getActiveUniform' || prop === 'getActiveAttrib') {
        return () => ({ name: 'a', size: 1, type: 0 });
      }
      if (prop === 'getError') return () => 0;
      if (prop === 'checkFramebufferStatus') return () => 36053;
      if (prop === 'getContextAttributes') return () => ({});
      if (
        prop === 'createBuffer' ||
        prop === 'createTexture' ||
        prop === 'createFramebuffer' ||
        prop === 'createRenderbuffer' ||
        prop === 'createProgram' ||
        prop === 'createShader' ||
        prop === 'createVertexArray' ||
        prop === 'createQuery' ||
        prop === 'createSampler'
      ) {
        return () => ({});
      }
      if (/^[A-Z0-9_]+$/.test(prop)) {
        if (GL_CONSTANTS[prop] !== undefined) return GL_CONSTANTS[prop];
        if (!enums.has(prop)) enums.set(prop, enumCounter++);
        return enums.get(prop);
      }
      return () => undefined;
    },
  };
  return new Proxy({}, handler);
}

/** Installs the stub on every canvas of the current document. */
export function installWebGLStub(): void {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: function getContext(this: HTMLCanvasElement, kind: string) {
      if (typeof kind === 'string' && kind.includes('webgl')) return makeStubContext();
      return null;
    },
  });
}
