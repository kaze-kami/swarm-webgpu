const divError = document.querySelector<HTMLDivElement>(`#error`)

export function error(msg: string, e: unknown | null = null) {
    console.error('Failed to initialize WebGPU', e)
    showError(msg)
}

function showError(content: string) {
    if (divError != null) {
        divError.style.display = 'block'
        divError.innerHTML = content
    }
}

const divFps = document.querySelector<HTMLDivElement>(`#fps`)
const fpsFormat = Intl.NumberFormat('en-US', {
    style: 'decimal',
    maximumFractionDigits: 2,
})

export function fps(value: number) {
    if (divFps != null) {
        divFps.innerHTML = `${fpsFormat.format(value)} FPS`
    }
}