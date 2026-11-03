"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const VERTEX = `
attribute vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision mediump float;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_time;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    float t = u_time * 0.12;

    float radius = length(p * vec2(1.0, 1.14) - u_pointer * 0.35);
    float rings = smoothstep(0.035, 0.0, abs(fract(radius * 5.5 - t * 2.4) - 0.5) - 0.44);
    float ringsFine = smoothstep(0.018, 0.0, abs(fract(radius * 13.0 + t) - 0.5) - 0.46) * 0.45;

    vec2 gridUv = (p + vec2(t * 0.35, -t * 0.22)) * 7.0;
    vec2 gridLine = abs(fract(gridUv) - 0.5);
    float grid = smoothstep(0.47, 0.5, max(gridLine.x, gridLine.y)) * 0.24;

    float flow = noise(p * 2.8 + vec2(t, -t * 0.7)) * 0.5 + noise(p * 6.0 - vec2(t * 0.6, t)) * 0.2;
    float beam = smoothstep(0.16, 0.0, abs(p.y + sin(p.x * 2.2 + t * 3.0) * 0.22 - u_pointer.y * 0.25)) * 0.34;

    vec3 acid = vec3(0.816, 0.925, 0.0);
    vec3 magenta = vec3(1.0, 0.12, 0.52);
    vec3 color = mix(magenta, acid, smoothstep(-0.55, 0.7, p.x * 0.55 + flow * 0.9 + 0.2));

    float alpha = (rings * 0.5 + ringsFine * 0.55 + grid * 0.7 + beam + flow * 0.06) * 0.3;
    alpha *= smoothstep(1.35, 0.15, length(p));
    alpha *= smoothstep(0.0, 0.18, uv.y) * smoothstep(1.0, 0.55, uv.y);

    gl_FragColor = vec4(color, alpha);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

/**
 * 轻量 WebGL 朋克光场：酸性 / 洋红流光、同心环与网格，跟随指针产生视差。
 * 不依赖 three.js；WebGL 不可用或用户偏好减少动态时自动降级为静态画面。
 */
export function PunkAura({ className }: { className?: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext("webgl", { alpha: true, antialias: false, powerPreference: "low-power" });
        if (!gl) {
            canvas.style.display = "none";
            return;
        }

        const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
        const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
        const program = gl.createProgram();
        if (!vertex || !fragment || !program) return;
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
        gl.useProgram(program);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

        const resolution = gl.getUniformLocation(program, "u_resolution");
        const pointer = gl.getUniformLocation(program, "u_pointer");
        const time = gl.getUniformLocation(program, "u_time");
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const target = { x: 0, y: 0 };
        const current = { x: 0, y: 0 };
        let width = 0;
        let height = 0;
        let frame = 0;
        let start = performance.now();
        let visible = true;

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            width = Math.max(1, Math.floor(rect.width * dpr));
            height = Math.max(1, Math.floor(rect.height * dpr));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
                gl.viewport(0, 0, width, height);
            }
        };

        const onPointer = (event: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            target.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
            target.y = 1 - ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2;
        };

        resize();

        const render = (now: number) => {
            if (!visible) return;
            current.x += (target.x - current.x) * 0.045;
            current.y += (target.y - current.y) * 0.045;
            gl.uniform2f(resolution, width, height);
            gl.uniform2f(pointer, current.x, current.y);
            gl.uniform1f(time, reduced ? 4.2 : (now - start) / 1000);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            if (!reduced) frame = requestAnimationFrame(render);
        };

        const observer = new ResizeObserver(() => resize());
        observer.observe(canvas);
        window.addEventListener("pointermove", onPointer, { passive: true });
        const onVisibility = () => {
            visible = document.visibilityState === "visible";
            if (visible && !reduced) {
                start = performance.now();
                frame = requestAnimationFrame(render);
            } else {
                cancelAnimationFrame(frame);
            }
        };
        document.addEventListener("visibilitychange", onVisibility);
        frame = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener("pointermove", onPointer);
            document.removeEventListener("visibilitychange", onVisibility);
            gl.deleteBuffer(buffer);
            gl.deleteProgram(program);
            gl.deleteShader(vertex);
            gl.deleteShader(fragment);
            gl.getExtension("WEBGL_lose_context")?.loseContext();
        };
    }, []);

    return <canvas ref={canvasRef} aria-hidden="true" className={cn("pointer-events-none block h-full w-full", className)} />;
}
