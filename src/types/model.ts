export type ModelType = 'image' | 'video'

export interface ModelParameter {
  type: 'select' | 'number' | 'boolean' | 'string'
  label: string
  options?: string[] | number[]
  default?: any
  min?: number
  max?: number
  step?: number
  optional?: boolean
}

export interface ModelConfig {
  model_id: string
  name: string
  provider: string
  type: ModelType[]
  description?: string
  capabilities: {
    prompt_to_image?: boolean
    image_to_image?: boolean
    text_to_video?: boolean
    image_to_video?: boolean
    inpainting?: boolean
    outpainting?: boolean
  }
  parameters: Record<string, ModelParameter>
  api_endpoint: string
  pricing?: {
    per_image?: number
    per_video?: number
    currency: string
  }
}

export interface Model {
  id: string
  name: string
  provider: string
  type: ModelType[]
  config: ModelConfig
  isActive: boolean
  createdAt: Date
}

