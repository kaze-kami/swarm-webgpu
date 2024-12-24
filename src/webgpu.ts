import {error} from "./util.ts";

export class WebGpu {
    public canvas: HTMLCanvasElement
    public gpu: GPU
    public device: GPUDevice
    public context: GPUCanvasContext


    constructor(
        canvas: HTMLCanvasElement,
        gpu: GPU,
        device: GPUDevice,
        context: GPUCanvasContext
    ) {
        this.canvas = canvas;
        this.gpu = gpu;
        this.device = device;
        this.context = context;
    }
}

export async function setupWebGpu(): Promise<WebGpu | null> {
    const canvas = document.querySelector<HTMLCanvasElement>(`#canvas`)!
    const context = canvas.getContext('webgpu')!

    const gpu = navigator.gpu
    if (!gpu) {
        error("WebGPU not supported.")
        return null
    }

    const adapter = await gpu.requestAdapter()
    if (!adapter) {
        error("Couldn’t request WebGPU adapter.")
        return null
    }

    const device = await adapter.requestDevice();
    if (!device) {
        error("Couldn’t request WebGPU logical device.")
        return null
    }

    context.configure({
        device: device,
        format: gpu.getPreferredCanvasFormat(),
        alphaMode: "premultiplied",
    })

    return new WebGpu(canvas, gpu, device, context)
}

type RenderFunction = () => Promise<undefined>
type SetupFunction = (gpu: WebGpu) => RenderFunction

export async function webGpuMain(
    setup: SetupFunction,
): Promise<void> {
    let webGpu: WebGpu | null
    try {
        webGpu = await setupWebGpu()
        if (webGpu == null) {
            error('Failed to initialize WebGPU')
            return
        }
    } catch (e) {
        error('Failed to initialize WebGPU', e)
        return
    }

    let renderFunction: RenderFunction
    try {
        renderFunction = setup(webGpu)
    } catch (e) {
        error('Failed to setup WebGPU', e)
        return
    }

    // function loop() {
    //     requestAnimationFrame(loop)
    //     renderFunction()
    // }
    // requestAnimationFrame(loop)

    while (true) {
        await renderFunction()
    }
}