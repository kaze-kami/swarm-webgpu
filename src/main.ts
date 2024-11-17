import './style.css'

const idError = 'error'
const idCanvas = 'canvas'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="${idError}"></div>
  <div>
      <canvas id="${idCanvas}">
        Your browser does not support the canvas element.
      </canvas>
  </div>
`


function showError(content: string) {
    const div = document.querySelector<HTMLDivElement>(`#${idError}`)
    if (div != null) {
        div.style.display = 'block'
        div.innerHTML = content
    }
}

async function setup() {
    const canvas = document.querySelector<HTMLCanvasElement>(`#${idCanvas}`)!;
    const context = canvas.getContext('webgpu')!;

    const gpu = navigator.gpu
    if (!gpu) throw Error("WebGPU not supported.");

    const adapter = await gpu.requestAdapter();
    if (!adapter) throw Error("Couldn’t request WebGPU adapter.");

    const device = await adapter.requestDevice();
    if (!device) throw Error("Couldn’t request WebGPU logical device.");

    context.configure({
        device: device,
        format: gpu.getPreferredCanvasFormat(),
        alphaMode: "premultiplied",
    })

    // <x, y, z, r, g, b, a>
    const vertices = new Float32Array([
        ...[ 0.0,  0.3, 0.0], ...[1.0, 0.0, 0.0, 0.0],
        ...[-0.2, -0.1, 0.0], ...[0.0, 1.0, 0.0, 0.0],
        ...[ 0.2, -0.1, 0.0], ...[0.0, 0.0, 1.0, 0.0],
    ])

    const vertexBuffer = device.createBuffer({
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })

    // populate vertex buffer
    device.queue.writeBuffer(vertexBuffer, 0, vertices, 0, vertices.length)

    const vertexBuffers: GPUVertexBufferLayout[] = [
        {
            attributes: [
                {
                    shaderLocation: 0,
                    offset: 0,
                    format: "float32x3",
                },
                {
                    shaderLocation: 1,
                    offset: 12,
                    format: "float32x4",
                }
            ],
            arrayStride: 28,
            stepMode: "vertex",
        }
    ]

    const shaders = `
        
        struct VertexData {
            @builtin(position) position: vec4f,
            @location(0) color: vec4f,
        }
        
        @vertex
        fn vertex_main(
            @location(0) position: vec4f,
            @location(1) color: vec4f,
        ) -> VertexData {
            return VertexData(
                position,
                color,
            );
        }
        
        @fragment
        fn fragment_main(data: VertexData) -> @location(0) vec4f {
            return data.color;
        }
    `

    const shaderModule = device.createShaderModule({
        code: shaders
    })

    const pipelineDescriptor: GPURenderPipelineDescriptor = {
        vertex: {
            module: shaderModule,
            entryPoint: "vertex_main",
            buffers: vertexBuffers,
        },
        fragment: {
            module: shaderModule,
            entryPoint: "fragment_main",
            targets: [
                {
                    format: gpu.getPreferredCanvasFormat(),
                }
            ]
        },
        primitive: {
            topology: "triangle-list",
        },
        multisample: {
            count: 4,
        },
        layout: "auto",
    }

    const pipeline = device.createRenderPipeline(pipelineDescriptor)

    let multisampleTexture: GPUTexture
    function onResize() {
        if (multisampleTexture != null) {
            multisampleTexture.destroy()
        }

        const scale = 10
        canvas.width = Math.min(window.innerWidth * scale, device.limits.maxTextureDimension2D)
        canvas.height = Math.min(window.innerHeight * scale, device.limits.maxTextureDimension2D)

        const canvasTexture = context.getCurrentTexture()
        multisampleTexture = device.createTexture({
            format: canvasTexture.format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
            size: [canvasTexture.width, canvasTexture.height],
            sampleCount: 4,
        })
    }
    // init textures
    onResize()

    async function update() {
        const commandEncoder = device.createCommandEncoder()
        const clearColor: GPUColor = { r: 0.1, g: 0.1, b: 0.2, a: 1.0 }

        const passDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    clearValue: clearColor,
                    loadOp: "clear",
                    storeOp: "store",
                    view: multisampleTexture.createView(),
                    // view: context.getCurrentTexture().createView(),
                    resolveTarget: context.getCurrentTexture().createView(),
                },
            ]
        }

        const pass = commandEncoder.beginRenderPass(passDescriptor)
        pass.setPipeline(pipeline)
        pass.setVertexBuffer(0, vertexBuffer)
        pass.draw(3)
        pass.end()

        device.queue.submit([commandEncoder.finish()])
    }

    setInterval(update, 10)
    window.addEventListener('resize', onResize)
}



async function main() {
    try {
        await setup()
    } catch (e: any) {
        console.error(e)
        showError(`Your browser does not support <a href="https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API#browser_compatibility">WebGPU</a>`)
    }
}

await main()