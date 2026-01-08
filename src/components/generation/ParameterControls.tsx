interface ParameterControlsProps {
  parameters: {
    aspectRatio: string
    resolution: number
    numOutputs: number
  }
  onParametersChange: (parameters: any) => void
  generationType: 'image' | 'video'
}

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4']
const RESOLUTIONS = [512, 1024, 2048]

export function ParameterControls({
  parameters,
  onParametersChange,
  generationType,
}: ParameterControlsProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/* Aspect Ratio */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Aspect Ratio:</span>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {ASPECT_RATIOS.map((ratio) => (
            <button
              key={ratio}
              onClick={() =>
                onParametersChange({ ...parameters, aspectRatio: ratio })
              }
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                parameters.aspectRatio === ratio
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      {/* Resolution */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Resolution:</span>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {RESOLUTIONS.map((res) => (
            <button
              key={res}
              onClick={() =>
                onParametersChange({ ...parameters, resolution: res })
              }
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                parameters.resolution === res
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {res}
            </button>
          ))}
        </div>
      </div>

      {/* Number of Outputs */}
      {generationType === 'image' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Images:</span>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {[1, 2, 4].map((num) => (
              <button
                key={num}
                onClick={() =>
                  onParametersChange({ ...parameters, numOutputs: num })
                }
                className={`px-3 py-1 rounded-md text-sm transition-colors ${
                  parameters.numOutputs === num
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

