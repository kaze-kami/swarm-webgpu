export class Range {
    readonly min: number
    readonly max: number

    constructor(min: number, max: number, scale: number = 1.0) {
        this.min = min * scale
        this.max = max * scale
    }

    public random(): number {
        return this.min + (this.max - this.min) * Math.random()
    }
}