import './style.css'
import SegmentShader from './shaders/segment.wgsl?raw'
import LineShader from './shaders/connector.wgsl?raw'
import {WebGpu, webGpuMain} from "./webgpu.ts";
import {mat4, vec2, vec3} from "gl-matrix";
import {Segment} from "./segment.ts";
import {fps} from "./util.ts";
import {TinyColor} from "@ctrl/tinycolor";

const cSpring: number = 20

const vMin: number = 0
const vMax: number = 100

const aMax: number = 2

const aDamp: number = 2.5
const vDamp: number = 2.0

const activenessMin: number = 0.01
const activenessMax: number = 0.05

const fMouse: number = 75.0
const fActive: number = 200.0

const scale: number = 1.0
const sizeMin: number = scale * 0.1
const sizeMax: number = scale * 0.2

// 0 < thickness < 1
const thicknessMin: number = 0.95
const thicknessMax: number = 0.4

const boundaryThreshold: number = 0.01

const nEntities = 1
const lengthMin: number = 8
const lengthMax: number = 8
// const nEntities = 500
// const lengthMin: number = 5
// const lengthMax: number = 15

class Entity {
    readonly color: vec3

    readonly length: number
    readonly segments: Segment[]

    readonly a: vec2
    readonly activeness: number

    constructor(
        p0: vec2,
        length: number,
        color: vec3,
        size: number,
        thinness: number,
        activeness: number
    ) {
        this.color = color
        this.length = length
        this.segments = new Array<Segment>(length)
        for (let i = 0; i < length; i++) {
            this.segments[i] = new Segment(
                size * Math.exp(-(1 - thinness) * i),
                vec2.clone(p0),
                vec2.create(),
            )
        }

        this.a = vec2.create()
        this.activeness = activeness
    }

    public update(dt: number, mousePos: vec2, mouseDown: boolean, bounds: vec2) {
        const head = this.segments[0]
        const mass = head.size / sizeMin

        let dA = vec2.create()

        if (mouseDown) {
            const dir = vec2.sub(vec2.create(), mousePos, head.p)
            const len = vec2.len(dir)
            const dirN = vec2.normalize(vec2.create(), dir)

            vec2.add(dA, dA, vec2.scale(vec2.create(), dirN, Math.min(len, 1.0) * fMouse / mass))
        }

        // random movement
        if (Math.random() < this.activeness || vec2.len(head.v) < vMin) {
            vec2.add(dA, dA, vec2.random(vec2.create(), (0.5 + Math.random() * 0.5) * fActive / mass))
        }

        // update acceleration
        vec2.add(this.a, this.a, vec2.scale(vec2.create(), dA, dt))
        const aN = vec2.len(this.a)
        if (aN != 0 && aMax < aN) {
            vec2.scale(this.a, this.a, aMax / aN)
        }

        vec2.add(head.v, head.v, vec2.scale(vec2.create(), this.a, dt))

        // improved bounding box handling
        const [bx, by] = bounds
        const [px, py] = head.p

        const threshold = 1.0 - boundaryThreshold
        const nx = Math.max(0.0, Math.min(Math.abs(px) / bx, 1.0) - threshold)
        const ny = Math.max(0.0, Math.min(Math.abs(py) / by, 1.0) - threshold)

        const vBoundsAversion = vec2.fromValues(-Math.sign(px) * nx, -Math.sign(py) * ny)
        vec2.scale(vBoundsAversion, vBoundsAversion, vMax * dt)

        // update velocity
        vec2.add(head.v, head.v, vBoundsAversion)

        // limit velocity
        const vN = vec2.len(head.v)
        if (vN != 0 && vMax < vN) {
            vec2.scale(head.v, head.v, vMax / vN)
        }

        vec2.add(head.p, head.p, vec2.add(
            vec2.create(),
            vec2.scale(vec2.create(), head.v, dt),
            vec2.scale(vec2.create(), this.a, Math.pow(dt, 2.0) / 2.0),
        ))

        // Decay acceleration and velocity
        // FIXME: Give this a proper 'unit'
        vec2.scale(this.a, this.a, 1 / (1.0 + aDamp * dt))
        vec2.scale(head.v, head.v, 1 / (1.0 + vDamp * dt))

        if (this.length < 2) return

        let prev = head
        for (let i = 1; i < this.length; i++) {
            const seg = this.segments[i]

            const dp = vec2.sub(vec2.create(), prev.p, seg.p)
            // distance between centers
            const ldp = vec2.len(dp)

            if (ldp <= 0.0) continue
            vec2.normalize(dp, dp)
            const le = Math.max(0.0, ldp - (prev.size + seg.size))

            // update segment
            vec2.scale(
                seg.v,
                dp,
                cSpring * le,
            )

            vec2.add(seg.p, seg.p, vec2.scale(vec2.create(), seg.v, dt))
            vec2.scale(seg.v, seg.v, 1 / (1.0 + vDamp * dt))

            prev = seg
        }
    }
}

