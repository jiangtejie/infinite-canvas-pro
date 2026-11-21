/// <reference types="@webgpu/types" />

// L0 梯度平滑的 WebGPU 实现：单块 FFT 求解，超大图按 768 + 128 halo 分块重叠求解。
// 移植自 GPT-anime-denoise-web（MIT），保留其边界延展与周期边界约定。

let devicePromise: Promise<GPUDevice> | null = null;
const kernels = new Map<string, { layout: GPUBindGroupLayout; pipelines: Record<string, GPUComputePipeline> }>();

async function device(): Promise<GPUDevice> {
    if (!devicePromise) {
        devicePromise = (async () => {
            if (!navigator.gpu) throw new Error("图片平滑需要 WebGPU");
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) throw new Error("无法取得 WebGPU 设备");
            const gpuDevice = await adapter.requestDevice();
            gpuDevice.lost.then(() => {
                devicePromise = null;
                kernels.clear();
            });
            return gpuDevice;
        })().catch((error) => {
            devicePromise = null;
            throw error;
        });
    }
    return devicePromise;
}

async function compile(gpuDevice: GPUDevice, width: number, height: number) {
    const key = `${width}x${height}`;
    const cached = kernels.get(key);
    if (cached) return cached;
    const n = width * height;
    const common = `
const W:u32=${width}u; const H:u32=${height}u; const N:u32=${n}u;
struct Params { stage:u32, axis:u32, inverse:u32, beta:f32, lam:f32, pad:u32, pad2:u32, pad3:u32 }
@group(0) @binding(0) var<storage,read> a:array<vec2f>;
@group(0) @binding(1) var<storage,read_write> b:array<vec2f>;
@group(0) @binding(2) var<storage,read> original:array<vec2f>;
@group(0) @binding(3) var<uniform> p:Params;
`;
    const sources: Record<string, string> = {
        reverse: `let size=select(W,H,p.axis==1u); let stride=select(1u,W,p.axis==1u);
      let pos=(i/stride)%size; let bits=u32(log2(f32(size)));
      let rev=reverseBits(pos)>>(32u-bits); b[i]=a[i-pos*stride+rev*stride];`,
        fft: `let stride=select(1u,W,p.axis==1u); let size=select(W,H,p.axis==1u);
      let pos=(i/stride)%size; let spanHalf=p.stage/2u; let j=pos%spanHalf;
      let low=i-(pos%p.stage)*stride+j*stride;
      let angle=select(-1.0,1.0,p.inverse==1u)*6.283185307179586*f32(j)/f32(p.stage);
      let z=a[low+spanHalf*stride]; let cs=cos(angle); let sn=sin(angle);
      let t=vec2f(z.x*cs-z.y*sn,z.x*sn+z.y*cs);
      b[i]=a[low]+select(t,-t,pos%p.stage>=spanHalf);`,
        gradient: `if(i>=N){return;} let x=i%W; let y=i/W;
      let right=y*W+(x+1u)%W; let below=((y+1u)%H)*W+x;
      var energy=0.0; var g:array<vec2f,3>;
      for(var c=0u;c<3u;c++){let off=c*N;g[c]=vec2f(a[off+right].x-a[off+i].x,a[off+below].x-a[off+i].x);energy+=dot(g[c],g[c]);}
      for(var c=0u;c<3u;c++){b[c*N+i]=select(g[c],vec2f(0.0),energy<p.lam/p.beta);}`,
        divergence: `let off=(i/N)*N;let j=i%N;let x=j%W;let y=j/W;
      let left=off+y*W+(x+W-1u)%W;let above=off+((y+H-1u)%H)*W+x;
      b[i]=vec2f(a[left].x-a[i].x+a[above].y-a[i].y,0.0);`,
        update: `let j=i%N;let sx=sin(3.141592653589793*f32(j%W)/f32(W));let sy=sin(3.141592653589793*f32(j/W)/f32(H));
      let den=1.0+p.beta*4.0*(sx*sx+sy*sy);b[i]=(original[i]+p.beta*a[i])/den;`,
        normalize: `b[i]=vec2f(a[i].x/f32(N),0.0);`,
    };
    const layout = gpuDevice.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
            { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        ],
    });
    const pipelines: Record<string, GPUComputePipeline> = {};
    for (const [name, body] of Object.entries(sources)) {
        const shaderModule = gpuDevice.createShaderModule({ code: `${common}@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=3u*N){return;}${body}}` });
        pipelines[name] = await gpuDevice.createComputePipelineAsync({ layout: gpuDevice.createPipelineLayout({ bindGroupLayouts: [layout] }), compute: { module: shaderModule, entryPoint: "main" } });
    }
    const result = { layout, pipelines };
    kernels.set(key, result);
    return result;
}

