import {vec2} from "gl-matrix";

export class Segment {
    readonly size: number

    readonly p: vec2
    readonly v: vec2

    constructor(
        size: number,
        x: vec2,
        v: vec2,
    ) {
        this.size = size
        this.p = x
        this.v = v
    }
}