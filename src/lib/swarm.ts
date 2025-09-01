import {TinyColor} from "@ctrl/tinycolor";

import {WebGpu, webGpuMain} from "./webgpu.ts";
import {mat4, vec2, vec3} from "gl-matrix";
import {fps} from "./util.ts";
import {settings} from "../settings.ts";

import SegmentShader from '../resources/shaders/segment.wgsl?raw'
import LineShader from '../resources/shaders/connector.wgsl?raw'
import {Entity} from "./entity.ts";


function setup(webGpu: WebGpu) {
    // FIXME: In theory checking if we actually use all segments could improve performance
    // const nSegments = Math.max(...entities.map(w => w.length))
    const nSegments = settings.length.max

    const canvas = webGpu.canvas
    const gpu = webGpu.gpu
    const device = webGpu.device
    const context = webGpu.context

    // <x, y, z>
    const vertices = new Float32Array([
        ...[-1.0, -1.0, +0.0],
        ...[+1.0, -1.0, +0.0],
        ...[+1.0, +1.0, +0.0],
        ...[-1.0, +1.0, +0.0],
    ])

    const vertexBuffer = device.createBuffer({
        label: 'Vertex Buffer',
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })

    const indices = new Int32Array([0, 1, 2, 2, 3, 0])
    const indexBuffer = device.createBuffer({
        label: 'Index Buffer',
        size: indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    })

    // populate vertex buffer
    device.queue.writeBuffer(vertexBuffer, 0, vertices)
    device.queue.writeBuffer(indexBuffer, 0, indices)

    const vertexBuffers: GPUVertexBufferLayout[] = [
        {
            attributes: [
                {
                    shaderLocation: 0,
                    offset: 0,
                    format: "float32x3",
                },
            ],
            arrayStride: 12,
            stepMode: "vertex",
        }
    ]

    const segmentShaderModule = device.createShaderModule({
        code: SegmentShader
    })
    const lineShaderModule = device.createShaderModule({
        code: LineShader
    })

    function createPipelineDescriptor(module: GPUShaderModule): GPURenderPipelineDescriptor {
        return {
            vertex: {
                module: module,
                entryPoint: "vertex_main",
                buffers: vertexBuffers,
            },
            fragment: {
                module: module,
                entryPoint: "fragment_main",
                targets: [
                    {
                        format: gpu.getPreferredCanvasFormat(),
                        blend: {
                            // Think: We only apply colors if there's nothing there yet, so we can just render everything in order.
                            //        We could instead also render lines first and then segments in revers, and just always "overwrite".
                            color: {
                                srcFactor: 'one-minus-dst-alpha',
                                dstFactor: 'one',
                            },
                            alpha: {
                                srcFactor: 'one-minus-dst-alpha',
                                dstFactor: 'one',
                            }
                        },
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
    }

    const segmentPipelineDescriptor = createPipelineDescriptor(segmentShaderModule)
    const segmentPipeline = device.createRenderPipeline(segmentPipelineDescriptor)

    const linePipelineDescriptor = createPipelineDescriptor(lineShaderModule)
    const linePipeline = device.createRenderPipeline(linePipelineDescriptor)

    const goSegments = 0
    const goVpMatrix = 16
    const globalsBuffer = device.createBuffer({
        label: 'VP Matrix Buffer',
        size: 4 * 16 + 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    device.queue.writeBuffer(globalsBuffer, goSegments, new Uint32Array([nSegments]))

    // length, color
    // <u32 , vec3<f32>>
    const edbLength = 0
    const edbColor = 16  // must be aligned 16x
    const edbStride = 4 * 4 + 4 * 4 // must be aligned to 16x
    const entityDataBuffer = device.createBuffer({
        label: 'Entity Data Buffer',
        size: edbStride * settings.nEntities,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    // <f32, vec2<f32>, vec2<f32>>
    const sdbSize = 0
    const sdbPosition = 8 // must be aligned to 8
    const sdbVelocity = 16 // must be aligned to 8
    const sdbStride = 8 + 8 + 8 // must be aligned to 8
    const segmentDataBuffer = device.createBuffer({
        label: 'Segment Data Buffer',
        size: sdbStride * settings.nEntities * nSegments,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    function createBindGroup(pipeline: GPURenderPipeline): GPUBindGroup {
        return device.createBindGroup({
            label: 'Uniform Bind Group',
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: globalsBuffer,
                    },
                },
                {
                    binding: 1,
                    resource: {
                        buffer: entityDataBuffer,
                    },
                },
                {
                    binding: 2,
                    resource: {
                        buffer: segmentDataBuffer,
                    },
                },
            ]
        })
    }

    const lineBindGroup = createBindGroup(linePipeline)
    const segmentBindGroup = createBindGroup(segmentPipeline)

    let multisampleTexture: GPUTexture
    let size = {width: 0.0, height: 0.0}
    let aspect: number
    let bounds: vec2

    function onResize() {
        if (multisampleTexture != null) {
            multisampleTexture.destroy()
        }

        aspect = window.innerWidth / window.innerHeight
        if (aspect > 1) {
            bounds = vec2.fromValues(aspect, 1.0)
            size.width = device.limits.maxTextureDimension2D
            size.height = device.limits.maxTextureDimension2D / aspect
        } else {
            bounds = vec2.fromValues(1.0, 1.0 / aspect)
            size.width = device.limits.maxTextureDimension2D * aspect
            size.height = device.limits.maxTextureDimension2D
        }

        canvas.width = size.width
        canvas.height = size.height

        const canvasTexture = context.getCurrentTexture()
        multisampleTexture = device.createTexture({
            format: canvasTexture.format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
            size: [size.width, size.height],
            sampleCount: 4,
        })
    }

    onresize = onResize
    onResize()

    function getMousePos(e: MouseEvent): vec2 {
        const [bx, by] = bounds
        let x = (-1.0 + (e.clientX / visualViewport!.width * 2.0)) * bx
        let y = (+1.0 - (e.clientY / visualViewport!.height * 2.0)) * by
        return vec2.fromValues(x, y)
    }

    function getTouchPos(e: Touch): vec2 {
        const [bx, by] = bounds
        let x = (-1.0 + (e.clientX / visualViewport!.width * 2.0)) * bx
        let y = (+1.0 - (e.clientY / visualViewport!.height * 2.0)) * by
        return vec2.fromValues(x, y)
    }

    let mouseDown = false
    let mousePos = vec2.fromValues(0.0, 0.0)
    let paused = false

    canvas.onmousedown = (e) => {
        e.preventDefault()
        mousePos = getMousePos(e)
        if (e.button === 0) {
            mouseDown = true
        }
    }
    canvas.onmouseup = (e) => {
        e.preventDefault()
        if (e.button === 0) {
            mouseDown = false
        }
    }
    canvas.onmousemove = (e) => {
        e.preventDefault()
        mousePos = getMousePos(e)
    }

    canvas.ontouchmove = (e) => {
        e.preventDefault()
        const touch = e.touches[0]
        if (touch) {
            mousePos = getTouchPos(touch)
        }
    }
    canvas.ontouchend = (e) => {
        e.preventDefault()
        mouseDown = false
    }
    canvas.ontouchstart = (e) => {
        e.preventDefault()
        const touch = e.touches[0]
        if (touch) {
            mouseDown = true
            mousePos = getTouchPos(touch)
        }
    }

    onkeydown = (e) => {
        if (e.key == ' ') {
            paused = !paused
        }
    }

    let viewTransform = mat4.create();

    const entities: Array<Entity> = new Array(settings.nEntities)
    for (let i = 0; i < settings.nEntities; i++) {
        const [bx, by] = bounds!
        const px = -bx + 2.0 * Math.random() * bx
        const py = -by + 2.0 * Math.random() * by
        const pos = vec2.fromValues(px, py)

        const h = Math.random() * 360.0
        const s = 50. + Math.random() * 50.
        const l = 30. + Math.random() * 60.
        const color = new TinyColor(`hsl(${h}, ${s}%, ${l}%)`)

        entities[i] = new Entity(
            pos,
            Math.floor(settings.length.random()),
            vec3.fromValues(color.r / 255.0, color.g / 255.0, color.b / 255.0),
            settings.size.random(),
            settings.strength.random(),
            settings.tapering.random(),
            settings.activeness.random(),
        )
    }

    // FIXME: Might be more efficient to only have a single write call?
    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]
        const entityOffset = i * edbStride
        device.queue.writeBuffer(entityDataBuffer, entityOffset + edbLength, new Uint32Array([entity.length]))
        device.queue.writeBuffer(entityDataBuffer, entityOffset + edbColor, entity.color as Float32Array)

        for (let j = 0; j < entity.segments.length; j++) {
            const segment = entity.segments[j]
            const sdbOffset = (i * nSegments + j) * sdbStride
            device.queue.writeBuffer(segmentDataBuffer, sdbOffset + sdbSize, new Float32Array([segment.size]))
        }
    }

    let t0: number
    let frameTimeSmooth = 0
    let frameTimeSmoothing = 20

    return async function render() {
        const t1 = Date.now()
        if (t0 == null) t0 = t1
        let dt = (t1 - t0) / 1000
        t0 = t1

        frameTimeSmooth = ((frameTimeSmooth * frameTimeSmoothing) + dt) / (frameTimeSmoothing + 1)
        fps(1.0 / frameTimeSmooth)

        if (dt == 0) return; // skip first frame
        if (paused) dt = 0;

        const commandEncoder = device.createCommandEncoder()
        const clearColor: GPUColor = {r: 0.0, g: 0.0, b: 0.0, a: 0.0}

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

        // apply aspect ratio
        let vpMatrix = mat4.create()
        mat4.scale(vpMatrix, viewTransform, vec3.fromValues(1.0 / aspect, 1.0, 1.0))
        device.queue.writeBuffer(globalsBuffer, goVpMatrix, vpMatrix as Float32Array)

        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i]

            // frame times are very unstable so we need to split time steps if they get too big
            let mDt = dt
            while (settings.simMaxDt <= mDt) {
                entity.update(settings.simMaxDt, mousePos, mouseDown, bounds)
                mDt -= settings.simMaxDt
            }
            entity.update(mDt, mousePos, mouseDown, bounds)

            for (let j = 0; j < entity.segments.length; j++) {
                const seg = entity.segments[j]

                const sdbOffset = (i * nSegments + j) * sdbStride
                device.queue.writeBuffer(segmentDataBuffer, sdbOffset + sdbPosition, seg.p as Float32Array)
                device.queue.writeBuffer(segmentDataBuffer, sdbOffset + sdbVelocity, seg.v as Float32Array)
            }
        }

        const pass = commandEncoder.beginRenderPass(passDescriptor)
        // connectors
        pass.setPipeline(segmentPipeline)
        pass.setBindGroup(0, segmentBindGroup)
        pass.setVertexBuffer(0, vertexBuffer)
        pass.setIndexBuffer(indexBuffer, 'uint32')
        pass.drawIndexed(6, nSegments * entities.length)

        // segments
        pass.setPipeline(linePipeline)
        pass.setBindGroup(0, lineBindGroup)
        pass.setVertexBuffer(0, vertexBuffer)
        pass.setIndexBuffer(indexBuffer, 'uint32')
        pass.drawIndexed(6, nSegments * entities.length)

        pass.end()
        device.queue.submit([commandEncoder.finish()])
        return device.queue.onSubmittedWorkDone()
    }
}

export async function main() {
    await webGpuMain(setup)
}