function setup(webGpu: WebGpu) {
    // FIXME: In theory checking if we actually use all segments could improve performance
    // const nSegments = Math.max(...entities.map(w => w.length))
    const nSegments = lengthMax

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
        return  {
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
        size: edbStride * nEntities,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    // <f32, vec2<f32>, vec2<f32>>
    const sdbSize = 0
    const sdbPosition = 8 // must be aligned to 8
    const sdbVelocity = 16 // must be aligned to 8
    const sdbStride = 8 + 8 + 8 // must be aligned to 8
    const segmentDataBuffer = device.createBuffer({
        label: 'Segment Data Buffer',
        size: sdbStride * nEntities * nSegments,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    function createBindGroup(pipeline: GPURenderPipeline) : GPUBindGroup {
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

    let mouseDown = false
    let mousePos = vec2.fromValues(0.0, 0.0)

    onmousedown = (e) => {
        mousePos = getMousePos(e)
        if (e.button === 0) {
            mouseDown = true
        }
    }
    onmouseup = (e) => {
        if (e.button === 0) {
            mouseDown = false
        }
    }

    onmousemove = (e) => {
        mousePos = getMousePos(e)
    }

    let paused = true // FIXME: Debug
    onkeydown = (e) => {
        if (e.key == ' ') {
            paused = !paused
        }
    }

    let viewTransform = mat4.create();

    const entities: Array<Entity> = new Array(nEntities)
    for (let i = 0; i < nEntities; i++) {

        const pos = vec2.fromValues(0.0, 0.0) // FIXME: Debug
        // const [bx, by] = bounds!
        // const px = -bx + 2.0 * Math.random() * bx
        // const py = -by + 2.0 * Math.random() * by
        // const pos = vec2.fromValues(px, py)

        const length = Math.floor(lengthMin + Math.random() * (lengthMax - lengthMin))
        const size = sizeMin + Math.random() * (sizeMax - sizeMin)
        const thickness = thicknessMin + Math.random() * (thicknessMax - thicknessMin)
        const activeness = activenessMin + Math.random() * (activenessMax - activenessMin)

        const h = Math.random() * 360.0
        const s = 50. + Math.random() * 50.
        const l = 30. + Math.random() * 60.
        const color = new TinyColor(`hsl(${h}, ${s}%, ${l}%)`)

        entities[i] = new Entity(
            pos,
            length,
            vec3.fromValues(color.r / 255.0, color.g / 255.0, color.b / 255.0),
            size,
            thickness,
            activeness
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

    let raFrameTime = 0
    let t0: number

    return function render() {
        const t1 = Date.now()
        if (t0 == null) t0 = t1
        let dt = (t1 - t0) / 1000
        t0 = t1

        raFrameTime = ((raFrameTime * 100) + dt) / (101)
        fps(1.0 / raFrameTime)

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
            entity.update(dt, mousePos, mouseDown, bounds)

            for (let j = 0; j < entity.segments.length; j++) {
                const seg = entity.segments[j]

                const sdbOffset = (i * nSegments + j) * sdbStride
                device.queue.writeBuffer(segmentDataBuffer, sdbOffset + sdbPosition,  seg.p as Float32Array)
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

async function main() {
    await webGpuMain(setup)
}

await main()