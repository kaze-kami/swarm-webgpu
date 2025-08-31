import {Segment} from "./segment.ts";
import {vec2, vec3} from "gl-matrix";
import {settings} from "../settings.ts";

export class Entity {
    readonly length: number
    readonly segments: Segment[]

    readonly color: vec3

    private readonly a: vec2
    private readonly activeness: number
    private activity: number

    private readonly mass: number

    constructor(
        p0: vec2,
        length: number,
        color: vec3,
        size: number,
        strength: number,
        tapering: number,
        activeness: number
    ) {
        this.color = color
        this.length = length
        this.segments = new Array<Segment>(length)

        for (let i = 0; i < length; i++) {
            this.segments[i] = new Segment(
                size * Math.exp(-tapering * i),
                vec2.clone(p0),
                vec2.create(),
            )
        }

        let mass = 0.0
        for (let s of this.segments) {
            mass += s.size / settings.size.max
        }

        // We use strength as a constant to counteract the fact that as we do consider mass
        // but use constant external forces which makes its hard to find a good configuration
        // for large *and* small entities at once.
        // This basically removes the mass from F = m * a by introducing F' = F * s = m * a
        // with s ~ m
        // FIXME: figure out a way to make this nicely proportional
        //        to mass and length.
        //        For now: strength is only relative to size of the head
        //                 meaning a longer worm is less strong
        const kMass = strength * size / settings.size.min
        this.mass = mass / kMass
        // console.log(this.mass, mass, strength, size)

        this.a = vec2.create()
        this.activeness = activeness
        this.activity = 1.0
    }

    public update(dt: number, mousePos: vec2, mouseDown: boolean, bounds: vec2) {
        const head = this.segments[0]
        let dA = vec2.create()

        if (mouseDown) {
            const dir = vec2.sub(vec2.create(), mousePos, head.p)
            const len = vec2.len(dir)
            const dirN = vec2.normalize(vec2.create(), dir)

            vec2.add(dA, dA, vec2.scale(vec2.create(), dirN, Math.min(len, 1.0) * settings.fMouse / this.mass * dt))
        }

        // random movement
        this.activity += Math.random() * this.activeness
        if (1.0 <= this.activity || vec2.len(head.v) <= settings.vMin) {
            this.activity = 0
            vec2.add(dA, dA, vec2.random(vec2.create(), (0.5 + Math.random() * 0.5) * settings.fActive / this.mass))
            // console.log("Being active", dA[0], dA[1], dt)
        }

        // improved bounding box handling. this does not "crash into walls" but instead
        // attempts to avoid them.
        const [bx, by] = bounds
        const [px, py] = head.p

        const threshold = 1.0 - settings.boundaryThreshold
        const nx = Math.max(0.0, Math.min(Math.abs(px) / bx, 1.0) - threshold)
        const ny = Math.max(0.0, Math.min(Math.abs(py) / by, 1.0) - threshold)
        const aBounds = vec2.fromValues(-Math.sign(px) * nx, -Math.sign(py) * ny)
        vec2.add(dA, dA, vec2.scale(aBounds, aBounds, settings.boundaryForce / this.mass * dt))

        // update acceleration
        vec2.add(this.a, this.a, vec2.scale(vec2.create(), dA, dt))
        const aN = vec2.len(this.a)
        if (aN != 0 && settings.aMax < aN) {
            vec2.scale(this.a, this.a, settings.aMax / aN)
            // console.log("Too many gs")
        }

        vec2.add(head.v, head.v, vec2.scale(vec2.create(), this.a, dt))

        // limit velocity
        const vN = vec2.len(head.v)
        if (vN != 0 && settings.vMax < vN) {
            vec2.scale(head.v, head.v, settings.vMax / vN)
            // console.log("Too fast")
        }

        vec2.add(head.p, head.p, vec2.add(
            vec2.create(),
            vec2.scale(vec2.create(), head.v, dt),
            vec2.scale(vec2.create(), this.a, Math.pow(dt, 2.0) / 2.0),
        ))

        // Decay acceleration and velocity
        // FIXME: Give this a proper 'unit'
        vec2.scale(this.a, this.a, 1 / (1.0 + settings.aDamp * dt))
        vec2.scale(head.v, head.v, 1 / (1.0 + settings.vDamp * dt))

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
                settings.kSpring * le,
            )

            vec2.add(seg.p, seg.p, vec2.scale(vec2.create(), seg.v, dt))
            vec2.scale(seg.v, seg.v, 1 / (1.0 + settings.vDamp * dt))

            prev = seg
        }
    }
}