async function gpuL0Smooth(rgb: Float32Array, width: number, height: number, lam: number): Promise<Float32Array> {
    if (!Number.isFinite(lam) || lam < 0) throw new Error("平滑强度无效");
    if (width < 1 || height < 1 || rgb.length !== width * height * 3) throw new Error("图片数据无效");
    if (lam === 0) return rgb.slice();
    const w = 2 ** Math.ceil(Math.log2(Math.max(2, width)));
    const h = 2 ** Math.ceil(Math.log2(Math.max(2, height)));
    const n = w * h;
    if (n > 1048576) throw new Error("平滑分块超出内存预算");
    const gpuDevice = await device();
    const { layout, pipelines } = await compile(gpuDevice, w, h);
    const bytes = n * 3 * 8;
    const buffers: GPUBuffer[] = [];
    const uniforms = new Map<string, GPUBuffer>();
    const alloc = (size: number, usage: number) => {
        const buffer = gpuDevice.createBuffer({ size, usage });
        buffers.push(buffer);
        return buffer;
    };
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    const state = alloc(bytes, usage);
    const original = alloc(bytes, usage);
    const a = alloc(bytes, usage);
    const b = alloc(bytes, usage);
    const grad = alloc(bytes, usage);
    const read = alloc(bytes, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
    try {
        const data = new Float32Array(n * 6);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) data[(c * n + y * w + x) * 2] = rgb[(Math.min(y, height - 1) * width + Math.min(x, width - 1)) * 3 + c];
        gpuDevice.queue.writeBuffer(state, 0, data);
        const dispatch = (encoder: GPUCommandEncoder, name: string, src: GPUBuffer, dst: GPUBuffer, stage = 0, axis = 0, inverse = 0, beta = 0) => {
            const key = `${stage},${axis},${inverse},${beta}`;
            let uniform = uniforms.get(key);
            if (!uniform) {
                const raw = new ArrayBuffer(32);
                const u = new Uint32Array(raw);
                const f = new Float32Array(raw);
                u[0] = stage;
                u[1] = axis;
                u[2] = inverse;
                f[3] = beta;
                f[4] = lam;
                uniform = alloc(32, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
                gpuDevice.queue.writeBuffer(uniform, 0, raw);
                uniforms.set(key, uniform);
            }
            const bind = gpuDevice.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: src } }, { binding: 1, resource: { buffer: dst } }, { binding: 2, resource: { buffer: original } }, { binding: 3, resource: { buffer: uniform } }] });
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipelines[name]);
            pass.setBindGroup(0, bind);
            pass.dispatchWorkgroups(Math.ceil((name === "gradient" ? n : n * 3) / 256));
            pass.end();
        };
        const fft = (encoder: GPUCommandEncoder, input: GPUBuffer, inverse: boolean) => {
            let src = input;
            for (let axis = 0; axis < 2; axis++) {
                let dst = src === a ? b : a;
                dispatch(encoder, "reverse", src, dst, 0, axis, inverse ? 1 : 0);
                src = dst;
                for (let stage = 2; stage <= (axis ? h : w); stage *= 2) {
                    dst = src === a ? b : a;
                    dispatch(encoder, "fft", src, dst, stage, axis, inverse ? 1 : 0);
                    src = dst;
                }
            }
            return src;
        };
        let encoder = gpuDevice.createCommandEncoder();
        const spectrum = fft(encoder, state, false);
        encoder.copyBufferToBuffer(spectrum, 0, original, 0, bytes);
        gpuDevice.queue.submit([encoder.finish()]);
        let count = 0;
        for (let beta = 2 * lam; beta < 1e5; beta *= 2) {
            encoder = gpuDevice.createCommandEncoder();
            dispatch(encoder, "gradient", state, grad, 0, 0, 0, beta);
            dispatch(encoder, "divergence", grad, a);
            const div = fft(encoder, a, false);
            const freq = div === a ? b : a;
            dispatch(encoder, "update", div, freq, 0, 0, 0, beta);
            const spatial = fft(encoder, freq, true);
            dispatch(encoder, "normalize", spatial, state);
            gpuDevice.queue.submit([encoder.finish()]);
            // 限制作业队列长度，不回读中间结果。
            if (++count % 4 === 0) await gpuDevice.queue.onSubmittedWorkDone();
        }
        encoder = gpuDevice.createCommandEncoder();
        encoder.copyBufferToBuffer(state, 0, read, 0, bytes);
        gpuDevice.queue.submit([encoder.finish()]);
        await read.mapAsync(GPUMapMode.READ);
        const result = new Float32Array(rgb.length);
        const mapped = new Float32Array(read.getMappedRange());
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) result[(y * width + x) * 3 + c] = Math.max(0, Math.min(1, mapped[(c * n + y * w + x) * 2]));
        read.unmap();
        return result;
    } finally {
        for (const buffer of buffers) buffer.destroy();
    }
}

export async function gpuL0SmoothLarge(rgb: Float32Array, width: number, height: number, lam: number, onProgress?: (stage: string) => void): Promise<Float32Array> {
    if (2 ** Math.ceil(Math.log2(Math.max(2, width))) * 2 ** Math.ceil(Math.log2(Math.max(2, height))) <= 1048576) {
        return gpuL0Smooth(rgb, width, height, lam);
    }
    const out = new Float32Array(rgb.length);
    const core = 768;
    const halo = 128;
    let done = 0;
    const total = Math.ceil(width / core) * Math.ceil(height / core);
    for (let y = 0; y < height; y += core) for (let x = 0; x < width; x += core) {
        onProgress?.(`图片平滑 ${++done}/${total}`);
        const left = Math.max(0, x - halo);
        const top = Math.max(0, y - halo);
        const right = Math.min(width, x + core + halo);
        const bottom = Math.min(height, y + core + halo);
        const tileWidth = right - left;
        const tileHeight = bottom - top;
        const tile = new Float32Array(tileWidth * tileHeight * 3);
        for (let j = 0; j < tileHeight; j++) tile.set(rgb.subarray(((top + j) * width + left) * 3, ((top + j) * width + right) * 3), j * tileWidth * 3);
        const filtered = await gpuL0Smooth(tile, tileWidth, tileHeight, lam);
        for (let j = y; j < Math.min(height, y + core); j++) out.set(filtered.subarray(((j - top) * tileWidth + x - left) * 3, ((j - top) * tileWidth + Math.min(width, x + core) - left) * 3), (j * width + x) * 3);
    }
    return out;
}
